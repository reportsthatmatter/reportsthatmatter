/**
 * The marks table, read-only and cached (reportsthatmatter-p4h6).
 *
 * D1's free tier bills rows read, and a replay needs every mark once, not once per run: the export is one
 * grouped query per page (one row per distinct passage, readers counted, no actor hashes), written to a
 * gitignored cache that later runs reuse until `--refresh`. Nothing here can write: `readOnly` refuses any SQL
 * that is not a single SELECT before it reaches wrangler.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Runner, Target } from "./d1";
import type { StoredMark } from "../../src/lib/marks-check";

export type MarksExport = { fetchedAt: string; target: string; rowsRead: number; marks: StoredMark[] };

/** Wraps a runner so that only a single SELECT can pass. */
export function readOnly(run: Runner): Runner {
  return (target, sql) => {
    if (!("command" in sql) || !/^\s*select\b/i.test(sql.command) || /;\s*\S/.test(sql.command)) {
      throw new Error(`marks check is read-only: refusing to run ${"command" in sql ? sql.command.slice(0, 60) : "a SQL file"}`);
    }
    return run(target, sql);
  };
}

/** Every distinct marked passage, read in pages. `rowsRead` is what D1 reports it scanned, summed. */
export function exportMarks(run: Runner, target: Target, pageSize = 500): MarksExport {
  const safe = readOnly(run);
  const marks: StoredMark[] = [];
  let rowsRead = 0;
  for (let offset = 0; ; offset += pageSize) {
    const [result] = safe(target, {
      command:
        `SELECT report, section, paragraph, exact, prefix, suffix, COUNT(DISTINCT actor) AS readers FROM marks ` +
        `GROUP BY report, section, paragraph, exact, prefix, suffix ORDER BY report, paragraph, exact LIMIT ${pageSize} OFFSET ${offset}`,
    });
    rowsRead += result.meta?.rows_read ?? 0;
    const got = result.results as Array<StoredMark>;
    for (const r of got) marks.push({ report: r.report, section: r.section, paragraph: r.paragraph, exact: r.exact, prefix: r.prefix ?? "", suffix: r.suffix ?? "", readers: Number(r.readers) });
    if (got.length < pageSize) break;
  }
  return { fetchedAt: new Date().toISOString(), target, rowsRead, marks };
}

export function readCache(path: string): MarksExport | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as MarksExport;
  } catch {
    return null;
  }
}

export function writeCache(path: string, data: MarksExport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 1) + "\n");
}

/** The cached export, or a fresh one when there is none, `refresh` is set, or the cache is for another target. */
export function loadMarks(opts: { cachePath: string; target: Target; refresh: boolean; run: Runner }): { data: MarksExport; fromCache: boolean } {
  const cached = opts.refresh ? null : readCache(opts.cachePath);
  if (cached && cached.target === opts.target) return { data: cached, fromCache: true };
  const data = exportMarks(opts.run, opts.target);
  writeCache(opts.cachePath, data);
  return { data, fromCache: false };
}
