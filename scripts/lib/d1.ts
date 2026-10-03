/**
 * Thin wrapper over `wrangler d1 execute` for the reindex and the preflight, with the runner injectable so
 * tests never start wrangler. Everything here is read-only except what the caller's SQL does; nothing in
 * this module chooses a target: the caller passes `--local` or `--remote`.
 */
import { execFileSync } from "node:child_process";
import type { StoredPassage } from "./reindex";

export const DB_NAME = "reportsthatmatter-marks";

export type Target = "--local" | "--remote";
export type Meta = { rows_read?: number; rows_written?: number; changes?: number };
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
  return JSON.parse(out.slice(out.indexOf("[")));
};

export class D1Error extends Error {
  /** The daily row-write quota is spent (D1 code 7500). */
  get quotaExhausted(): boolean {
    return /\b7500\b|row write limit|free tier daily/i.test(this.message);
  }
}

/** All of a report's stored passages, in rowid order, read in pages so no response grows without bound. */
export function readStoredPassages(run: Runner, target: Target, report: string, pageSize = 400): StoredPassage[] {
  const id = `'${report.replace(/'/g, "''")}'`;
  const rows: StoredPassage[] = [];
  let after = 0;
  for (;;) {
    const [result] = run(target, {
      command: `SELECT rowid AS rid, section, paragraph_id, page, body FROM passages WHERE report = ${id} AND rowid > ${after} ORDER BY rowid LIMIT ${pageSize}`,
    });
    const got = result.results as Array<{ rid: number; section: string; paragraph_id: string; page: string | number | null; body: string }>;
    for (const r of got) rows.push({ rowid: r.rid, section: r.section, paragraph_id: r.paragraph_id, page: r.page === null ? null : String(r.page), body: r.body });
    if (got.length < pageSize) return rows;
    after = got[got.length - 1].rid;
  }
}

/** The content version the index last recorded for a report, or null. */
export function readIndexedVersion(run: Runner, target: Target, report: string): string | null {
  const [result] = run(target, {
    command: `SELECT content_version FROM search_index_versions WHERE report = '${report.replace(/'/g, "''")}'`,
  });
  return (result.results[0]?.content_version as string | undefined) ?? null;
}
