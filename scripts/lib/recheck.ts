/**
 * Pre-PR re-ingest of every report that declares a changed pass (reportsthatmatter-m7ga).
 *
 * A correction in a report repo must match exactly once, and `applyCorrections` throws when it matches 0 or 2+
 * times, naming the id. That only shows when the report is re-ingested: Challenger c-0034/c-0035 broke only on
 * re-ingest after a pass change moved the text they matched. `pnpm ingest recheck --passes a,b` re-ingests (in
 * memory, writing nothing) each report whose ingest.ts declares one of the passes and fails on any throw.
 */

/** The reports to re-ingest: those declaring at least one of `changed` (all of them when `changed` is empty). */
export function selectReports<T extends { id: string; passes: string[] }>(reports: T[], changed: string[]): { run: T[]; skipped: T[] } {
  if (!changed.length) return { run: reports, skipped: [] };
  const want = new Set(changed);
  return {
    run: reports.filter((r) => r.passes.some((p) => want.has(p))),
    skipped: reports.filter((r) => !r.passes.some((p) => want.has(p))),
  };
}
