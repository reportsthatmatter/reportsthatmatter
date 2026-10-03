/* Release scorecard (reportsthatmatter-38s.6): one markdown block for every ingest release or pin-bump PR.
 *
 *   pnpm scorecard [--base <ref>] [--out <file>] [--no-score] [--no-verify | --verify-log <file>] [--record]
 *
 * Assembles, against <ref> (default origin/main):
 *   1. `pnpm quality report --diff <ref>`           the b78.2 defect counts per report and signal
 *   2. the layout oracle's counts per report         from `pnpm ingest verify` (reports/verify-last.json at <ref> is the base)
 *   3. the golden-page table, and the oracle's precision against the golden pages
 *   4. docs/scores.json against its copy at <ref>    boundary P/R/F1, page-break join accuracy, marker P/R, WER, the
 *                                                    reference's error rate; development and held-out sets separately
 *   5. the discipline checklist (dev / held-out, reading the diff, beads for regressions)
 * `pnpm score` is re-run first and rewrites docs/scores.json (--no-score to use the file as it is) and `pnpm ingest verify`
 * is run (35 s; --verify-log <file> reads a saved run, --no-verify leaves the oracle and golden tables out).
 * --record writes reports/verify-last.json from this run: the integrator does that after the release ships,
 * with `pnpm quality ratchet --record`, and commits both with docs/scores.json.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { goldenTable, oracleTable, parseVerify, precisionTable } from "../src/lib/score/scorecard.ts";
import { baselines, headlineTable, regressed, HEADLINE_COLUMNS } from "../src/lib/score/headline.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const base = opt("--base", "origin/main");
const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`${cmd} ${a.join(" ")} failed (${r.status}): ${r.stderr}`);
  return r;
};
const show = (path) => {
  try {
    return execFileSync("git", ["show", `${base}:${path}`], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString();
  } catch {
    return null;
  }
};
const strip = (s) => s.trim();

const out = [];
const pin = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies?.["@rtm/ingest"]?.split("#").pop();
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
out.push(`## Release scorecard: ingest ${pin}, site ${sha}, against ${base}`, "");

// 1. quality counts
out.push("### Defect counts (`pnpm quality report --diff " + base + "`)", "", "A `▲` is a regression and needs a bead; an improvement is locked in with `pnpm quality ratchet`.", "");
out.push(strip(run("pnpm", ["--silent", "quality", "report", "--diff", base]).stdout), "");

// 2, 3. oracle and golden pages
if (!flag("--no-verify")) {
  const log = opt("--verify-log", null);
  const text = log ? readFileSync(log, "utf8") : run("pnpm", ["--silent", "ingest", "verify"]).stdout;
  const now = parseVerify(text);
  const was = show("reports/verify-last.json");
  const prev = was ? JSON.parse(was) : null;
  if (!Object.keys(now.reports).length) out.push("### Layout oracle and golden pages", "", "`pnpm ingest verify` printed no reports (source PDFs missing?); tables left out.", "");
  else {
    out.push("### Layout oracle: findings per report (`pnpm ingest verify`; lower is better, `▲` is a rise)", "", prev ? `Deltas against reports/verify-last.json at ${base}.` : `No reports/verify-last.json at ${base}: no deltas.`, "", oracleTable(now, prev), "");
    out.push("### Golden pages (`pnpm ingest verify`; `▼` is a page that stopped matching in full)", "", goldenTable(now, prev), "");
    out.push("The oracle against the golden pages, all reports:", "", precisionTable(now, prev), "");
    if (flag("--record")) {
      writeFileSync(join(root, "reports/verify-last.json"), JSON.stringify(now, null, 1) + "\n");
      console.error("wrote reports/verify-last.json");
    }
  }
}

// 4. headline scores
if (!flag("--no-score")) run("pnpm", ["--silent", "score"]);
const SCORES = join(root, "docs/scores.json");
const cur = existsSync(SCORES) ? JSON.parse(readFileSync(SCORES, "utf8")) : null;
const was = show("docs/scores.json");
const prev = was ? JSON.parse(was) : null;
out.push("### Headline scores against the reference editions (`pnpm score`; `docs/scores.json` against " + base + ")", "");
// a hybrid report (cleanEdition) is its PDF shadow here, with the edition adapter's agreement on a second, labelled row (79ze)
if (!cur) out.push("No docs/scores.json: run `pnpm score`.", "");
else {
  if (!prev) out.push(`No docs/scores.json at ${base}: no deltas.`, "");
  const pick = (want) => Object.fromEntries(Object.entries(cur.reports).filter(([, e]) => e.set === want));
  for (const [title, want] of [["Development set", "development"], ["Held-out set (a pass must not lower these)", "held-out"]]) {
    const here = pick(want);
    if (!Object.keys(here).length) continue;
    out.push(`**${title}**`, "", headlineTable(here, prev ? prev.reports : null), "");
  }
  const bad = [];
  for (const [id, e] of Object.entries(cur.reports)) {
    const p = baselines(e, prev?.reports?.[id]).metrics; // a hybrid's adapter agreement is shown, never flagged
    if (!p) continue;
    for (const c of [...HEADLINE_COLUMNS, { key: "join_adj_ours_wrong" }]) if (regressed(c.key, e.metrics[c.key], p[c.key])) bad.push(`${id} ${c.key}${e.set === "held-out" ? " (held-out)" : ""}`);
  }
  out.push(bad.length ? `Regressions (each needs a bead or an explanation): ${bad.join("; ")}.` : "No headline metric regressed.", "");
  out.push("'ours wrong / judged' is on the adjudicated page breaks (`reference/adjudicated.yaml`); join accuracy is the share of page breaks the reference covers where our split-or-join agrees with it, over all rows and over the high-confidence rows. A reference whose error plus no-answer share is over the ceiling is flagged by `pnpm score` and says little about that report.", "");
}

// 5. checklist
out.push(
  "### Checklist",
  "",
  "- [ ] I read the quality diff, the oracle table and the headline diff, not only the totals; every regression has a bead or a reason here.",
  "- [ ] No pass in this release was tuned on a held-out report (`reports/score-sets.yaml`): its examples came from the development set, and the held-out rows above did not fall. If one fell, say why it is not overfitting.",
  "- [ ] The adjudicated 'ours wrong / judged' did not rise on any report (a rise is a regression even where F1 is flat).",
  "- [ ] `docs/design/lessons.md` has a line for anything this release taught us.",
  "- [ ] After shipping: `pnpm quality ratchet --record`, `pnpm scorecard --record --no-score`, `pnpm score`, and commit `reports/quality-last.json`, `reports/verify-last.json` and `docs/scores.json`.",
  "",
);
const md = out.join("\n").replace(/\n{3,}/g, "\n\n");
if (opt("--out", null)) writeFileSync(opt("--out"), md);
console.log(md);
