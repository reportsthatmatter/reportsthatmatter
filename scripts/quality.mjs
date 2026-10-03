/* Corpus quality signals with per-report budgets (reportsthatmatter-b78.2).
 *
 *   pnpm quality check              # fail if any gated signal exceeds its budget
 *   pnpm quality report [<id>]      # per-report × per-signal table (markdown)
 *   pnpm quality report --diff [<ref>]
 *                                   # the table against reports/quality-last.json at <ref>
 *                                   # (default origin/main); paste into release / pin-bump PRs
 *   pnpm quality ratchet [<id>]     # lower budgets to the current counts, never up
 *     --dry-run                     # print what would be lowered, write nothing
 *     --record                      # also write reports/quality-last.json (at an accepted release)
 *   pnpm quality hint               # one line if budgets are >= 10% above their counts (verify.sh)
 *   pnpm quality row <id>           # one report's counts, budgets and last-recorded (publish-report)
 *   pnpm quality baseline --why <reason>
 *                                   # regenerate every budget (and the defaults) from the
 *                                   # current corpus; run after a re-ingest, read the diff
 *
 * Reads reports/<id>/full.md as aggregated and the pre-rendered
 * assets/generated/reports/<id>/{full-body.html,meta.json} (verify.sh runs
 * `pnpm prerender` first; absent, it renders in memory). Design:
 * docs/design/2026-10-02-quality-harness-plan.md §3.1.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { renderArtifacts } from "@rtm/ingest";
import { assertFresh } from "./prerender-stamp.mjs";
import { measure } from "../src/lib/quality/index.ts";
import { SIGNALS } from "../src/lib/quality/signals.ts";
import {
  GATED,
  budgetFor,
  deriveDefaults,
  exceeded,
  parseBudgetFile,
  raisedBudgets,
  ratchet,
  ratchetable,
  serializeBudgetFile,
} from "../src/lib/quality/budget.ts";
import { diffTable, parseRecorded, serializeRecorded, staleRecord } from "../src/lib/quality/diff.ts";

const root = join(import.meta.dirname, "..");
const BUDGET_PATH = "reports/quality-budget.yaml";
const LAST_PATH = "reports/quality-last.json";
const lastPath = join(root, LAST_PATH);
const budgetPath = join(root, BUDGET_PATH);

const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
const readBudget = () => (existsSync(budgetPath) ? parseBudgetFile(readFileSync(budgetPath, "utf8")) : parseBudgetFile(""));

function load(report, file) {
  const markdown = readFileSync(join(root, report.source_path), "utf8");
  const dir = join(root, `assets/generated/reports/${report.id}`);
  let html;
  let meta;
  if (existsSync(join(dir, "full-body.html")) && existsSync(join(dir, "meta.json"))) {
    html = readFileSync(join(dir, "full-body.html"), "utf8");
    meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  } else {
    ({ meta, fullBody: html } = renderArtifacts(markdown));
  }
  return { markdown, html, meta, citationVocabulary: file.reports[report.id]?.citationVocabulary };
}

function measureAll(file, only) {
  return registry.reports
    .filter((r) => !only || r.id === only)
    .map((report) => {
      const input = load(report, file);
      return { id: report.id, words: input.meta.words, measurement: measure(input) };
    });
}

const fmt = (n) => n.toLocaleString("en-US");

function cmdCheck() {
  const file = readBudget();
  if (!Object.keys(file.reports).length) {
    console.error(`${BUDGET_PATH} is missing or empty: run \`pnpm quality baseline --why "first run"\`.`);
    process.exit(1);
  }
  let failed = 0;
  for (const { id, words, measurement } of measureAll(file)) {
    const over = exceeded(file, id, words, measurement.counts);
    if (!over.length) {
      console.log(`✓ ${id}`);
      continue;
    }
    failed++;
    console.log(`✗ ${id}: ${over.map((o) => `${o.signal}: ${fmt(o.count)}/${fmt(o.budget)}`).join(", ")}`);
    for (const o of over) {
      for (const f of measurement.findings[o.signal].slice(0, 3)) {
        console.log(`    ${o.signal}${f.page != null ? ` p.${f.page}` : ""}: ${f.excerpt}`);
      }
    }
  }
  // A budget raised without its reason.
  let previous = null;
  try {
    previous = parseBudgetFile(
      execFileSync("git", ["show", `HEAD:${BUDGET_PATH}`], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString(),
    );
  } catch {
    // not in git, or not committed yet: nothing to compare with
  }
  if (previous) {
    for (const r of raisedBudgets(previous, file)) {
      if (r.why) continue;
      failed++;
      console.log(`✗ ${r.report}: ${r.signal} budget raised ${r.from} → ${r.to} with no \`# why: <bead>\` comment`);
    }
  }
  if (failed) {
    console.log(`\n${failed} quality failure(s). Fix the output, or (after reading the excerpts) raise the budget by hand with a \`# why: <bead id>\` comment.`);
    process.exit(1);
  }
  console.log(`\nAll ${registry.reports.length} reports within budget.`);
}

const gitShow = (ref, path) => {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString();
  } catch {
    return null;
  }
};

const currentCounts = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.measurement.counts]));

function cmdReport(args) {
  const diffAt = args.indexOf("--diff");
  if (diffAt >= 0) {
    const next = args[diffAt + 1];
    const ref = next && !next.startsWith("--") ? next : "origin/main";
    const text = gitShow(ref, LAST_PATH);
    const rows = measureAll(readBudget());
    console.log(diffTable(text ? parseRecorded(text) : null, currentCounts(rows), ref));
    return;
  }
  const only = args.find((a) => !a.startsWith("--"));
  const file = readBudget();
  const rows = measureAll(file, only);
  console.log(`| signal | ${rows.map((r) => r.id).join(" | ")} | total |`);
  console.log(`|---|${rows.map(() => "---:").join("|")}|---:|`);
  for (const s of SIGNALS) {
    const counts = rows.map((r) => r.measurement.counts[s.id]);
    const cells = counts.map((c) => (s.kind === "metric" && c ? `${c}%` : fmt(c)));
    const total = s.kind === "metric" ? "" : fmt(counts.reduce((a, b) => a + b, 0));
    console.log(`| ${s.id}${s.advisory ? " (advisory)" : ""} | ${cells.join(" | ")} | ${total} |`);
  }
  console.log("\n| report | signal | count | budget | delta |");
  console.log("|---|---|---:|---:|---:|");
  for (const { id, words, measurement } of rows) {
    for (const s of GATED) {
      const count = measurement.counts[s.id];
      const budget = budgetFor(file, id, s.id, words);
      if (!count && !budget) continue;
      const delta = count - budget;
      console.log(`| ${id} | ${s.id} | ${fmt(count)} | ${fmt(budget)} | ${delta > 0 ? "+" : ""}${fmt(delta)} |`);
    }
  }
  console.log("\n| report | bare markers, % of all markers | contents entries | …without a heading | quotes on even pages, % | on odd pages, % |");
  console.log("|---|---:|---:|---:|---:|---:|");
  for (const { id, measurement: { stats } } of rows) {
    console.log(
      `| ${id} | ${stats.bareMarkerPercent.toFixed(1)} | ${fmt(stats.contentsEntries)} | ${(stats.contentsMissingRatio * 100).toFixed(1)}% | ${stats.quoteEvenPercent.toFixed(1)} | ${stats.quoteOddPercent.toFixed(1)} |`,
    );
  }
}

function cmdRatchet(args) {
  const dry = args.includes("--dry-run");
  const record = args.includes("--record");
  if (dry && record) {
    console.error("--dry-run writes nothing, so it cannot --record.");
    process.exit(2);
  }
  const only = args.find((a) => !a.startsWith("--"));
  if (record && only) {
    console.error("--record snapshots the whole corpus; drop the report id.");
    process.exit(2);
  }
  const file = readBudget();
  let changed = 0;
  const rows = measureAll(file, only);
  for (const { id, measurement } of rows) {
    const { next, lowered } = ratchet(file, id, measurement.counts);
    if (!lowered.length) continue;
    if (!dry) {
      // A `# why:` explains a raise; once the budget is lowered it is stale.
      for (const signal of Object.keys(next)) if (next[signal] < file.reports[id].budgets[signal]) delete file.comments[`${id}.${signal}`];
      file.reports[id].budgets = next;
    }
    changed += lowered.length;
    console.log(`${id}: ${lowered.join(", ")}`);
  }
  if (!dry) writeFileSync(budgetPath, serializeBudgetFile(file));
  const verb = dry ? "Would lower" : "Lowered";
  console.log(changed ? `\n${verb} ${changed} budget(s).${dry ? " Nothing written." : ""}` : "Nothing to lower: every budget is at its current count.");
  if (record) {
    const ingest = JSON.parse(readFileSync(join(root, "node_modules/@rtm/ingest/package.json"), "utf8")).version;
    writeFileSync(
      lastPath,
      serializeRecorded({ ingest: `v${ingest}`, recorded: new Date().toISOString().slice(0, 10), reports: currentCounts(rows) }),
    );
    console.log(`Recorded ${rows.length} reports' counts in ${LAST_PATH} (ingest v${ingest}). Commit it with the budget file.`);
  }
}

function cmdHint() {
  const file = readBudget();
  const slack = measureAll(file).flatMap((r) => ratchetable(file, r.id, r.measurement.counts));
  if (slack.length) console.log(`${slack.length} budget${slack.length === 1 ? "" : "s"} can be ratcheted: pnpm quality ratchet`);
  if (existsSync(lastPath)) {
    const installed = JSON.parse(readFileSync(join(root, "node_modules/@rtm/ingest/package.json"), "utf8")).version;
    const stale = staleRecord(parseRecorded(readFileSync(lastPath, "utf8")).ingest, installed);
    if (stale) console.log(stale);
  }
}

function cmdRow(id) {
  if (!id) {
    console.error("usage: pnpm quality row <id>");
    process.exit(2);
  }
  const file = readBudget();
  const [row] = measureAll(file, id);
  if (!row) {
    console.error(`${id} is not in reports/registry.yaml`);
    process.exit(1);
  }
  const last = existsSync(lastPath) ? parseRecorded(readFileSync(lastPath, "utf8")).reports[id] : undefined;
  console.log(`quality: ${id} (budget, last release in brackets)`);
  const cells = [];
  for (const s of SIGNALS) {
    const count = row.measurement.counts[s.id];
    const budget = s.advisory ? null : budgetFor(file, id, s.id, row.words);
    const over = budget !== null && count > budget;
    cells.push(`${s.id} ${fmt(count)}${budget !== null ? `/${fmt(budget)}` : ""}${last?.[s.id] !== undefined ? ` [${fmt(last[s.id])}]` : ""}${over ? " OVER" : ""}`);
  }
  console.log(`  ${cells.join("\n  ")}`);
}

function cmdBaseline(args) {
  const whyAt = args.indexOf("--why");
  const why = whyAt >= 0 ? args[whyAt + 1] : null;
  const old = readBudget();
  const rows = measureAll(old);
  const next = { defaults: deriveDefaults(rows.map((r) => ({ words: r.words, counts: r.measurement.counts }))), reports: {}, comments: {} };
  const raised = [];
  for (const { id, measurement } of rows) {
    const budgets = {};
    for (const s of GATED) {
      budgets[s.id] = measurement.counts[s.id];
      const before = old.reports[id]?.budgets[s.id];
      if (before !== undefined && budgets[s.id] > before) raised.push(`${id}.${s.id} ${before} → ${budgets[s.id]}`);
      const keep = old.comments[`${id}.${s.id}`];
      if (keep && budgets[s.id] >= (before ?? 0)) next.comments[`${id}.${s.id}`] = keep;
    }
    next.reports[id] = { budgets, ...(old.reports[id]?.citationVocabulary ? { citationVocabulary: old.reports[id].citationVocabulary } : {}) };
  }
  if (raised.length && !why) {
    console.error(`Baseline would raise ${raised.length} budget(s):\n  ${raised.join("\n  ")}\nRe-run with --why "<reason, e.g. re-ingest to ingest vX.Y.Z>" to record it.`);
    process.exit(1);
  }
  for (const r of raised) {
    const [key] = r.split(" ");
    next.comments[key] = `# why: ${why}`;
  }
  writeFileSync(budgetPath, serializeBudgetFile(next));
  console.log(`Wrote ${BUDGET_PATH} for ${rows.length} reports${raised.length ? `; ${raised.length} raised (# why: ${why})` : ""}. Read \`git diff ${BUDGET_PATH}\` before committing.`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "check") {
  assertFresh("pnpm quality check");
  cmdCheck();
}
else if (cmd === "report") cmdReport(args);
else if (cmd === "ratchet") cmdRatchet(args);
else if (cmd === "hint") cmdHint();
else if (cmd === "row") cmdRow(args[0]);
else if (cmd === "baseline") cmdBaseline(args);
else {
  console.error("usage: pnpm quality check | report [<id>|--diff [<ref>]] | ratchet [<id>] [--dry-run|--record] | hint | row <id> | baseline --why <reason>");
  process.exit(2);
}
