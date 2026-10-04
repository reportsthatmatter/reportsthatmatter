/* Measures D1 rows read per page view by the Worker's mark counts, uncached and through the edge cache (reportsthatmatter-6kky).
 *
 *   pnpm exec tsx scripts/measure-marks-reads.mjs [--marks 37,2000] [--views 2500]
 *
 * A scratch local D1 (throwaway persist dir, migration 0001 only; nothing remote) is loaded with N marks for one report, then
 * the real `markCounts` runs through miniflare's binding, which reports `meta.rows_read` the way production D1 does. "Before" is
 * one `markCounts` per view (what /reports/:id/marks and the report overview did). "After" is the same views through the real
 * `cachedMarkCounts` with an in-memory Cache API, one location, the views spread evenly over a day (a miss every TTL), and a mark
 * by a reader (which evicts) every 200 views.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localD1 } from "./lib/local-d1-sync.mjs";
import { markCounts, markCountsRead, recordMark } from "../src/lib/marks.ts";
import { cachedMarkCounts, evictMarkCounts, marksTtl } from "../src/lib/marks-cache.ts";

const root = join(import.meta.dirname, "..");
const arg = (name, d) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : d);
const sizes = arg("--marks", "37,2000").split(",").map(Number);
const views = Number(arg("--views", "2500"));
const persist = mkdtempSync(join(tmpdir(), "rtm-measure-marks-reads-"));
execFileSync("pnpm", ["wrangler", "d1", "migrations", "apply", "reportsthatmatter-marks", "--local", "--persist-to", persist], { cwd: root, stdio: "ignore" });
const d1 = localD1({ config: join(root, "wrangler.toml"), persist: join(persist, "v3") });

const q = (v) => (typeof v === "number" || v === null ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
/** The async MarksDB the Worker takes, over the synchronous runner. */
const db = {
  prepare(sql) {
    return {
      bind: (...args) => {
        const text = args.reduce((s, a) => s.replace("?", () => q(a)), sql);
        const exec = () => d1.run("--local", { command: text })[0];
        return { all: async () => exec(), first: async () => exec().results[0] ?? null, run: async () => exec() };
      },
    };
  },
};

const cache = new Map();
const fakeCache = {
  async match(key) { return cache.get(key.url)?.clone(); },
  async put(key, r) { cache.set(key.url, r); },
  async delete(key) { return cache.delete(key.url); },
};

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const lines = [];
for (const n of sizes) {
  const report = `measure-${n}`;
  // n marks over n/4 paragraphs and n/2 distinct readers, like a launch-week report.
  d1.run("--local", { command: `WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM s WHERE i < ${n})
    INSERT INTO marks (report, section, paragraph, exact, prefix, suffix, page, kind, actor, created_at)
    SELECT '${report}', 'sec', 'para-' || (i % ${Math.max(1, Math.floor(n / 4))}), 'words ' || (i % ${Math.max(1, Math.floor(n / 4))}), '', '', i % 300, 'share', 'actor-' || (i % ${Math.max(1, Math.floor(n / 2))}), i FROM s` });

  let t = d1.rowsRead;
  for (let i = 0; i < views; i++) await markCounts(db, report, 1);
  const before = d1.rowsRead - t;

  cache.clear();
  t = d1.rowsRead;
  const read = await markCountsRead(db, report, 1);
  const ttl = marksTtl(read.rowsRead);
  const viewsPerTtl = views / (86400 / ttl); // evenly spread over a day: this many views between expiries
  t = d1.rowsRead;
  for (let i = 0; i < views; i++) {
    if (i > 0 && i % Math.max(1, Math.round(viewsPerTtl)) === 0) cache.clear(); // TTL expiry
    if (i > 0 && i % 200 === 0) {
      await recordMark(db, { report, section: "sec", paragraph: "para-0", exact: "words 0", prefix: "", suffix: "", page: 1, kind: "save" }, `new-reader-${i}`, Date.now());
      await evictMarkCounts(fakeCache, "https://x.org", report);
    }
    await cachedMarkCounts(fakeCache, "https://x.org", report, () => markCountsRead(db, report, 1));
  }
  const after = d1.rowsRead - t;
  lines.push({ n, ttl, rowsRead: read.rowsRead, perViewBefore: before / views, before, perViewAfter: after / views, after });
}
console.log(`D1 rows read by the mark counts (scratch local D1, one report, ${fmt(views)} views a day on one location, TTL scaled to the read cost, a mark by a reader every 200 views)\n`);
console.log("marks  read  TTL   before: rows/view   rows/day      after: rows/view   rows/day   share of 5M free reads (before -> after)");
for (const l of lines) {
  console.log(`${String(l.n).padStart(5)} ${String(l.rowsRead).padStart(5)} ${String(l.ttl).padStart(4)}s  ${fmt(l.perViewBefore).padStart(17)}   ${fmt(l.before).padStart(9)}      ${l.perViewAfter.toFixed(1).padStart(16)}   ${fmt(l.after).padStart(8)}   ${((l.before / 5e6) * 100).toFixed(1)}% -> ${((l.after / 5e6) * 100).toFixed(2)}%`);
}
d1.close();
