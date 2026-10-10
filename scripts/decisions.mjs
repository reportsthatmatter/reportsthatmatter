/* The decision log's index, generated from docs/decisions/*.md.
 *
 *   pnpm decisions            # print the index: number, question, status, bead
 *   pnpm decisions next       # print the next free number (0000-template.md copies to docs/decisions/<that>-<slug>.md)
 *   pnpm decisions check      # exit 1 on a duplicate number, or a title that disagrees with its file name
 *
 * The index is not committed (a table in README.md conflicted on every batch); `tests/decisions.test.ts` runs
 * `check` in CI. Number your record with the next free number on origin/main when you open the PR, and
 * rebase and renumber if main takes it first (AGENTS.md "Decisions and open questions").
 */
import "./lib/help.mjs";
import { join } from "node:path";
import { checkDecisions, decisionIndex, nextNumber } from "./lib/decisions.ts";

const dir = join(import.meta.dirname, "../docs/decisions");
const [command = "index"] = process.argv.slice(2);

if (command === "index") console.log(decisionIndex(dir));
else if (command === "next") console.log(nextNumber(dir));
else if (command === "check") {
  const problems = checkDecisions(dir);
  for (const p of problems) console.log(`  ✗ ${p}`);
  if (problems.length) process.exit(1);
  console.log("decision records: numbering ok");
} else {
  console.error("Usage: pnpm decisions [index | next | check]");
  process.exit(2);
}
