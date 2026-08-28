/* Builds the full-text search index (#100) from pre-rendered report bodies.
 *
 *   pnpm index-search              # writes assets/generated/search-index.sql
 *
 * Reads assets/generated/reports/<id>/body.json — the same artifact
 * `pnpm prerender` (#115) writes for serving report pages — so this needs no
 * markdown-it render of its own and can never index text that differs from
 * what a reader actually sees. Writes one SQL file with a DELETE+INSERT per
 * report rather than touching D1 directly, so applying it (local or remote)
 * is the same `wrangler d1 execute --file=` step used everywhere else in
 * this project, not a bespoke script with its own credentials path.
 *
 * `pnpm prerender` must have already run — this does not render markdown
 * itself. verify.sh runs both, in order.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { extractPassages } from "../src/lib/passages.ts";

const root = join(import.meta.dirname, "..");

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));

const statements = [];
const versions = {};
let totalPassages = 0;

for (const report of registry.reports) {
  const bodyPath = join(root, `assets/generated/reports/${report.id}/body.json`);
  const raw = readFileSync(bodyPath, "utf8");
  const { sections } = JSON.parse(raw);

  // Content-hashed, not hand-maintained: a version that can drift from what
  // was actually indexed is the exact defect this is meant to catch.
  const contentVersion = createHash("sha256").update(raw).digest("hex").slice(0, 12);
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

const outPath = join(root, "assets/generated/search-index.sql");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, statements.join("\n\n") + "\n");
writeFileSync(join(root, "assets/generated/search-index-versions.json"), JSON.stringify(versions));

console.log(`\n${totalPassages.toLocaleString()} passage(s) across ${registry.reports.length} report(s) → ${outPath}`);
console.log("Apply with: pnpm wrangler d1 execute reportsthatmatter-marks --local --file=assets/generated/search-index.sql");
