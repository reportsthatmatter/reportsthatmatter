/* Measures what a release's search reindex costs in D1 row writes: the incremental diff against the old full rewrite.
 *
 *   pnpm exec tsx scripts/measure-reindex.mjs <commit>
 *
 * <commit> is a commit that changed reports/<id>/full.md (a pin-bump re-ingest). For every registry report it
 * renders the text at <commit>^ and at <commit>, loads the old text's index into a scratch local D1 (a throwaway
 * persist dir; nothing of yours and nothing remote is touched), then applies the new text twice from that same
 * starting point, once as the incremental diff and once as the full DELETE + INSERT, counting SQLite's change
 * counter, which includes FTS5's shadow tables (D1 bills in the same unit: see DEFAULT_COST in lib/reindex.ts).
 *
 * Example, the v0.17.0 re-ingest that exhausted the free tier (b2f7ef3): see docs/ARCHITECTURE.md "Search".
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "yaml";
import { extractPassages, renderArtifacts } from "@rtm/ingest";
import { fullStatements, incrementalStatements, insertStatements, planReindex } from "./lib/reindex.ts";

const root = join(import.meta.dirname, "..");
const commit = process.argv[2];
if (!commit) {
  console.error("Usage: tsx scripts/measure-reindex.mjs <commit that changed reports/*/full.md>");
  process.exit(2);
}
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });

const passagesOf = (markdown) => {
  const { meta, fragments } = renderArtifacts(markdown);
  return meta.sections.flatMap((s) => extractPassages(fragments[s.slug]).map((p) => ({ section: s.title, paragraph_id: p.paragraphId, page: p.page, body: p.text })));
};

const persist = mkdtempSync(join(tmpdir(), "rtm-measure-reindex-"));
execFileSync("pnpm", ["wrangler", "d1", "migrations", "apply", "reportsthatmatter-marks", "--local", "--persist-to", persist], { cwd: root, stdio: "ignore" });
const { env, dispose } = await getPlatformProxy({ configPath: join(root, "wrangler.toml"), persist: { path: join(persist, "v3") } });
const db = env.DB;

const split = (sql) => sql.map((s) => s.replace(/;$/, ""));
const apply = async (statements) => {
  let changes = 0;
  for (const s of split(statements)) changes += (await db.prepare(s).run()).meta.changes;
  return changes;
};
const stored = async (id) =>
  (await db.prepare("SELECT rowid AS rowid, section, paragraph_id, page, body FROM passages WHERE report = ? ORDER BY rowid").bind(id).all()).results;

const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
const rows = [];
for (const report of registry.reports) {
  const path = report.source_path;
  let oldText;
  try {
    oldText = git("show", `${commit}^:${path}`);
  } catch {
    continue; // not in the registry at that commit
  }
  const newText = git("show", `${commit}:${path}`);
  const before = passagesOf(oldText);
  const after = passagesOf(newText);
  const reset = async () => {
    await db.prepare("DELETE FROM passages WHERE report = ?").bind(report.id).run();
    await db.prepare("DELETE FROM search_index_versions WHERE report = ?").bind(report.id).run();
    await apply(insertStatements(report.id, before)); // the setup is not counted
  };

  await reset();
  const plan = planReindex(after, await stored(report.id));
  const incremental = await apply(incrementalStatements(report.id, plan, "new", 2));
  const inc_ok = (await stored(report.id)).length === after.length;
  await reset();
  const full = await apply(fullStatements(report.id, after, "new", 2));
  rows.push({ id: report.id, paragraphs: after.length, changed: plan.changed, added: plan.added, removed: plan.removed, incremental, full, inc_ok });
}
await dispose();

const pad = (v, n) => String(v).padStart(n);
console.log(`search reindex writes for the release at ${commit.slice(0, 9)} (SQLite changes incl. FTS5 shadow tables, scratch local D1)\n`);
console.log(`${"report".padEnd(26)}${pad("paragraphs", 11)}${pad("changed", 9)}${pad("new", 7)}${pad("gone", 7)}${pad("incremental", 13)}${pad("full", 9)}${pad("saved", 8)}`);
let ti = 0, tf = 0;
for (const r of rows) {
  ti += r.incremental; tf += r.full;
  console.log(`${r.id.padEnd(26)}${pad(r.paragraphs.toLocaleString(), 11)}${pad(r.changed, 9)}${pad(r.added, 7)}${pad(r.removed, 7)}${pad(r.incremental.toLocaleString(), 13)}${pad(r.full.toLocaleString(), 9)}${pad(r.full ? Math.round(100 * (1 - r.incremental / r.full)) + "%" : "-", 8)}${r.inc_ok ? "" : "  ✗ index differs from the new text"}`);
}
console.log(`${"all".padEnd(26)}${pad("", 11)}${pad("", 9)}${pad("", 7)}${pad("", 7)}${pad(ti.toLocaleString(), 13)}${pad(tf.toLocaleString(), 9)}${pad(Math.round(100 * (1 - ti / tf)) + "%", 8)}`);
console.log(`\nfree tier: 100,000 row writes a day. Full rewrite: ${(tf / 100000 * 100).toFixed(0)}% of a day. Incremental: ${(ti / 100000 * 100).toFixed(1)}%.`);
process.exit(rows.some((r) => !r.inc_ok) ? 1 : 0);
