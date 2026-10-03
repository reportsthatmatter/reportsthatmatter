/**
 * Search reindexing that writes only what changed (reportsthatmatter-h6b, -ewm0).
 *
 * The search index is one FTS5 table, `passages`, a row per citable paragraph. Rewriting a report's rows
 * for every publish (DELETE the report, INSERT all of it) cost about 6 D1 row writes per paragraph, so one
 * release of ten reports spent the free tier's 100,000 daily row writes and the third publish failed.
 * Most of a release leaves most paragraphs alone, so this compares what the index holds with what the
 * new prerender would index, by a hash of each paragraph, and writes only the difference.
 *
 * No state table: the comparison reads the report's rows back from D1 and hashes them here. That makes the
 * diff correct by construction, with nothing to drift from the index it describes: a half-applied earlier
 * run, a legacy full reindex or a hand edit are all repaired by the next run, which diffs what is really there.
 *
 * Reads are not free either (reportsthatmatter-t4al: 5M rows read a day on the free tier, spent on
 * 2026-10-03). `report` is an UNINDEXED FTS5 column, so `WHERE report = ?` reads every row of the whole
 * corpus (~40k) however small the report. So the version row also records where the report's rows live,
 * its `layout`: runs of rowids `[lo, hi]` holding that report's rows and no other's. A rowid range is the one
 * thing FTS5 can seek on, so reading a report through its runs costs its own row count. The runs stay pure
 * because new rows are only ever appended above the table's highest rowid, with explicit rowids, in one
 * atomic file; and migration 0004's trigger clears the layout whenever something else (an older checkout's
 * reindex) rewrites the version row, so a stale layout falls back to the full scan instead of being trusted.
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

const row = (report: string, p: Passage, rowid?: number) =>
  `(${rowid === undefined ? "" : `${rowid}, `}${sqlString(report)}, ${sqlString(p.section)}, ${sqlString(p.paragraph_id)}, ${sqlString(p.page)}, ${sqlString(p.body)})`;

/**
 * INSERT statements for `passages`, batched by size, not by row count. D1 rejects a statement past its
 * limit, and passage length varies enormously (a single Leveson appendix row runs to 48 KB), so a byte
 * budget cannot be outgrown the way a fixed 25 rows was. A row over the budget goes out alone.
 */
export function insertStatements(report: string, passages: Passage[], maxStatement = 60_000, firstRowid?: number): string[] {
  const statements: string[] = [];
  let batch: string[] = [];
  let size = 0;
  const columns = firstRowid === undefined ? "report, section, paragraph_id, page, body" : "rowid, report, section, paragraph_id, page, body";
  const flush = () => {
    if (!batch.length) return;
    statements.push(`INSERT INTO passages (${columns}) VALUES\n${batch.join(",\n")};`);
    batch = [];
    size = 0;
  };
  for (const [i, p] of passages.entries()) {
    const text = row(report, p, firstRowid === undefined ? undefined : firstRowid + i);
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

/**
 * Where a report's rows live: runs of rowids that hold its rows and no other report's (holes, where its own
 * rows were deleted, are fine), and how many rows that is. `at` is the indexed-at stamp it was written with,
 * so a rewrite always changes the column and migration 0004's guard can tell a layout-aware writer from one
 * that only touched the version.
 */
export type Layout = { runs: Array<[number, number]>; n: number; at: number };

export function parseLayout(value: unknown): Layout | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const v = JSON.parse(value);
    const runs = v?.runs;
    if (!Array.isArray(runs) || !Number.isInteger(v.n) || !runs.every((r: unknown) => Array.isArray(r) && r.length === 2 && r.every(Number.isSafeInteger) && r[0] <= r[1])) return null;
    return { runs, n: v.n, at: Number(v.at) || 0 };
  } catch {
    return null;
  }
}

/** Collapses sorted rowids into runs, splitting wherever `pure(a, b)` says another report's row may lie between. */
export function runsOf(rowids: number[], pure: (a: number, b: number) => boolean): Array<[number, number]> {
  const sorted = [...rowids].sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  for (const id of sorted) {
    const last = runs[runs.length - 1];
    if (last && pure(last[1], id)) last[1] = id;
    else runs.push([id, id]);
  }
  return runs;
}

/**
 * The layout after applying `plan`: the rows kept stay in the runs they were read from (bounds shrunk to what is
 * left), and the inserted rows are one new run starting at `firstRowid`, above every rowid in the table.
 */
export function layoutAfter(stored: Array<{ rowid: number }>, storedRuns: Array<[number, number]>, plan: Plan, firstRowid: number, at: number): Layout {
  const gone = new Set(plan.deleteRowids);
  const kept = stored.map((r) => r.rowid).filter((id) => !gone.has(id));
  // Two kept rowids may share a run only if they were in the same stored run: that is what proves no other
  // report's row lies between them.
  const runOf = (id: number) => storedRuns.findIndex(([lo, hi]) => id >= lo && id <= hi);
  const runs = runsOf(kept, (a, b) => runOf(a) !== -1 && runOf(a) === runOf(b));
  if (plan.insert.length) {
    const last = runs[runs.length - 1];
    // `firstRowid` is the table's highest rowid + 1, so when that highest row is this report's own, the two meet.
    if (last !== undefined && firstRowid === last[1] + 1) last[1] = firstRowid + plan.insert.length - 1;
    else runs.push([firstRowid, firstRowid + plan.insert.length - 1]);
  }
  return { runs, n: kept.length + plan.insert.length, at };
}

/**
 * The version row the staleness check reads: one upsert, whatever else changed. With `layout` (the database has
 * migration 0004's column) it is written too; `null` writes NULL, which makes the next run read the full scan.
 */
export function versionStatement(report: string, contentVersion: string, indexedAt: number, layout?: Layout | null): string {
  if (layout === undefined) {
    return (
      `INSERT INTO search_index_versions (report, content_version, indexed_at) VALUES (${sqlString(report)}, ${sqlString(contentVersion)}, ${indexedAt}) ` +
      "ON CONFLICT(report) DO UPDATE SET content_version = excluded.content_version, indexed_at = excluded.indexed_at;"
    );
  }
  return (
    `INSERT INTO search_index_versions (report, content_version, indexed_at, layout) VALUES (${sqlString(report)}, ${sqlString(contentVersion)}, ${indexedAt}, ${sqlString(layout === null ? null : JSON.stringify(layout))}) ` +
    "ON CONFLICT(report) DO UPDATE SET content_version = excluded.content_version, indexed_at = excluded.indexed_at, layout = excluded.layout;"
  );
}

/** Where the rows go and what to record, for a database with the layout column; absent for one without. */
export type Placement = { firstRowid: number; layout: Layout | null };

/** The statements that bring the index from `plan`'s stored state to the local one. Deletes first. */
export function incrementalStatements(report: string, plan: Plan, contentVersion: string, indexedAt: number, placement?: Placement): string[] {
  return [
    ...deleteStatements(plan.deleteRowids),
    ...insertStatements(report, plan.insert, undefined, placement?.firstRowid),
    versionStatement(report, contentVersion, indexedAt, placement ? placement.layout : undefined),
  ];
}

/**
 * The old way, kept as `--full` and for `pnpm index-search`: drop the report's rows and write every one again.
 * With `placement`, the rows get explicit rowids from `firstRowid` and the version row records them as one run.
 */
export function fullStatements(report: string, passages: Passage[], contentVersion: string, indexedAt: number, placement?: { firstRowid: number }): string[] {
  const layout: Layout | undefined = placement
    ? { runs: passages.length ? [[placement.firstRowid, placement.firstRowid + passages.length - 1]] : [], n: passages.length, at: indexedAt }
    : undefined;
  return [
    `DELETE FROM passages WHERE report = ${sqlString(report)};`,
    `DELETE FROM search_index_versions WHERE report = ${sqlString(report)};`,
    ...insertStatements(report, passages, undefined, placement?.firstRowid),
    layout
      ? `INSERT INTO search_index_versions (report, content_version, indexed_at, layout) VALUES (${sqlString(report)}, ${sqlString(contentVersion)}, ${indexedAt}, ${sqlString(JSON.stringify(layout))});`
      : `INSERT INTO search_index_versions (report, content_version, indexed_at) VALUES (${sqlString(report)}, ${sqlString(contentVersion)}, ${indexedAt});`,
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
