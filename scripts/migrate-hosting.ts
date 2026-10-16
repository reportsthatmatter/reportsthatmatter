/* Copy production's data from the atomatic Cloudflare account to the Datopian one (epic reportsthatmatter-4g4d; runbook docs/hosting-migration.md).
 *
 *   pnpm migrate-hosting inventory            D1 rows per table and R2 objects/bytes on both accounts (source reads: a few hundred rows)
 *   pnpm migrate-hosting export-d1            read production D1 into build/hosting/ (every row once: ~45k rows read of the 5M/day)
 *   pnpm migrate-hosting import-d1            wipe the Datopian tables and load build/hosting/; then verify-d1
 *   pnpm migrate-hosting verify-d1            Datopian rows and checksums per table against build/hosting/manifest.json
 *   pnpm migrate-hosting sync-d1 [--dry-run]  marks written on production since the export/import (or the last sync), appended on Datopian
 *       --versions                            also copy report_versions and search_index_versions, and the passages of any report
 *                                             reindexed since; only before the cutover (afterwards Datopian's are the newer)
 *   pnpm migrate-hosting sync-r2 [--dry-run]  copy every R2 object missing or different on Datopian, then compare every ETag
 *
 *   --from atomatic --to datopian             the default direction; --from datopian --to atomatic reverses it (rollback)
 *
 * Nothing here writes to the source account. Credentials: wrangler's profiles (`--profile default` = atomatic,
 * `--profile datopian`), never the directory bindings; the R2 copy uses `wrangler auth token` for each profile.
 */
import "./lib/help.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { metaTotals, recordUsage } from "./lib/d1-usage";
import { ACCOUNTS, COLUMNS, insertSql, r2Diff, staleReports, TABLES, type Account, type IndexVersion, type R2Object, type Table } from "./lib/migrate-hosting";

const root = join(import.meta.dirname, "..");
const out = join(root, "build", "hosting");
const args = process.argv.slice(2);
const command = args[0];
const flag = (n: string) => args.includes(n);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const from = ACCOUNTS[(opt("--from") ?? "atomatic") as Account["name"]];
const to = ACCOUNTS[(opt("--to") ?? "datopian") as Account["name"]];
if (!from || !to || from === to) throw new Error("--from and --to must be atomatic and datopian, one each");
const DB = "reportsthatmatter-marks";
const BUCKET = "reportsthatmatter-content";
const fmt = (n: number) => n.toLocaleString("en-US");

type Row = Record<string, unknown>;

function wrangler(account: Account, a: string[], input?: string): string {
  try {
    return execFileSync("pnpm", ["-s", "wrangler", ...a, ...account.wrangler], { cwd: root, encoding: "utf8", input, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"], maxBuffer: 512 * 1024 * 1024 });
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string; message: string };
    throw new Error(`wrangler ${a.slice(0, 3).join(" ")} on ${account.name}: ${(e.stderr ?? "") + (e.stdout ?? "") || e.message}`);
  }
}

const usage = { rowsRead: 0, rowsWritten: 0 };
function query(account: Account, sql: string): Row[] {
  const text = wrangler(account, ["d1", "execute", DB, "--remote", "--json", "--command", sql]);
  const result = JSON.parse(text.slice(text.indexOf("[")));
  const t = metaTotals(result);
  if (account.name === "atomatic") recordUsage({ label: `migrate-hosting ${sql}`, ...t });
  usage.rowsRead += t.rowsRead;
  usage.rowsWritten += t.rowsWritten;
  return result.flatMap((s: { results: Row[] }) => s.results ?? []);
}

function executeFile(account: Account, file: string) {
  if (account.name === "atomatic" && from.name === "atomatic") throw new Error("refusing to write to the source account");
  const text = wrangler(account, ["d1", "execute", DB, "--remote", "--yes", "--file", file]);
  process.stdout.write(text.split("\n").filter((l) => /rows|Executed|written|✘|error/i.test(l)).map((l) => `    ${l.trim()}\n`).join(""));
}

/** Every row of a table, paged on its key so each page is a seek, not a scan (passages: FTS5 seeks on rowid). */
function readTable(account: Account, table: Table): Row[] {
  const cols = COLUMNS[table].join(", ");
  if (table === "search_index_versions" || table === "report_versions") return query(account, `SELECT ${cols} FROM ${table} ORDER BY report`);
  const key = table === "marks" ? "id" : "rowid";
  const page = table === "marks" ? 2000 : 500;
  const rows: Row[] = [];
  for (let after = -1; ; ) {
    const got = query(account, `SELECT ${cols} FROM ${table} WHERE ${key} > ${after} ORDER BY ${key} LIMIT ${page}`);
    rows.push(...got);
    if (got.length < page) return rows;
    after = Number(got[got.length - 1][key]);
    if (table === "passages") process.stdout.write(`\r    passages: ${fmt(rows.length)} rows`);
  }
}

const digest = (table: Table, rows: Row[]) => {
  const h = createHash("sha256");
  for (const r of rows) h.update(JSON.stringify(COLUMNS[table].map((c) => r[c] ?? null)) + "\n");
  return h.digest("hex").slice(0, 16);
};

type Manifest = { from: string; at: string; tables: Record<Table, { rows: number; digest: string; maxKey?: number }> };
const manifestPath = join(out, "manifest.json");
const statePath = join(out, "state.json");
const readJson = <T>(p: string): T | null => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

function exportD1() {
  mkdirSync(out, { recursive: true });
  const manifest: Manifest = { from: from.name, at: new Date().toISOString(), tables: {} as Manifest["tables"] };
  for (const table of TABLES) {
    const rows = readTable(from, table);
    if (table === "passages") process.stdout.write("\n");
    writeFileSync(join(out, `${table}.sql`), insertSql(table, rows));
    const key = table === "marks" ? "id" : table === "passages" ? "rowid" : null;
    manifest.tables[table] = { rows: rows.length, digest: digest(table, rows), ...(key ? { maxKey: rows.reduce((m, r) => Math.max(m, Number(r[key])), 0) } : {}) };
    console.log(`  ${table}: ${fmt(rows.length)} rows, digest ${manifest.tables[table].digest}`);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${out}/ (rows read on ${from.name}: ${fmt(usage.rowsRead)})`);
}

function importD1() {
  const manifest = readJson<Manifest>(manifestPath);
  if (!manifest) throw new Error(`no ${manifestPath}: run export-d1 first`);
  console.log(`Loading the ${manifest.from} export of ${manifest.at} into ${to.name}`);
  writeFileSync(join(out, "wipe.sql"), TABLES.map((t) => `DELETE FROM ${t};`).join("\n") + "\n");
  executeFile(to, join(out, "wipe.sql"));
  for (const table of TABLES) {
    console.log(`  ${table}`);
    executeFile(to, join(out, `${table}.sql`));
  }
  writeFileSync(statePath, JSON.stringify({ marksWatermark: manifest.tables.marks.maxKey ?? 0, importedAt: new Date().toISOString(), exportAt: manifest.at }, null, 2) + "\n");
  verifyD1();
}

function verifyD1(): boolean {
  const manifest = readJson<Manifest>(manifestPath);
  if (!manifest) throw new Error(`no ${manifestPath}: run export-d1 first`);
  let ok = true;
  for (const table of TABLES) {
    const rows = readTable(to, table);
    if (table === "passages") process.stdout.write("\n");
    const d = digest(table, rows);
    const want = manifest.tables[table];
    const same = rows.length === want.rows && d === want.digest;
    ok &&= same;
    console.log(`  ${same ? "ok  " : "DIFF"} ${table}: ${to.name} ${fmt(rows.length)} rows ${d}, export ${fmt(want.rows)} rows ${want.digest}`);
  }
  console.log(ok ? "D1 copy matches the export." : "D1 copy differs from the export (rows written on the target since the import show here too).");
  if (!ok) process.exitCode = 1;
  return ok;
}

function syncD1() {
  const state = readJson<{ marksWatermark: number }>(statePath);
  if (!state) throw new Error(`no ${statePath}: run import-d1 first`);
  const dry = flag("--dry-run");
  const fresh = query(from, `SELECT ${COLUMNS.marks.join(", ")} FROM marks WHERE id > ${state.marksWatermark} ORDER BY id`);
  console.log(`marks: ${fresh.length} written on ${from.name} since id ${state.marksWatermark}`);
  const parts: string[] = [];
  // Appended without their ids: once the target takes its own writes the ids would collide. Nothing refers to a mark by id.
  if (fresh.length) parts.push(insertSql("marks", fresh, 90_000, COLUMNS.marks.filter((c) => c !== "id")));
  if (flag("--versions")) {
    const src = query(from, `SELECT ${COLUMNS.search_index_versions.join(", ")} FROM search_index_versions`) as IndexVersion[];
    const dst = query(to, `SELECT ${COLUMNS.search_index_versions.join(", ")} FROM search_index_versions`) as IndexVersion[];
    const stale = staleReports(src, dst);
    console.log(`search index: ${stale.length ? stale.join(", ") : "no report"} reindexed on ${from.name} since the copy`);
    for (const report of stale) {
      const layout = JSON.parse(String(src.find((s) => s.report === report)?.layout ?? "null"));
      if (!layout?.runs) throw new Error(`${report}: no layout on ${from.name}; run export-d1 and import-d1 instead`);
      const rows = layout.runs.flatMap(([lo, hi]: [number, number]) => query(from, `SELECT ${COLUMNS.passages.join(", ")} FROM passages WHERE rowid BETWEEN ${lo} AND ${hi} ORDER BY rowid`)).filter((r: Row) => r.report === report);
      parts.push(`DELETE FROM passages WHERE report = '${report.replace(/'/g, "''")}';`, insertSql("passages", rows));
    }
    const versions = query(from, `SELECT ${COLUMNS.report_versions.join(", ")} FROM report_versions`);
    parts.push("DELETE FROM report_versions;", insertSql("report_versions", versions), "DELETE FROM search_index_versions;", insertSql("search_index_versions", src));
  }
  if (!parts.length) return console.log("Nothing to sync.");
  const file = join(out, `sync-${Date.now()}.sql`);
  writeFileSync(file, parts.join("\n") + "\n");
  if (dry) return console.log(`--dry-run: would apply ${file} to ${to.name}`);
  executeFile(to, file);
  const maxId = fresh.reduce((m, r) => Math.max(m, Number(r.id)), state.marksWatermark);
  writeFileSync(statePath, JSON.stringify({ ...state, marksWatermark: maxId, syncedAt: new Date().toISOString() }, null, 2) + "\n");
  console.log(`Synced; watermark now ${maxId} (rows read on ${from.name}: ${fmt(usage.rowsRead)})`);
}

// R2, through the REST API with each profile's OAuth token (wrangler has no object listing).
const tokens = new Map<string, string>();
function token(account: Account): string {
  if (!tokens.has(account.name)) {
    const text = execFileSync("pnpm", ["-s", "wrangler", "auth", "token", "--json", "--profile", account.profile], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    tokens.set(account.name, JSON.parse(text.slice(text.indexOf("{"))).token);
  }
  return tokens.get(account.name)!;
}
const r2Url = (account: Account, rest = "") => `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/r2/buckets/${BUCKET}/objects${rest}`;
const keyPath = (key: string) => "/" + key.split("/").map(encodeURIComponent).join("/");

async function r2List(account: Account): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  for (let cursor = ""; ; ) {
    const res = await fetch(r2Url(account, `?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), { headers: { authorization: `Bearer ${token(account)}` }, signal: AbortSignal.timeout(60_000) });
    const body = await res.json();
    if (!body.success) throw new Error(`R2 list on ${account.name}: ${JSON.stringify(body.errors)}`);
    objects.push(...body.result.map((o: R2Object) => ({ key: o.key, etag: o.etag, size: o.size })));
    cursor = body.result_info?.cursor ?? "";
    if (!body.result_info?.is_truncated || !cursor) return objects;
  }
}

async function r2Copy(o: R2Object) {
  for (let attempt = 1; ; attempt++) {
    try {
      const got = await fetch(r2Url(from, keyPath(o.key)), { headers: { authorization: `Bearer ${token(from)}` }, signal: AbortSignal.timeout(60_000) });
      if (got.status === 401) tokens.delete(from.name); // the OAuth token expired: `wrangler auth token` refreshes it
      if (!got.ok) throw new Error(`GET ${o.key}: ${got.status}`);
      const body = Buffer.from(await got.arrayBuffer());
      const put = await fetch(r2Url(to, keyPath(o.key)), { method: "PUT", headers: { authorization: `Bearer ${token(to)}`, "content-type": got.headers.get("content-type") ?? "application/octet-stream" }, body, signal: AbortSignal.timeout(120_000) });
      if (put.status === 401) tokens.delete(to.name);
      if (!put.ok) throw new Error(`PUT ${o.key}: ${put.status} ${await put.text()}`);
      return;
    } catch (e) {
      if (attempt >= 6) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt * attempt));
    }
  }
}

async function syncR2() {
  const [src, dst] = await Promise.all([r2List(from), r2List(to)]);
  const diff = r2Diff(src, dst);
  const bytes = (os: R2Object[]) => os.reduce((t, o) => t + o.size, 0);
  console.log(`R2 ${BUCKET}: ${from.name} ${fmt(src.length)} objects (${fmt(bytes(src))} bytes); ${to.name} ${fmt(dst.length)}; missing ${fmt(diff.missing.length)}, changed ${fmt(diff.changed.length)}, extra on ${to.name} ${fmt(diff.extra.length)}`);
  const todo = [...diff.missing, ...diff.changed];
  if (flag("--dry-run") || !todo.length) return;
  let done = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let o = queue.shift(); o; o = queue.shift()) {
      await r2Copy(o);
      if (++done % 25 === 0 || done === todo.length) process.stdout.write(`\r  copied ${fmt(done)}/${fmt(todo.length)}`);
    }
  }));
  process.stdout.write("\n");
  const after = r2Diff(src, await r2List(to));
  const ok = !after.missing.length && !after.changed.length;
  console.log(ok ? `Every one of ${fmt(src.length)} objects is on ${to.name} with the same ETag and size.` : `Still missing ${after.missing.length}, changed ${after.changed.length}`);
  if (!ok) process.exitCode = 1;
}

async function inventory() {
  for (const account of [from, to]) {
    const counts = query(account, "SELECT (SELECT count(*) FROM marks) AS marks, (SELECT max(id) FROM marks) AS max_mark, (SELECT count(*) FROM report_versions) AS report_versions, (SELECT count(*) FROM search_index_versions) AS search_index_versions, (SELECT group_concat(layout, '\n') FROM search_index_versions) AS layouts")[0];
    const passages = String(counts.layouts ?? "").split("\n").filter(Boolean).reduce((t, l) => t + (JSON.parse(l).n ?? 0), 0);
    const objects = await r2List(account);
    console.log(`${account.name} (${account.accountId}):`);
    console.log(`  D1 ${DB}: marks ${counts.marks} (max id ${counts.max_mark}), report_versions ${counts.report_versions}, search_index_versions ${counts.search_index_versions}, passages ${fmt(passages)} (from the layouts)`);
    console.log(`  R2 ${BUCKET}: ${fmt(objects.length)} objects, ${fmt(objects.reduce((t, o) => t + o.size, 0))} bytes`);
  }
}

const commands: Record<string, () => unknown> = { inventory, "export-d1": exportD1, "import-d1": importD1, "verify-d1": verifyD1, "sync-d1": syncD1, "sync-r2": syncR2 };
if (!commands[command]) {
  console.error(`usage: pnpm migrate-hosting ${Object.keys(commands).join("|")} (see --help)`);
  process.exit(2);
}
await commands[command]();
