/**
 * Work an isolate should do once, not once per request.
 *
 * Rendering a report is expensive — 15–47 ms for the smallest of the four,
 * measured, against a 10 ms CPU budget per request on the plan we are on. Doing
 * it per request does not fit and never did; the edge cache was hiding it.
 *
 * This is a holding measure, not the fix. The fix is rendering at build time
 * and serving prepared HTML from static assets (issue #107, architecture doc
 * §2). Until then, one render per isolate is the difference between a page
 * that mostly works and a page that mostly does not.
 */

/**
 * How many reports one isolate keeps. Each entry is the markdown's HTML plus
 * its sections — a few MB for the largest report — against a 128 MB isolate.
 * Two covers the common case (a reader moving through one report, a crawler
 * working down the sitemap) with room to spare.
 */
const LIMIT = 2;

const held = new Map<string, unknown>();

/** Value for `key`, built at most once while it stays in the cache. */
export function memo<T>(key: string, make: () => T): T {
  if (held.has(key)) {
    const value = held.get(key) as T;
    // Re-insert so that Map's insertion order doubles as the LRU order: the
    // report currently being read must not be the one evicted.
    held.delete(key);
    held.set(key, value);
    return value;
  }

  const value = make();
  held.set(key, value);

  while (held.size > LIMIT) {
    const oldest = held.keys().next().value;
    if (oldest === undefined) break;
    held.delete(oldest);
  }

  return value;
}

/** Test seam: an isolate never does this, but a test suite must. */
export function resetMemo(): void {
  held.clear();
}
