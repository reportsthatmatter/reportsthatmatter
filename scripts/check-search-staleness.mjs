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
 * Staleness is by content, not by clock (jsk3): `search_index_versions.content_version` is a hash over the
 * section pages the indexer read, and `pnpm prerender` gives the same hash for the text about to be published, so
 * republishing unchanged text is not stale (the old `published_at > indexed_at` test said it was). Run it after
 * `pnpm prerender` of the text you published. A report with no local prerender falls back to the timestamps.
 *
 * Usage: pnpm check-search-staleness [--remote|--local]  (default --remote)
 */
import "./lib/help.mjs";
import { wranglerRunner } from "./lib/d1.ts";
import { join } from "node:path";
import { extractPassages } from "@rtm/ingest";
import { readReportPassages } from "./lib/report-passages.ts";
import { findStale } from "./lib/search-staleness.ts";

const root = join(import.meta.dirname, "..");
const target = process.argv.includes("--local") ? "--local" : "--remote";

// Through the shared runner, so the rows it reads land in today's D1 ledger (pnpm d1-usage). Two tiny tables.
const run = wranglerRunner(root);
const query = (sql) => run(target, { command: sql })[0].results;

const versions = query("SELECT report, content_hash, published_at FROM report_versions");
const indexed = query("SELECT report, content_version, indexed_at FROM search_index_versions");

const localVersion = (report) => {
  try {
    return readReportPassages(root, report, extractPassages).contentVersion;
  } catch {
    return null;
  }
};
const stale = findStale(versions, indexed, localVersion);

if (stale.length) {
  console.error(`${stale.length} report(s) have a stale search index (${target}):`);
  for (const { report, reason } of stale) console.error(`  ✗ ${report} — ${reason}`);
  console.error("\nFix: ./scripts/reindex-search.sh <report-id>" + (target === "--local" ? " --local" : ""));
  process.exit(1);
}

console.log(`search index is current for all ${versions.length} published report(s) (${target}).`);
