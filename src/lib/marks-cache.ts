/**
 * Edge cache for a report's mark counts (reportsthatmatter-6kky).
 *
 * `markCounts` reads every mark row of the report (`WHERE report = ? GROUP BY ...`), so uncached, D1 rows read per
 * page view = marks in that report: 2,000 marks x 2,500 views a day is the whole 5M free-tier read allowance.
 *
 * The counts are cached per edge location, for a time that grows with what a read costs: `marksTtl(rowsRead)` is the
 * TTL at which one location spends at most `DAILY_ROWS_PER_LOCATION` rows a day on a report (86,400 / TTL reads of
 * `rowsRead` each), within [MIN_TTL, MAX_TTL]. A small report (the 37-mark case) is read every 2 minutes at most; a
 * 2,000-mark report every 30. Reads per day are bounded by the cost of a read, not by the views, and never exceed
 * what the uncached route read. The TTL comes from the read's own `meta.rows_read`, so it needs no configuration.
 *
 * Staleness, and why it is acceptable although the route used to be uncached on purpose:
 * - A deploy is not a staleness risk: an entry lives at most 30 minutes, and the paragraph-alias mapping it carries
 *   only matters across a re-ingest.
 * - A reader's own mark is evicted from the cache of the location that took it (`evictMarkCounts`), so the author's
 *   next page load, which goes to the same location, computes fresh counts. Other readers see it within the TTL.
 * - The first reader's empty result is cached too (the old comment's worry); the eviction on their first mark is
 *   what stops that freezing their own view.
 * - A failed read is never cached.
 *
 * The key is a synthetic URL, not the route's own, so it cannot collide with a page, and it is shared by the
 * `/marks` route and the overview's "Most marked" block (one entry, one D1 read for both).
 */

export const MIN_TTL = 120;
export const MAX_TTL = 1800;
export const DAILY_ROWS_PER_LOCATION = 150_000;

/** Seconds to cache counts that cost `rowsRead` rows to read. */
export function marksTtl(rowsRead: number): number {
  const ttl = Math.ceil((86_400 * rowsRead) / DAILY_ROWS_PER_LOCATION);
  return Math.min(MAX_TTL, Math.max(MIN_TTL, ttl));
}

import type { MarkCount } from "./marks";

/** The subset of the Workers Cache API used here (`caches.default`); absent under Node, where the tests run. */
export type CacheLike = {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
  delete(key: Request): Promise<boolean>;
};

export function defaultCache(): CacheLike | undefined {
  return typeof caches === "undefined" ? undefined : ((caches as any).default as CacheLike);
}

export function marksCacheKey(origin: string, report: string): Request {
  return new Request(`${origin}/__cache/marks/${encodeURIComponent(report)}`, { method: "GET" });
}

/**
 * `compute()`'s counts, from the cache when it holds an entry within its TTL. `compute` throws on a D1
 * failure, and nothing is stored then. `defer` receives the cache write (`executionCtx.waitUntil`).
 */
export async function cachedMarkCounts(
  cache: CacheLike | undefined,
  origin: string,
  report: string,
  compute: () => Promise<{ counts: MarkCount[]; rowsRead: number }>,
  defer: (work: Promise<unknown>) => void = () => {}
): Promise<MarkCount[]> {
  if (!cache) return (await compute()).counts;
  const key = marksCacheKey(origin, report);
  try {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as MarkCount[];
  } catch {
    // an unreadable entry is a miss
  }
  const { counts, rowsRead } = await compute();
  const entry = new Response(JSON.stringify(counts), {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${marksTtl(rowsRead)}` },
  });
  defer(cache.put(key, entry).catch(() => {}));
  return counts;
}

/** Drops the report's cached counts at this location, after a mark was recorded in it. */
export async function evictMarkCounts(cache: CacheLike | undefined, origin: string, report: string): Promise<void> {
  if (!cache) return;
  try {
    await cache.delete(marksCacheKey(origin, report));
  } catch {
    // best-effort; the TTL bounds the staleness
  }
}
