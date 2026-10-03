/* Builds the full-text search index (#100) from pre-rendered report bodies.
 *
 *   pnpm index-search              # every report -> build/search-index.sql
 *   pnpm index-search <id>         # one report only -> build/search-index.<id>.sql
 *
 * Reads the pre-rendered section pages `pnpm prerender` (#115) writes — the
 * same bytes a reader is served — so this needs no markdown-it render of its
 * own and can never index text that differs from what is on the page.
 *
 * Chrome contributes no passages: `extractPassages` only matches `<p id="…">`
 * and `<ul id="…">`, and the layout puts ids only on `<div>`s
 * (`report-body`, `share-pop`). tests/passages.test.ts pins that.
 *
 * Writes one SQL file with a DELETE+INSERT per
 * report rather than touching D1 directly, so applying it (local or remote)
 * is the same `wrangler d1 execute --file=` step used everywhere else in
 * this project, not a bespoke script with its own credentials path.
 *
 * The single-report form exists so `scripts/reindex-search.sh` (called from
 * `pnpm publish-report`, docs/ARCHITECTURE.md "Search") can refresh just the
 * report that was published, instead of DELETE+INSERT-ing all ten reports'
 * passages for a one-report change.
 *
 * `pnpm prerender` must have already run — this does not render markdown
 * itself. verify.sh runs both, in order.
 */
import "./lib/help.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { extractPassages } from "@rtm/ingest";
import { fullStatements } from "./lib/reindex.ts";
import { readReportPassages } from "./lib/report-passages.ts";

const root = join(import.meta.dirname, "..");
const only = process.argv[2];

const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
if (only && !registry.reports.some((r) => r.id === only)) {
  console.error(`${only} is not in reports/registry.yaml`);
  process.exit(2);
}
const targets = only ? registry.reports.filter((r) => r.id === only) : registry.reports;

const statements = [];
const versions = {};
let totalPassages = 0;

for (const report of targets) {
  const { contentVersion, passages } = readReportPassages(root, report.id, extractPassages);
  versions[report.id] = contentVersion;

  // The whole-file form: DELETE + INSERT per report. A publish uses scripts/reindex-search.mjs instead,
  // which writes only the paragraphs that changed.
  statements.push(...fullStatements(report.id, passages, contentVersion, Date.now()));

  totalPassages += passages.length;
  console.log(`  ✓ ${report.id} — ${passages.length.toLocaleString()} passage(s), version ${contentVersion}`);
}

// build/, not assets/: this file is an input to `wrangler d1 execute`, never
// served and never read by the Worker. Under assets/ it was 16.3 MB uploaded
// with every deploy for nothing.
const outPath = join(root, only ? `build/search-index.${only}.sql` : "build/search-index.sql");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, statements.join("\n\n") + "\n");
writeFileSync(
  join(root, only ? `build/search-index-versions.${only}.json` : "build/search-index-versions.json"),
  JSON.stringify(versions)
);

console.log(`\n${totalPassages.toLocaleString()} passage(s) across ${targets.length} report(s) → ${outPath}`);
console.log(`Apply with: ./scripts/reindex-search.sh${only ? ` ${only}` : ""}`);
