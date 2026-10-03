/* Brings one report's D1 search index up to date, writing only the paragraphs that changed.
 *
 *   pnpm exec tsx scripts/reindex-search.mjs <report-id> [--local] [--dry-run] [--full]
 *
 * (`./scripts/reindex-search.sh <id>` calls this; `pnpm publish-report` calls that after a commit.)
 *
 * It reads the report's rows back from D1, hashes them, compares with what `pnpm prerender` would index, and
 * deletes and inserts only the difference (scripts/lib/reindex.ts). A release that rewords a few hundred
 * paragraphs writes a few hundred rows' worth, not the whole report's, and a report whose search version
 * already matches writes one row (its indexed-at stamp): the full DELETE + INSERT of every paragraph is what spent the free tier's
 * 100,000 daily row writes on 2026-10-02 (reportsthatmatter-h6b, -ewm0).
 *
 * Reads are budgeted too (reportsthatmatter-t4al: the free tier's 5M rows read a day ran out on 2026-10-03, and
 * this script's full-table scans were most of it). The stored rows are read through the report's recorded
 * layout (rowid runs: its own rows only) when it has one, else by one pass over the table that records the
 * layout for next time; and the run is checked by reading its version row back, not by counting the report's
 * rows (a `count(*) WHERE report = ?` reads the whole corpus). The file is applied atomically, so the version
 * row it ends with is proof the rest landed.
 *
 *   --dry-run       read D1, print the plan and its estimated row writes, write nothing
 *   --full          the old way: delete the report's rows and insert them all again (repairs nothing the
 *                   incremental run would not; kept for a suspect index and for comparison)
 *   --verify-count  also count the report's rows after applying (reads the whole table, ~40k rows)
 *   --local         the local D1 (default: remote)
 *
 *   pnpm exec tsx scripts/reindex-search.mjs --record-layouts [--local] [--dry-run]
 *                   one pass over the table (~40k rows read) records every report's layout at once; run it once
 *                   after applying migration 0004, else each report's first reindex scans the table twice
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { extractPassages } from "@rtm/ingest";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { wranglerRunner } from "./lib/d1.ts";
import { fullStatements, incrementalStatements, sqlString } from "./lib/reindex.ts";
import { describePlan, placement, planReport } from "./lib/reindex-run.ts";
import { maxRowid, readCounter, readVersionRow, scanAllLayouts } from "./lib/d1.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const report = args.includes("--record-layouts") ? "--record-layouts" : args.find((a) => !a.startsWith("--"));
const target = args.includes("--local") ? "--local" : "--remote";
const dry = args.includes("--dry-run");
const full = args.includes("--full");
const verifyCount = args.includes("--verify-count");

if (!report) {
  console.error("Usage: reindex-search.mjs <report-id> [--local] [--dry-run] [--full]");
  process.exit(2);
}
const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
if (report !== "--record-layouts" && !registry.reports.some((r) => r.id === report)) {
  console.error(`${report} is not in reports/registry.yaml`);
  process.exit(2);
}

const run = wranglerRunner(root);

if (args.includes("--record-layouts")) {
  // One pass over the table records every report's layout (migration 0004), so no report's next reindex has to scan
  // the corpus to learn it: ~1 row read per row in the corpus once, one row write per report.
  const layouts = scanAllLayouts(run, target);
  const at = Date.now();
  const statements = [...layouts]
    .filter(([id]) => id !== "__rtm_probe__")
    .map(([id, l]) => `UPDATE search_index_versions SET layout = ${sqlString(JSON.stringify({ runs: l.runs, n: l.n, at }))} WHERE report = ${sqlString(id)};`);
  const file = join(root, "build/search-layouts.sql");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, statements.join("\n\n") + "\n");
  for (const [id, l] of [...layouts].sort()) console.log(`  ${id.padEnd(28)} ${l.n.toLocaleString().padStart(7)} row(s) in ${l.runs.length} run(s)`);
  if (dry) process.exit(0);
  run(target, { file });
  console.log(`✓ recorded ${statements.length} layout(s) (${target.slice(2)})${readCounter.rowsRead ? `; ${readCounter.rowsRead.toLocaleString()} rows read` : ""}.`);
  process.exit(0);
}

const planned = planReport({ root, report, target, run, extract: extractPassages, force: full });
if (!full) console.log(describePlan(planned));

if (dry) {
  console.log("  --dry-run: nothing written.");
  process.exit(0);
}

const indexedAt = Date.now();
let statements;
if (full) {
  const firstRowid = planned.version.hasLayoutColumn ? maxRowid(run, target) + 1 : undefined;
  statements = fullStatements(report, planned.passages, planned.contentVersion, indexedAt, firstRowid === undefined ? undefined : { firstRowid });
  console.log(`${report}: --full rewrites all ${planned.passages.length.toLocaleString()} paragraph(s): about ${planned.fullWrites.toLocaleString()} row writes (the incremental run would write about ${planned.writes.toLocaleString()})`);
} else {
  // Unchanged text still gets a fresh indexed_at: check-search-staleness compares it with the publish time, and a
  // republish of identical text must not read as a stale index.
  statements = incrementalStatements(report, planned.plan, planned.contentVersion, indexedAt, placement(planned, run, target, indexedAt));
}
if (!planned.version.hasLayoutColumn) console.log("  (no layout column: migration 0004 is not applied, so the next run scans the whole table again)");

const file = join(root, `build/search-index.${report}.sql`);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, statements.join("\n\n") + "\n");
console.log(`Applying ${statements.length} statement(s) to D1 (${target.slice(2)})...`);
run(target, { file });

// The file is applied in one transaction, so its last statement (the version row) landing means all of it did.
const after = readVersionRow(run, target, report);
if (after.contentVersion !== planned.contentVersion || after.indexedAt !== indexedAt) {
  console.error(`✗ ${report}: the version row reads ${after.contentVersion} at ${after.indexedAt}, expected ${planned.contentVersion} at ${indexedAt}. Run again (it diffs what is there), or with --full.`);
  process.exit(1);
}
if (verifyCount) {
  const [{ results }] = run(target, { command: `SELECT count(*) AS n FROM passages WHERE report = '${report}'` });
  if (results[0].n !== planned.passages.length) {
    console.error(`✗ ${report}: the index holds ${results[0].n} paragraph(s), expected ${planned.passages.length}. Run again (it diffs what is there), or with --full.`);
    process.exit(1);
  }
}
const read = readCounter.rowsRead ? `; ${readCounter.rowsRead.toLocaleString()} rows read in all` : "";
console.log(`✓ ${report} search index is current (${target.slice(2)}): ${planned.passages.length.toLocaleString()} paragraph(s)${after.layout ? `, ${after.layout.runs.length} rowid run(s) recorded` : ""}${read}.`);
