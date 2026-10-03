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
 *   --dry-run   read D1, print the plan and its estimated row writes, write nothing
 *   --full      the old way: delete the report's rows and insert them all again (repairs nothing the
 *               incremental run would not; kept for a suspect index and for comparison)
 *   --local     the local D1 (default: remote)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { extractPassages } from "@rtm/ingest";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { wranglerRunner } from "./lib/d1.ts";
import { fullStatements, incrementalStatements } from "./lib/reindex.ts";
import { describePlan, planReport } from "./lib/reindex-run.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const report = args.find((a) => !a.startsWith("--"));
const target = args.includes("--local") ? "--local" : "--remote";
const dry = args.includes("--dry-run");
const full = args.includes("--full");

if (!report) {
  console.error("Usage: reindex-search.mjs <report-id> [--local] [--dry-run] [--full]");
  process.exit(2);
}
const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
if (!registry.reports.some((r) => r.id === report)) {
  console.error(`${report} is not in reports/registry.yaml`);
  process.exit(2);
}

const run = wranglerRunner(root);
const planned = planReport({ root, report, target, run, extract: extractPassages, force: full });
if (!full) console.log(describePlan(planned));

let statements;
if (full) {
  statements = fullStatements(report, planned.passages, planned.contentVersion, Date.now());
  console.log(`${report}: --full rewrites all ${planned.passages.length.toLocaleString()} paragraph(s): about ${planned.fullWrites.toLocaleString()} row writes (the incremental run would write about ${planned.writes.toLocaleString()})`);
} else if (planned.current) {
  // No paragraph differs. The version row still gets a fresh indexed_at: check-search-staleness compares it
  // with the publish time, and a republish of identical text must not read as a stale index.
  statements = incrementalStatements(report, planned.plan, planned.contentVersion, Date.now());
} else {
  statements = incrementalStatements(report, planned.plan, planned.contentVersion, Date.now());
}

if (dry) {
  console.log("  --dry-run: nothing written.");
  process.exit(0);
}

const file = join(root, `build/search-index.${report}.sql`);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, statements.join("\n\n") + "\n");
console.log(`Applying ${statements.length} statement(s) to D1 (${target.slice(2)})...`);
run(target, { file });

const [{ results }] = run(target, { command: `SELECT count(*) AS n FROM passages WHERE report = '${report}'` });
const n = results[0].n;
if (n !== planned.passages.length) {
  console.error(`✗ ${report}: the index holds ${n} paragraph(s), expected ${planned.passages.length}. Run again (it diffs what is there), or with --full.`);
  process.exit(1);
}
console.log(`✓ ${report} search index is current (${target.slice(2)}): ${n.toLocaleString()} paragraph(s).`);
