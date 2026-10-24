/**
 * The pieces of the hosting move (epic reportsthatmatter-4g4d, docs/hosting-migration.md) that are pure: which
 * account is which, the SQL that copies rows, and the comparison of two R2 listings. The CLI that runs them against
 * Cloudflare is scripts/migrate-hosting.ts.
 */

/** A Cloudflare account this project can run on, and the wrangler flags that select it without touching wrangler's directory bindings. */
export type Account = { name: "atomatic" | "datopian"; accountId: string; wrangler: string[]; profile: string; databaseId: string };

export const ACCOUNTS: Record<Account["name"], Account> = {
  // office@atomatic.net: production until 2026-10-16, now `[env.atomatic]` in wrangler.toml (rollback and decommission only).
  atomatic: { name: "atomatic", accountId: "d342705a2f17c3e08a5dab494564e406", wrangler: ["--env", "atomatic", "--profile", "default"], profile: "default", databaseId: "5200e0db-733d-40d6-962e-2f1eb024f060" },
  // accounts@datopian.com (Workers Paid): production, the top level of wrangler.toml. `--profile datopian` because
  // ~/src/reportsthatmatter is bound to wrangler's atomatic `default` profile until Rufus rebinds it.
  datopian: { name: "datopian", accountId: "83025b28472d6aa2bf5ae59f3724aa78", wrangler: ["--env", "", "--profile", "datopian"], profile: "datopian", databaseId: "ceb6c2cc-f9a2-414c-8ff5-476da129e7ec" },
};

export const TABLES = ["marks", "search_index_versions", "report_versions", "passages"] as const;
export type Table = (typeof TABLES)[number];

/** Columns copied per table. `passages` is FTS5, so its rowid is copied explicitly: the per-report layout (migration 0004) names rowid runs. */
export const COLUMNS: Record<Table, string[]> = {
  marks: ["id", "report", "section", "paragraph", "exact", "prefix", "suffix", "page", "kind", "actor", "created_at"],
  search_index_versions: ["report", "content_version", "indexed_at", "layout"],
  report_versions: ["report", "content_hash", "published_at"],
  passages: ["rowid", "report", "section", "paragraph_id", "page", "body"],
};

export const sqlValue = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
};

/** Splits rows into statements that stay under `maxBytes` each (D1's statement limit is 100 KB). */
export function insertSql(table: Table, rows: Array<Record<string, unknown>>, maxBytes = 90_000, columns = COLUMNS[table]): string {
  const out: string[] = [];
  let batch: string[] = [];
  let size = 0;
  const head = `INSERT INTO ${table} (${columns.join(",")}) VALUES `;
  const flush = () => {
    if (batch.length) out.push(head + batch.join(",\n") + ";");
    batch = [];
    size = 0;
  };
  for (const r of rows) {
    const tuple = `(${columns.map((c) => sqlValue(r[c])).join(",")})`;
    const bytes = Buffer.byteLength(tuple) + 2;
    if (batch.length && size + bytes + head.length > maxBytes) flush();
    batch.push(tuple);
    size += bytes;
  }
  flush();
  return out.join("\n") + (out.length ? "\n" : "");
}

export type R2Object = { key: string; etag: string; size: number };

/** What to copy so `target` holds every object of `source` with the same ETag (an MD5 for single-part uploads). */
export function r2Diff(source: R2Object[], target: R2Object[]): { missing: R2Object[]; changed: R2Object[]; extra: R2Object[]; same: number } {
  const there = new Map(target.map((o) => [o.key, o]));
  const here = new Set(source.map((o) => o.key));
  const missing: R2Object[] = [];
  const changed: R2Object[] = [];
  let same = 0;
  for (const o of source) {
    const t = there.get(o.key);
    if (!t) missing.push(o);
    else if (t.etag !== o.etag || t.size !== o.size) changed.push(o);
    else same++;
  }
  return { missing, changed, extra: target.filter((o) => !here.has(o.key)), same };
}

export type IndexVersion = { report: string; content_version: string; indexed_at: number; layout: string | null };

/** Reports whose search index on the source differs from the target's copy (re-copy their passages). */
export function staleReports(source: IndexVersion[], target: IndexVersion[]): string[] {
  const t = new Map(target.map((r) => [r.report, r]));
  return source.filter((s) => {
    const x = t.get(s.report);
    return !x || x.content_version !== s.content_version || Number(x.indexed_at) !== Number(s.indexed_at);
  }).map((s) => s.report);
}

/** The message for RTM_CF_ACCOUNT=atomatic: the old account's Worker, D1 and R2 were deleted on 2026-10-24 (reportsthatmatter-4g4d.7). */
export const ATOMATIC_GONE = "RTM_CF_ACCOUNT=atomatic: the atomatic account's Worker, D1 and R2 were decommissioned on 2026-10-24 (reportsthatmatter-4g4d.7, .8); production is datopian. Unset RTM_CF_ACCOUNT.";

/** The account the scripts' remote wrangler calls go to: `RTM_CF_ACCOUNT=datopian` (the default and the only account left). */
export function accountFromEnv(env: NodeJS.ProcessEnv = process.env): Account {
  const name = env.RTM_CF_ACCOUNT || "datopian";
  if (name === "atomatic") throw new Error(ATOMATIC_GONE);
  if (name !== "datopian") throw new Error(`RTM_CF_ACCOUNT=${name}: expected datopian`);
  return ACCOUNTS[name];
}

export const accountArgs = (env: NodeJS.ProcessEnv = process.env): string[] => accountFromEnv(env).wrangler;

/** A publish with RTM_CF_ACCOUNT=atomatic would split across accounts (4g4d.8) and the account is gone: refuse. Null: go ahead. */
export function refuseAtomaticPublish(env: NodeJS.ProcessEnv): string | null {
  return (env.RTM_CF_ACCOUNT || PRODUCTION) === "atomatic" ? `refusing to publish with ${ATOMATIC_GONE}` : null;
}

/** The account that serves reportsthatmatter.org (since the cutover on 2026-10-16). */
export const PRODUCTION: Account["name"] = "datopian";
export const OVERWRITE_FLAG = "--overwrite-production";

/**
 * Why `command` must not run against `to` without OVERWRITE_FLAG, or null when it may. After the cutover the default
 * direction (atomatic to datopian) writes into production: `import-d1` wipes every table, `sync-d1 --versions` replaces
 * the version tables and passages with the old account's, and `sync-r2` would overwrite objects whose ETag differs.
 * Appending marks (`sync-d1`) and copying missing objects (`sync-r2`) stay allowed: they delete and replace nothing.
 */
export function refuseOverwrite(command: string, to: Account, flags: { versions?: boolean; changedObjects?: number; overwrite?: boolean }): string | null {
  if (to.name !== PRODUCTION || flags.overwrite) return null;
  const why =
    command === "import-d1" ? "wipes every D1 table on it and loads an export"
    : command === "sync-d1" && flags.versions ? "replaces its report_versions, search_index_versions and reindexed passages with the source's (older since the cutover)"
    : command === "sync-r2" && (flags.changedObjects ?? 0) > 0 ? `overwrites ${flags.changedObjects} of its objects with the source's`
    : null;
  return why ? `refusing: ${command} ${why}, and ${to.name} is production. Re-run with ${OVERWRITE_FLAG} only for a deliberate re-copy (docs/hosting-migration.md).` : null;
}
