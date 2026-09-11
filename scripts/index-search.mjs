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
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { extractPassages } from "@rtm/ingest";

const root = join(import.meta.dirname, "..");
const only = process.argv[2];

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

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
  const reportDir = join(root, `assets/generated/reports/${report.id}`);
  const meta = JSON.parse(readFileSync(join(reportDir, "meta.json"), "utf8"));

  // Content-hashed, not hand-maintained: a version that can drift from what
  // was actually indexed is the exact defect this is meant to catch. Hashed
  // over the section pages in order, which is what is actually indexed.
  const digest = createHash("sha256");
  const sections = meta.sections.map((section) => {
    const html = readFileSync(join(reportDir, `fragments/${section.slug}.html`), "utf8");
    digest.update(section.slug).update("\0").update(html).update("\0");
    return { title: section.title, html };
  });

  const contentVersion = digest.digest("hex").slice(0, 12);
  versions[report.id] = contentVersion;

  statements.push(`DELETE FROM passages WHERE report = ${sqlString(report.id)};`);
  statements.push(`DELETE FROM search_index_versions WHERE report = ${sqlString(report.id)};`);

  const rows = [];
  for (const section of sections) {
    for (const passage of extractPassages(section.html)) {
      rows.push(
        `(${sqlString(report.id)}, ${sqlString(section.title)}, ${sqlString(passage.paragraphId)}, ${sqlString(passage.page)}, ${sqlString(passage.text)})`
      );
    }
  }

  // Batch by size, not by row count. D1 rejects a statement past its limit,
  // and passage length varies enormously — a single Leveson appendix row runs
  // to 48 KB, so a fixed 25 rows was 185 KB on some batches and failed once
  // the corpus grew. A byte budget cannot be outgrown the same way.
  const MAX_STATEMENT = 60_000;
  let batch = [];
  let size = 0;
  const flush = () => {
    if (!batch.length) return;
    statements.push(
      `INSERT INTO passages (report, section, paragraph_id, page, body) VALUES\n${batch.join(",\n")};`
    );
    batch = [];
    size = 0;
  };
  for (const row of rows) {
    // A row larger than the budget on its own still has to go out alone.
    if (batch.length && size + row.length > MAX_STATEMENT) flush();
    batch.push(row);
    size += row.length + 2;
  }
  flush();

  statements.push(
    `INSERT INTO search_index_versions (report, content_version, indexed_at) VALUES (${sqlString(report.id)}, ${sqlString(contentVersion)}, ${Date.now()});`
  );

  totalPassages += rows.length;
  console.log(`  ✓ ${report.id} — ${rows.length.toLocaleString()} passage(s), version ${contentVersion}`);
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
