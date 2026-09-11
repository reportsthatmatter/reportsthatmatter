#!/usr/bin/env node
/* Flags a report whose search index has drifted from what is actually
 * published (reportsthatmatter-9j2).
 *
 * `pnpm publish-report` always reindexes the report it just published
 * (scripts/reindex-search.sh, docs/ARCHITECTURE.md "Search"), but a report
 * published through `rtm-publish` — the report repo's own self-publish CLI,
 * @rtm/ingest's "path 1" — commits straight to R2 and D1's `report_versions`
 * and calls nothing equivalent. A report published that way can go stale in
 * search with nothing to notice, until now.
 *
 * `report_versions.content_hash` and `search_index_versions.content_version`
 * are independent hash schemes (a publish's manifest hash vs. a hash over
 * the prerendered section HTML the indexer actually reads) — comparing them
 * by value would mean recomputing one from the other's inputs. Comparing
 * *when* each happened does not: every reindex sets `indexed_at`, every
 * publish sets `published_at`, and a report is stale exactly when the more
 * recent publish has no reindex after it — `published_at > indexed_at`, or
 * no `search_index_versions` row at all.
 *
 * Usage: pnpm check-search-staleness [--remote|--local]  (default --remote)
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const target = process.argv.includes("--local") ? "--local" : "--remote";

function query(sql) {
  const out = execFileSync(
    "pnpm",
    ["wrangler", "d1", "execute", "reportsthatmatter-marks", target, "--json", "--command", sql],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  // wrangler prints informational lines before the JSON array on some
  // versions; the array is always what remains once those are dropped.
  const start = out.indexOf("[");
  const parsed = JSON.parse(out.slice(start));
  return parsed[0].results;
}

const versions = query("SELECT report, content_hash, published_at FROM report_versions");
const indexed = query("SELECT report, content_version, indexed_at FROM search_index_versions");
const indexedByReport = new Map(indexed.map((row) => [row.report, row]));

const stale = [];
for (const version of versions) {
  const row = indexedByReport.get(version.report);
  if (!row) {
    stale.push({ report: version.report, reason: "never indexed" });
  } else if (row.indexed_at < version.published_at) {
    const behind = version.published_at - row.indexed_at;
    stale.push({
      report: version.report,
      reason: `indexed ${Math.round(behind / 60_000)} minute(s) before its current publish`,
    });
  }
}

if (stale.length) {
  console.error(`${stale.length} report(s) have a stale search index (${target}):`);
  for (const { report, reason } of stale) console.error(`  ✗ ${report} — ${reason}`);
  console.error("\nFix: ./scripts/reindex-search.sh <report-id>" + (target === "--local" ? " --local" : ""));
  process.exit(1);
}

console.log(`search index is current for all ${versions.length} published report(s) (${target}).`);
