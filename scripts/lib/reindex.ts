/**
 * Search reindexing that writes only what changed (reportsthatmatter-h6b, -ewm0).
 *
 * The search index is one FTS5 table, `passages`, a row per citable paragraph. Rewriting a report's rows
 * for every publish (DELETE the report, INSERT all of it) cost about 6 D1 row writes per paragraph, so one
 * release of ten reports spent the free tier's 100,000 daily row writes and the third publish failed.
 * Most of a release leaves most paragraphs alone, so this compares what the index holds with what the
 * new prerender would index, by a hash of each paragraph, and writes only the difference.
 *
 * No state table: the comparison reads the report's rows back from D1 (reads are cheap and free-tier
 * generous; writes are the scarce thing) and hashes them here. That makes the diff correct by
 * construction, with nothing to drift from the index it describes: a half-applied earlier run, a legacy
 * full reindex or a hand edit are all repaired by the next run, which diffs what is really there.
 *
 * Pure: no I/O, so tests can run it on synthetic passages.
 */
import { createHash } from "node:crypto";

export type Passage = { section: string; paragraph_id: string; page: string | null; body: string };
export type StoredPassage = Passage & { rowid: number };

/** What a paragraph is, for comparison: every column the index stores except the report. */
export function passageHash(p: Passage): string {
  return createHash("sha256")
    .update(p.section).update("\0")
    .update(p.paragraph_id).update("\0")
    .update(p.page ?? "\u0001").update("\0")
    .update(p.body)
    .digest("hex")
    .slice(0, 16);
}

export type Plan = {
  /** Paragraphs to write: new, or whose text, section or page changed. In document order. */
  insert: Passage[];
  /** Rowids to remove: paragraphs gone, or replaced by an `insert`. */
  deleteRowids: number[];
  unchanged: number;
  added: number;
  changed: number;
  removed: number;
  /** What the index holds now / will hold. */
  stored: number;
  local: number;
};

/**
 * Paragraph ids are unique within a report in practice; if one repeats, the nth stored copy is compared
 * with the nth local copy, so a duplicate can never make the diff lose a row.
 */
function keyed<T extends { paragraph_id: string }>(rows: T[]): Map<string, T> {
  const seen = new Map<string, number>();
  const out = new Map<string, T>();
  for (const row of rows) {
    const n = seen.get(row.paragraph_id) ?? 0;
    seen.set(row.paragraph_id, n + 1);
    out.set(n === 0 ? row.paragraph_id : `${row.paragraph_id}\u0000${n}`, row);
  }
  return out;
}

export function planReindex(local: Passage[], stored: StoredPassage[]): Plan {
  const have = keyed(stored);
  const want = keyed(local);
  const insert: Passage[] = [];
  const deleteRowids: number[] = [];
  let unchanged = 0;
  let added = 0;
  let changed = 0;
  let removed = 0;

  for (const [key, passage] of want) {
    const old = have.get(key);
    if (!old) {
      insert.push(passage);
      added++;
    } else if (passageHash(old) === passageHash(passage)) {
      unchanged++;
    } else {
      insert.push(passage);
      deleteRowids.push(old.rowid);
      changed++;
    }
  }
  for (const [key, old] of have) {
    if (!want.has(key)) {
      deleteRowids.push(old.rowid);
      removed++;
    }
  }
  deleteRowids.sort((a, b) => a - b);
  return { insert, deleteRowids, unchanged, added, changed, removed, stored: stored.length, local: local.length };
}

export const sqlString = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`;

const row = (report: string, p: Passage) =>
  `(${sqlString(report)}, ${sqlString(p.section)}, ${sqlString(p.paragraph_id)}, ${sqlString(p.page)}, ${sqlString(p.body)})`;

/**
 * INSERT statements for `passages`, batched by size, not by row count. D1 rejects a statement past its
 * limit, and passage length varies enormously (a single Leveson appendix row runs to 48 KB), so a byte
 * budget cannot be outgrown the way a fixed 25 rows was. A row over the budget goes out alone.
 */
export function insertStatements(report: string, passages: Passage[], maxStatement = 60_000): string[] {
  const statements: string[] = [];
  let batch: string[] = [];
  let size = 0;
  const flush = () => {
    if (!batch.length) return;
    statements.push(`INSERT INTO passages (report, section, paragraph_id, page, body) VALUES\n${batch.join(",\n")};`);
    batch = [];
    size = 0;
  };
  for (const p of passages) {
    const text = row(report, p);
    if (batch.length && size + text.length > maxStatement) flush();
    batch.push(text);
    size += text.length + 2;
  }
  flush();
  return statements;
}

/** DELETE by rowid in batches (a rowid lookup, unlike `WHERE report = ?` on an FTS table, is not a scan). */
export function deleteStatements(rowids: number[], perStatement = 500): string[] {
  const out: string[] = [];
  for (let i = 0; i < rowids.length; i += perStatement) {
    out.push(`DELETE FROM passages WHERE rowid IN (${rowids.slice(i, i + perStatement).join(",")});`);
  }
  return out;
}

/** The version row the staleness check reads: one upsert, whatever else changed. */
export function versionStatement(report: string, contentVersion: string, indexedAt: number): string {
  return (
    `INSERT INTO search_index_versions (report, content_version, indexed_at) VALUES (${sqlString(report)}, ${sqlString(contentVersion)}, ${indexedAt}) ` +
    "ON CONFLICT(report) DO UPDATE SET content_version = excluded.content_version, indexed_at = excluded.indexed_at;"
  );
}

/** The statements that bring the index from `plan`'s stored state to the local one. Deletes first. */
export function incrementalStatements(report: string, plan: Plan, contentVersion: string, indexedAt: number): string[] {
  return [...deleteStatements(plan.deleteRowids), ...insertStatements(report, plan.insert), versionStatement(report, contentVersion, indexedAt)];
}

/** The old way, kept as `--full`: drop the report's rows and write every one again. */
export function fullStatements(report: string, passages: Passage[], contentVersion: string, indexedAt: number): string[] {
  return [
    `DELETE FROM passages WHERE report = ${sqlString(report)};`,
    `DELETE FROM search_index_versions WHERE report = ${sqlString(report)};`,
    ...insertStatements(report, passages),
    `INSERT INTO search_index_versions (report, content_version, indexed_at) VALUES (${sqlString(report)}, ${sqlString(contentVersion)}, ${indexedAt});`,
  ];
}

/**
 * D1 row writes per FTS5 row inserted or deleted. Measured against a local D1 (miniflare, SQLite's change
 * counter, which includes FTS5's shadow tables): exactly 3 per row both ways, over 982, 435 and 5,897
 * paragraphs (scripts/measure-reindex.mjs). `publish-report --preflight` replaces these with what the
 * real D1 reports for a probe row, which is the only way to learn what it bills.
 */
export const DEFAULT_COST = { insert: 3, delete: 3, version: 1 };
export type Cost = typeof DEFAULT_COST;

export function estimateWrites(plan: Plan, cost: Cost = DEFAULT_COST): number {
  return plan.insert.length * cost.insert + plan.deleteRowids.length * cost.delete + cost.version;
}

/** The same estimate for the old full rewrite of `stored` rows by `local` rows. */
export function estimateFullWrites(local: number, stored: number, cost: Cost = DEFAULT_COST): number {
  return local * cost.insert + stored * cost.delete + 2 * cost.version;
}
