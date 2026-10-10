/**
 * Is a report's search index stale? By content where we can, by clock where we cannot (reportsthatmatter-jsk3).
 *
 * The first check compared `search_index_versions.indexed_at` with `report_versions.published_at`, so republishing
 * unchanged text read as a stale index and the integrator patched indexed_at by hand. The index records the content
 * version it was built from (a hash over the section pages the indexer reads; scripts/lib/report-passages.ts), and
 * the local prerender yields the same hash for its text. But the local prerender is only a stand-in for what is
 * published: a report repo's own `rtm-publish` (the case reportsthatmatter-9j2 wrote this check for) publishes text
 * this checkout may never have rendered, and comparing the index with an equally old local copy would say "current".
 * So the content comparison applies only when the local prerender IS the published text (its publish hash equals
 * `report_versions.content_hash`); otherwise the timestamp comparison applies, and the reason says which was used.
 */
export type PublishedRow = { report: string; content_hash?: string; published_at: number };
export type IndexedRow = { report: string; content_version: string; indexed_at: number };
export type Local = { contentVersion: string; publishHash: string };
export type Stale = { report: string; reason: string };

export function findStale(published: PublishedRow[], indexed: IndexedRow[], local: (report: string) => Local | null): Stale[] {
  const byReport = new Map(indexed.map((r) => [r.report, r]));
  const stale: Stale[] = [];
  for (const v of published) {
    const row = byReport.get(v.report);
    if (!row) {
      stale.push({ report: v.report, reason: "never indexed" });
      continue;
    }
    const mine = local(v.report);
    if (mine && v.content_hash && mine.publishHash === v.content_hash) {
      if (mine.contentVersion !== row.content_version)
        stale.push({ report: v.report, reason: `the index was built from content ${row.content_version}; the published text (this prerender) is ${mine.contentVersion}` });
    } else if (row.indexed_at < v.published_at) {
      const why = mine ? "the local prerender is not the published text" : "no local prerender to compare";
      stale.push({ report: v.report, reason: `${why}; indexed ${Math.round((v.published_at - row.indexed_at) / 60_000)} minute(s) before its current publish` });
    }
  }
  return stale;
}
