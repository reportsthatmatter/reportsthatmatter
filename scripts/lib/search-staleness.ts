/**
 * Is a report's search index stale? By content, not by clock (reportsthatmatter-jsk3).
 *
 * The first check compared `search_index_versions.indexed_at` with `report_versions.published_at`, so republishing
 * unchanged text read as a stale index and the integrator patched indexed_at by hand. The index records the content
 * version it was built from (a hash over the section pages the indexer reads; scripts/lib/report-passages.ts), and
 * `pnpm prerender` yields the same hash for the text about to be (or just) published. Equal hashes: current, whatever
 * the timestamps say. Different: stale. Only when the local prerender cannot answer (no `assets/generated` for that
 * report) does the old timestamp comparison apply, and the reason says so.
 */
export type PublishedRow = { report: string; published_at: number };
export type IndexedRow = { report: string; content_version: string; indexed_at: number };
export type Stale = { report: string; reason: string };

export function findStale(published: PublishedRow[], indexed: IndexedRow[], localVersion: (report: string) => string | null): Stale[] {
  const byReport = new Map(indexed.map((r) => [r.report, r]));
  const stale: Stale[] = [];
  for (const v of published) {
    const row = byReport.get(v.report);
    if (!row) {
      stale.push({ report: v.report, reason: "never indexed" });
      continue;
    }
    const local = localVersion(v.report);
    if (local !== null) {
      if (local !== row.content_version) stale.push({ report: v.report, reason: `the index was built from content ${row.content_version}; the prerender is ${local}` });
    } else if (row.indexed_at < v.published_at) {
      stale.push({ report: v.report, reason: `no local prerender to compare; indexed ${Math.round((v.published_at - row.indexed_at) / 60_000)} minute(s) before its current publish` });
    }
  }
  return stale;
}
