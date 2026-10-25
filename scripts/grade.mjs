/* The quality bar (reportsthatmatter-38s.16, 38s.19; thresholds decision 0030): every report's grade, the errors a
 * reader meets per 10 pages over six dimensions, computed from the records we already commit. Runs no check itself.
 *
 *   pnpm grade                      print the table; write reports/grades.json and reports/grades.md
 *   pnpm grade <id> [<id> ...]      also print each report's terms (count x precision = estimated errors)
 *   pnpm grade --diff [<ref>]       letter and index moves against reports/grades.json at <ref> (default origin/main)
 *   pnpm grade --record             also append this run to reports/grades-history.jsonl (ingest version, site commit)
 *   pnpm grade --record-referee     first re-run `pnpm ingest referee eval` on the mini-references (reports/score-sets.yaml
 *                                   `mini_references`, served answers: --answers cache) and rewrite reports/referee-last.json
 *                                   (needs the report repos and their PDFs; about 40 s)
 *   pnpm grade --verify-log <file>  take the oracle counts from a saved `pnpm ingest verify` run instead of reports/verify-last.json
 *     --json                        print the grades as JSON
 *     --no-write                    write nothing
 *
 * Inputs: reports/verify-last.json (oracle counts, per-report and pooled golden-page precision), reports/anchor-budget.yaml
 * (page anchors; the ratcheted budget, an upper bound), reports/<id>/aliases.yaml (ids), reports/referee-last.json
 * (mini-reference page breaks), docs/scores.json (reference page breaks, page-level WER), reports/<id>/full.md (pages,
 * words) and each report's ingest.ts (cleanEdition). Method: docs/scoring.md, "The quality bar". Grades are kept in the
 * repo only, not shown on the site (decision 0030).
 */
import "./lib/help.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { DIMENSIONS, gradeDiff, gradeReport, gradeTable } from "../src/lib/grade/grade.ts";
import { readInputs, summariseReferee } from "../src/lib/grade/inputs.ts";
import { parseVerify } from "../src/lib/score/scorecard.ts";
import { reportDirFor } from "./lib/report-dirs.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const ids = args.filter((a, i) => !a.startsWith("--") && !["--diff", "--verify-log"].includes(args[i - 1]));
const today = new Date().toISOString().slice(0, 10);
const write = !flag("--no-write");

if (flag("--record-referee")) {
  const sets = parse(readFileSync(join(root, "reports/score-sets.yaml"), "utf8"));
  const mini = sets.mini_references ?? [];
  const out = join(mkdtempSync(join(tmpdir(), "grade-")), "labels.jsonl");
  const r = spawnSync("pnpm", ["--silent", "ingest", "referee", "eval", ...mini, "--answers", "cache", "--labels-out", out], { cwd: root, encoding: "utf8", stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) {
    console.error(`referee eval failed (${r.status})`);
    process.exit(1);
  }
  const quality = JSON.parse(readFileSync(join(root, "reports/quality-last.json"), "utf8"));
  const rec = summariseReferee(readFileSync(out, "utf8"), quality.ingest ?? null, today);
  if (write) {
    writeFileSync(join(root, "reports/referee-last.json"), JSON.stringify(rec, null, 1) + "\n");
    console.error(`wrote reports/referee-last.json (${Object.keys(rec.reports).length} reports)`);
  } else console.log(JSON.stringify(rec, null, 1));
}

const log = opt("--verify-log");
const verify = log ? parseVerify(readFileSync(log, "utf8")) : undefined;
const { inputs, ingest } = readInputs(root, { verify, reportDir: (id) => reportDirFor(root, id).dir });
const grades = inputs.map(gradeReport);
let site = null;
try {
  site = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
} catch {}
const record = { ingest, site, recorded: today, reports: Object.fromEntries(grades.map((g) => [g.id, g])) };

if (flag("--json")) console.log(JSON.stringify(record, null, 1));
else {
  console.log(gradeTable(grades));
  console.log("\nErrors a reader meets per 10 pages. A <= 1, B <= 3, C <= 10, D <= 30, F above (decision 0030); publishable: B or better with no graded dimension below C.");
  console.log("~ estimated (a pooled, prior or assumed precision in it); ? indicative, not graded; – unmeasured. W and unmatched ids are shown, not graded yet (docs/scoring.md).");
}

for (const id of ids) {
  const g = record.reports[id];
  if (!g) {
    console.error(`${id}: not in reports/registry.yaml`);
    continue;
  }
  console.log(`\n${id}: ${g.unmeasured ? "ungraded" : g.letter} (${g.per10.toFixed(2)} per 10 pages, ${g.pages} pages)`);
  for (const { key, label } of DIMENSIONS) {
    const d = g.dimensions[key];
    console.log(`  ${label}: ${d.per10 === null ? "unmeasured" : `${d.per10.toFixed(2)} per 10 pp, ${d.errors.toFixed(1)} errors, ${d.basis}${d.graded ? `, ${d.letter}` : ", not graded"}`}${d.note ? ` (${d.note})` : ""}`);
    if (d.unmatched?.count) console.log(`      aliases unmatched (old ?p= link finds nothing; shown, not graded): ${d.unmatched.count} = ${d.unmatched.per10.toFixed(2)} per 10 pp`);
    for (const t of d.terms) console.log(`      ${t.source}: ${t.count} x ${t.precision.toFixed(2)} [${t.precisionFrom}] = ${t.errors.toFixed(1)}`);
  }
}

if (args.includes("--diff")) {
  const ref = opt("--diff") ?? "origin/main";
  let was = null;
  try {
    was = JSON.parse(execFileSync("git", ["show", `${ref}:reports/grades.json`], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString());
  } catch {}
  console.log(`\nAgainst reports/grades.json at ${ref}${was ? "" : " (none there: every report is new)"}:\n`);
  console.log(gradeDiff(record, was));
}

if (write) {
  writeFileSync(join(root, "reports/grades.json"), JSON.stringify(record, null, 1) + "\n");
  const md = [
    "# Report grades",
    "",
    `Generated by \`pnpm grade\` (reportsthatmatter-38s.16, 38s.19) on ${today}, ingest ${ingest}, site ${site}. Do not edit: re-run it. Method and thresholds: [docs/scoring.md](../docs/scoring.md#the-quality-bar-one-grade-per-report), decision 0030. Repo only; not shown on the site.`,
    "",
    "Errors a reader meets per 10 pages, per dimension and summed. A <= 1, B <= 3, C <= 10, D <= 30, F above. Publishable: B or better with no graded dimension below C. `~` estimated (a pooled, prior or assumed precision in it); `?` indicative, not graded; `–` unmeasured. Words (W) and unmatched ids (an old `?p=` link that finds nothing, in brackets under I) are shown, not graded yet.",
    "",
    gradeTable(grades),
    "",
  ].join("\n");
  writeFileSync(join(root, "reports/grades.md"), md);
  if (flag("--record")) {
    const slim = { ingest, site, recorded: today, reports: Object.fromEntries(grades.map((g) => [g.id, { letter: g.letter, per10: +g.per10.toFixed(2), ...Object.fromEntries(DIMENSIONS.map(({ key, short }) => [short, g.dimensions[key].per10 === null ? null : +g.dimensions[key].per10.toFixed(2)])) }])) };
    appendFileSync(join(root, "reports/grades-history.jsonl"), JSON.stringify(slim) + "\n");
  }
  console.error(`wrote reports/grades.json, reports/grades.md${flag("--record") ? ", appended reports/grades-history.jsonl" : ""}`);
}
