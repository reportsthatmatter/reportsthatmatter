/* Puts the editor's highlights into the marks table (reportsthatmatter-g0w.11,
 * decision 0014).
 *
 *   pnpm editorial                              # resolves approved files to build/editorial-highlights.json
 *   pnpm seed-highlights --dry-run [--remote]   # reads D1, prints the plan and writes build/seed-highlights.sql
 *   pnpm seed-highlights [--remote]             # applies it (local D1 by default; --remote is production)
 *   pnpm seed-highlights --report <id> ...      # only these reports
 *
 * The highlights live in `editorial/<id>.yaml` under `highlights:`, checked
 * verbatim like every other quote there; only approved files are seeded (wb0).
 * Add one with `pnpm highlight add '<share link>'`. They are stored as 'save'
 * marks under one fixed actor, `editorial:rufus-pollock`, and the site shows
 * them as the editor's highlights, never as a reader's (decision 0014).
 *
 * Writes only the difference (D1's free tier is 100,000 row writes a day): it
 * reads the editor's rows back from D1, deletes the ones no file asks for and
 * inserts the missing ones, so a run over unchanged files writes nothing.
 * A highlight removed from a file is removed from the site on the next run.
 */
import "./lib/help.mjs";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { EDITOR_ACTOR, planSeed, planSql } from "../src/lib/seed-highlights.ts";
import { wranglerRunner } from "./lib/d1.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const remote = args.includes("--remote");
const dryRun = args.includes("--dry-run");
const only = args.flatMap((arg, i) => (args[i - 1] === "--report" ? [arg] : []));

const source = join(root, "build/editorial-highlights.json");
if (!existsSync(source)) {
  console.error("build/editorial-highlights.json is missing — run pnpm editorial first");
  process.exit(1);
}
const wanted = JSON.parse(readFileSync(source, "utf8"));

// Scope: every report with an approved editorial file (so emptying a file's
// highlights removes them), or the ones named.
const approved = readdirSync(join(root, "editorial"))
  .filter((name) => name.endsWith(".yaml"))
  .map((name) => parse(readFileSync(join(root, "editorial", name), "utf8")))
  .filter((file) => file?.status === "approved")
  .map((file) => file.report);
const reports = only.length ? only : approved;

// Through the shared runner, so the rows it costs land in today's D1 ledger (pnpm d1-usage).
const run = wranglerRunner(root);
const target = remote ? "--remote" : "--local";
const read = run(target, {
  command: `SELECT id, report, section, paragraph, exact, prefix, suffix, page FROM marks WHERE actor = '${EDITOR_ACTOR}'`,
});
const stored = read[0]?.results ?? [];

const plan = planSeed(stored, wanted, reports);
mkdirSync(join(root, "build"), { recursive: true });
const file = join(root, "build/seed-highlights.sql");
writeFileSync(file, planSql(plan, Date.now()));

console.log(
  `${remote ? "production" : "local"} D1: ${stored.length} editor's highlight(s) stored; ` +
    `${wanted.filter((h) => reports.includes(h.report)).length} wanted across ${reports.length} report(s).`
);
console.log(`Plan: ${plan.unchanged} unchanged, ${plan.deletes.length} to delete, ${plan.inserts.length} to insert — ${plan.writes} row write(s).`);
for (const row of plan.deletes) console.log(`  - ${row.report}/${row.paragraph}: ${row.exact.slice(0, 70)}`);
for (const h of plan.inserts) console.log(`  + ${h.report}/${h.paragraph}: ${h.exact.slice(0, 70)}`);

if (dryRun || !plan.writes) {
  console.log(dryRun ? `\nDry run: nothing written. SQL in ${file}.` : "\nNothing to write.");
  process.exit(0);
}
const [result] = run(target, { file });
if (result?.meta?.rows_read !== undefined) console.log(`D1: ${result.meta.rows_read} rows read, ${result.meta.rows_written} rows written`);
console.log(`\nApplied ${plan.writes} row write(s) ${remote ? "in production" : "locally"}.`);
