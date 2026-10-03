/**
 * Thin wrapper over `wrangler d1 execute` for the reindex and the preflight, with the runner injectable so
 * tests never start wrangler. Everything here is read-only except what the caller's SQL does; nothing in
 * this module chooses a target: the caller passes `--local` or `--remote`.
 */
import { execFileSync } from "node:child_process";
import { metaTotals, recordUsage } from "./d1-usage";
import { parseLayout, runsOf, type Layout, type StoredPassage } from "./reindex";

export const DB_NAME = "reportsthatmatter-marks";

export type Target = "--local" | "--remote";
export type Meta = { rows_read?: number; rows_written?: number; changes?: number; last_row_id?: number };
export type Statement = { results: Array<Record<string, unknown>>; meta: Meta; success?: boolean };

/** Runs SQL against a D1 database and returns wrangler's parsed `--json` output (one entry per statement). */
export type Runner = (target: Target, sql: { command: string } | { file: string }) => Statement[];

export const wranglerRunner = (cwd: string): Runner => (target, sql) => {
  const args = ["wrangler", "d1", "execute", DB_NAME, target, "--json", ...("command" in sql ? ["--command", sql.command] : ["--file", sql.file])];
  let out: string;
  try {
    out = execFileSync("pnpm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message: string };
    // wrangler prints the D1 error as JSON on stdout or text on stderr; keep whichever carries it.
    throw new D1Error(`${e.stderr ?? ""}${e.stdout ?? ""}` || e.message);
  }
  // wrangler may print informational lines before the JSON array.
  const result: Statement[] = JSON.parse(out.slice(out.indexOf("[")));
  // Every remote call goes in the shared ledger of today's D1 usage (lib/d1-usage.ts).
  if (target === "--remote") recordUsage({ label: "command" in sql ? sql.command : `file ${sql.file}`, ...metaTotals(result) });
  return result;
};

export class D1Error extends Error {
  /** The daily row-write quota is spent (D1 code 7500). */
  get quotaExhausted(): boolean {
    return /\b7500\b|row write limit|free tier daily/i.test(this.message);
  }
}

/** Rows read so far by the helpers below, summed from D1's own `meta.rows_read` (0 where it does not say). */
export const readCounter = { rowsRead: 0 };
const counted = (r: Statement) => {
  readCounter.rowsRead += Number(r.meta?.rows_read) || 0;
  return r;
};

type Row = { rid: number; report?: string; mine?: number; section: string; paragraph_id: string; page: string | number | null; body: string };
const toStored = (r: Row): StoredPassage => ({ rowid: r.rid, section: r.section, paragraph_id: r.paragraph_id, page: r.page === null ? null : String(r.page), body: r.body });
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

export type StoredRead = {
  rows: StoredPassage[];
  /** Runs of rowids holding this report's rows and no other's, as found by this read. */
  runs: Array<[number, number]>;
  /** How it was read: through the recorded layout (its own rows), or the full scan (every row in the table). */
  via: "layout" | "scan";
  /** Why the layout was not used, when it was not. */
  fallback?: string;
};

/**
 * A report's stored passages read through its recorded layout: each run as a rowid range, which FTS5 seeks on, so
 * this reads only the report's own rows. Null when the layout does not hold (a row of another report inside a
 * run, or a row count other than recorded): then the caller scans.
 */
export function readThroughLayout(run: Runner, target: Target, report: string, layout: Layout, pageSize = 400): StoredPassage[] | null {
  const rows: StoredPassage[] = [];
  for (const [lo, hi] of layout.runs) {
    let after = lo - 1;
    for (;;) {
      const [result] = run(target, {
        command: `SELECT rowid AS rid, report, section, paragraph_id, page, body FROM passages WHERE rowid BETWEEN ${lo} AND ${hi} AND rowid > ${after} ORDER BY rowid LIMIT ${pageSize}`,
      });
      const got = counted(result).results as Row[];
      for (const r of got) {
        if (r.report !== report) return null;
        rows.push(toStored(r));
      }
      if (got.length < pageSize) break;
      after = got[got.length - 1].rid;
    }
  }
  return rows.length === layout.n ? rows : null;
}

/**
 * Every row of the table in rowid order, keeping the bodies of this report's rows only: one pass over the corpus
 * (no `WHERE report = ?`, which on FTS5 re-scans from the cursor to fill each page), and it sees which other rows
 * lie between this report's, which is what makes the runs it returns exact.
 */
export function scanStoredPassages(run: Runner, target: Target, report: string, pageSize = 5000): { rows: StoredPassage[]; runs: Array<[number, number]> } {
  const id = quote(report);
  const rows: StoredPassage[] = [];
  const foreign: number[] = [];
  let after = 0; // implicit FTS5 rowids start at 1, and explicit ones are always above the table's highest
  for (;;) {
    const [result] = run(target, {
      command:
        `SELECT rowid AS rid, report = ${id} AS mine, CASE WHEN report = ${id} THEN section END AS section, CASE WHEN report = ${id} THEN paragraph_id END AS paragraph_id, ` +
        `CASE WHEN report = ${id} THEN page END AS page, CASE WHEN report = ${id} THEN body END AS body FROM passages WHERE rowid > ${after} ORDER BY rowid LIMIT ${pageSize}`,
    });
    const got = counted(result).results as Row[];
    for (const r of got) {
      if (Number(r.mine) === 1) rows.push(toStored(r));
      else foreign.push(r.rid);
    }
    if (got.length < pageSize) break;
    after = got[got.length - 1].rid;
  }
  // Two of this report's rowids share a run when no other report's row lies between them.
  let f = 0;
  const pure = (a: number, b: number) => {
    while (f < foreign.length && foreign[f] < a) f++;
    return !(f < foreign.length && foreign[f] < b);
  };
  return { rows, runs: runsOf(rows.map((r) => r.rowid), pure) };
}

/**
 * Every report's layout from one pass over the table (rowid and report only): runs are maximal stretches of rowids
 * in which one report's rows follow each other with no other report's row between. Costs one read per row in the
 * corpus once, for every report at once, where each report's first reindex would otherwise scan it twice.
 */
export function scanAllLayouts(run: Runner, target: Target, pageSize = 5000): Map<string, { runs: Array<[number, number]>; n: number }> {
  const layouts = new Map<string, { runs: Array<[number, number]>; n: number }>();
  let after = 0;
  let previous: string | null = null;
  for (;;) {
    const [result] = run(target, { command: `SELECT rowid AS rid, report FROM passages WHERE rowid > ${after} ORDER BY rowid LIMIT ${pageSize}` });
    const got = counted(result).results as Array<{ rid: number; report: string }>;
    for (const { rid, report } of got) {
      const l = layouts.get(report) ?? { runs: [], n: 0 };
      layouts.set(report, l);
      l.n++;
      if (report === previous) l.runs[l.runs.length - 1][1] = rid;
      else l.runs.push([rid, rid]);
      previous = report;
    }
    if (got.length < pageSize) return layouts;
    after = got[got.length - 1].rid;
  }
}

/** A report's stored passages: through its layout when it has one that holds, else by the full scan. */
export function readStored(run: Runner, target: Target, report: string, layout: Layout | null): StoredRead {
  if (layout) {
    const rows = readThroughLayout(run, target, report, layout);
    if (rows) return { rows, runs: layout.runs, via: "layout" };
    const scanned = scanStoredPassages(run, target, report);
    return { ...scanned, via: "scan", fallback: "the recorded layout did not hold (rows outside it, or another report's inside it)" };
  }
  return { ...scanStoredPassages(run, target, report), via: "scan", fallback: "no layout recorded yet (first run, migration 0004 not applied, or an older reindex rewrote the version row)" };
}

/** The table's highest rowid (0 when empty). FTS5 answers this from the end of its rowid order: no scan. */
export function maxRowid(run: Runner, target: Target): number {
  const [result] = run(target, { command: "SELECT rowid AS rid FROM passages ORDER BY rowid DESC LIMIT 1" });
  return Number(counted(result).results[0]?.rid ?? 0);
}

/** All of a report's stored passages, in rowid order, read in pages. Scans the whole corpus: prefer `readStored`. */
export function readStoredPassages(run: Runner, target: Target, report: string, pageSize = 400): StoredPassage[] {
  return scanStoredPassages(run, target, report, pageSize).rows;
}

export type VersionRow = { contentVersion: string | null; indexedAt: number | null; layout: Layout | null; hasLayoutColumn: boolean };

/** The report's version row: what was last indexed, when, and where its rows live (one row read). */
export function readVersionRow(run: Runner, target: Target, report: string): VersionRow {
  const [result] = run(target, { command: `SELECT * FROM search_index_versions WHERE report = ${quote(report)}` });
  counted(result);
  const row = result.results[0] as Record<string, unknown> | undefined;
  // SELECT * names every column even for no row only in some drivers; with no row, ask the schema (one row read).
  let hasLayoutColumn = row ? "layout" in row : false;
  if (!row) {
    try {
      const [cols] = run(target, { command: "SELECT name FROM pragma_table_info('search_index_versions') WHERE name = 'layout'" });
      hasLayoutColumn = counted(cols).results.length > 0;
    } catch {
      hasLayoutColumn = false;
    }
  }
  return {
    contentVersion: (row?.content_version as string | undefined) ?? null,
    indexedAt: row?.indexed_at === undefined || row?.indexed_at === null ? null : Number(row.indexed_at),
    layout: parseLayout(row?.layout),
    hasLayoutColumn,
  };
}

/** The content version the index last recorded for a report, or null. */
export function readIndexedVersion(run: Runner, target: Target, report: string): string | null {
  return readVersionRow(run, target, report).contentVersion;
}
