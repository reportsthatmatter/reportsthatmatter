/**
 * The pieces of the hosting move (epic reportsthatmatter-4g4d, docs/hosting-migration.md) that are pure: which
 * account is which, the SQL that copies rows, and the comparison of two R2 listings. The CLI that runs them against
 * Cloudflare is scripts/migrate-hosting.ts.
 */

/** A Cloudflare account this project can run on, and the wrangler flags that select it without touching wrangler's directory bindings. */
export type Account = { name: "atomatic" | "datopian"; accountId: string; wrangler: string[]; profile: string; databaseId: string };

export const ACCOUNTS: Record<Account["name"], Account> = {
  // office@atomatic.net: production until the cutover. `--profile default` is explicit so the call does not depend on the cwd's binding.
  atomatic: { name: "atomatic", accountId: "d342705a2f17c3e08a5dab494564e406", wrangler: ["--profile", "default"], profile: "default", databaseId: "5200e0db-733d-40d6-962e-2f1eb024f060" },
  // accounts@datopian.com (Workers Paid): `[env.datopian]` in wrangler.toml carries its account_id and bindings.
  datopian: { name: "datopian", accountId: "83025b28472d6aa2bf5ae59f3724aa78", wrangler: ["--env", "datopian", "--profile", "datopian"], profile: "datopian", databaseId: "ceb6c2cc-f9a2-414c-8ff5-476da129e7ec" },
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

/**
 * The account the scripts' remote wrangler calls go to: `RTM_CF_ACCOUNT=datopian|atomatic`. Unset means no flags,
 * i.e. wrangler's own resolution (this tree's directory binding: atomatic until the cutover).
 */
export function accountFromEnv(env: NodeJS.ProcessEnv = process.env): Account | null {
  const name = env.RTM_CF_ACCOUNT;
  if (!name) return null;
  if (name !== "atomatic" && name !== "datopian") throw new Error(`RTM_CF_ACCOUNT=${name}: expected atomatic or datopian`);
  return ACCOUNTS[name];
}

export const accountArgs = (env: NodeJS.ProcessEnv = process.env): string[] => accountFromEnv(env)?.wrangler ?? [];
