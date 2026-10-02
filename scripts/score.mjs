/* Alignment scorer: score each report against its reference edition (reportsthatmatter-38s.2).
 *
 *   pnpm score <id> [<id> ...]     # one or more reports
 *   pnpm score --all               # every development-set report with a reference edition
 *   pnpm score --all --holdout     # the held-out set instead (report scores only; never tune on these)
 *     --out <dir>                  # where to write (default score-out/)
 *     --no-layout                  # skip pdftohtml layout features in the decision dataset
 *     --adjudicate-draft           # also write <out>/<id>/adjudicated-draft.yaml: 20 random + 10 disagreeing page breaks to adjudicate
 *     --json                       # also print the summary as JSON
 *
 * Reads reports/<id>/full.md (as aggregated) and <repo>/reference/{manifest.json,blocks.jsonl}
 * (scripts/score/reference.py writes them); RTM_REPO_ROOT=<dir> reads <dir>/<repo> instead of the
 * sibling checkout. Writes, per report, <out>/<id>/errors.md (the worst examples per metric,
 * clustered, with page and paragraph id), <out>/<id>/score.json, <out>/<id>/decisions.jsonl (one
 * row per pipeline decision with features and the reference label: the input to 38s.8) and
 * <out>/<id>/signals.md (b78.2 signal precision and recall against the scorer); and
 * <out>/summary.md across reports. Measure-only: changes nothing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse } from "yaml";
import { renderArtifacts } from "@rtm/ingest";
import { parseOurs } from "../src/lib/score/ours.ts";
import { hasReference, loadReference } from "../src/lib/score/reference.ts";
import { score } from "../src/lib/score/score.ts";
import { errorReport, summaryRow, summaryTable } from "../src/lib/score/report.ts";
import { evaluateSignals, signalsTable } from "../src/lib/score/signals.ts";
import { decisionRows } from "../src/lib/score/decisions.ts";
import { loadLayout } from "../src/lib/score/layout.ts";
import { adjudicationMarkdown, adjudicationStats, applyAdjudication, draftAdjudication, loadAdjudicated } from "../src/lib/score/adjudicated.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const out = resolve(root, opt("--out", "score-out"));
const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
const manifest = parse(readFileSync(join(root, "reports/manifest.yaml"), "utf8"));

function repoDir(id) {
  const entry = manifest.reports.find((r) => r.id === id);
  const dir = entry ? resolve(root, entry.dir) : resolve(root, "..", id);
  const alt = process.env.RTM_REPO_ROOT;
  if (alt && existsSync(join(alt, basename(dir)))) return join(alt, basename(dir));
  return dir;
}

function ids() {
  const positional = args.filter((a, i) => !a.startsWith("--") && !["--out"].includes(args[i - 1]));
  if (!flag("--all")) return positional;
  const want = flag("--holdout") ? "held-out" : "development";
  const known = [...new Set([...registry.reports.map((r) => r.id), ...manifest.reports.map((r) => r.id), "us-duelfer-report"])];
  return known
    .filter((id) => hasReference(repoDir(id)) && loadReference(repoDir(id)).manifest.set === want);
}

const fmt = (n) => (n * 100).toFixed(1) + "%";
const rows = [];
const list = ids();
if (!list.length) {
  console.error("usage: pnpm score <id> | --all [--holdout] (no report with a reference edition found)");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
for (const id of list) {
  const repo = repoDir(id);
  if (!hasReference(repo)) {
    console.error(`${id}: no reference edition at ${repo}/reference (scripts/score/reference.py all ${id})`);
    process.exitCode = 1;
    continue;
  }
  const t0 = Date.now();
  const report = registry.reports.find((r) => r.id === id);
  // a queued report (not yet in the registry) is scored from its own repo's full.md
  const source = report ? join(root, report.source_path) : join(repo, "full.md");
  const markdown = readFileSync(source, "utf8");
  const ref = loadReference(repo);
  if (ref.manifest.set === "held-out" && !flag("--holdout") && flag("--all")) continue;
  const ours = parseOurs(markdown);
  const result = score(ours, ref.blocks, { versionDiffers: ref.manifest.version?.differs });
  const dir = join(out, id);
  mkdirSync(dir, { recursive: true });

  // b78.2 signals against the scorer
  const dirGen = join(root, `assets/generated/reports/${id}`);
  let html, meta;
  if (existsSync(join(dirGen, "full-body.html")) && existsSync(join(dirGen, "meta.json"))) {
    html = readFileSync(join(dirGen, "full-body.html"), "utf8");
    meta = JSON.parse(readFileSync(join(dirGen, "meta.json"), "utf8"));
  } else ({ meta, fullBody: html } = renderArtifacts(markdown));
  const signals = evaluateSignals({ markdown, html, meta }, result);

  // decision dataset
  const layout = flag("--no-layout") ? null : loadLayout(repo);
  const decisions = decisionRows(id, result, layout);
  // the reference's own error rate: page breaks adjudicated against the PDF (reference/adjudicated.yaml)
  if (flag("--adjudicate-draft")) writeFileSync(join(dir, "adjudicated-draft.yaml"), draftAdjudication(id, decisions));
  const adjFile = loadAdjudicated(repo);
  const adjPairs = adjFile ? applyAdjudication(decisions, adjFile) : [];
  const adj = adjFile ? adjudicationStats(adjPairs) : null;
  writeFileSync(join(dir, "decisions.jsonl"), decisions.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const row = summaryRow(id, ref.manifest, result);
  rows.push({ row, signals, adj });
  let errors = errorReport(id, ref.manifest, result, signals);
  if (adj) errors = errors.replace("\n## Excluded stretches", "\n" + adjudicationMarkdown(adj, adjFile, adjPairs) + "\n## Excluded stretches");
  else errors = errors.replace("\n## Excluded stretches", "\n## Reference error rate at page breaks\n\nNo `reference/adjudicated.yaml` in the report repo: the reference's own error rate is unknown.\n\n## Excluded stretches");
  writeFileSync(join(dir, "errors.md"), errors);
  writeFileSync(join(dir, "signals.md"), signalsTable(id, signals));
  const { detail, examples, ...rest } = result;
  writeFileSync(join(dir, "score.json"), JSON.stringify({ id, manifest: { set: ref.manifest.set, edition: ref.manifest.edition, version: ref.manifest.version }, ...rest, examples: examples.length, signals, adjudication: adj }, null, 1) + "\n");
  const b = row;
  console.log(
    `${id}: boundaries P ${fmt(b.boundaryP)} R ${fmt(b.boundaryR)} F1 ${fmt(b.boundaryF1)} · headings P ${fmt(b.headingP)} R ${fmt(b.headingR)} level ${fmt(b.headingLevel)} · markers P ${fmt(b.markerP)} R ${fmt(b.markerR)} · WER ${fmt(b.wer)} · OOV ${(b.oov * 100).toFixed(2)}% · reference page-break error ${adj ? `${adj.referenceWrong}/${adj.judged} = ${adj.referenceErrorRate === null ? "n/a" : fmt(adj.referenceErrorRate)}` : "not adjudicated"} · ${decisions.length} decisions · ${((Date.now() - t0) / 1000).toFixed(1)}s → ${join(dir, "errors.md")}`,
  );
}
if (rows.length) {
  let md = summaryTable(rows.map((r) => r.row), rows.map((r) => r.signals));
  const adjTable = ["", "## The reference's own error rate at page breaks", "", "Page breaks adjudicated against the PDF (`reference/adjudicated.yaml`): how often the reference and our text are wrong at them. The reference's error rate is the ceiling on trusting any page-break score above.", "", "| report | adjudicated | no reference answer | judged | reference wrong | reference error rate (95% interval) | wrong or no answer | ours wrong | our error rate |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|"];
  for (const r of rows) {
    const a = r.adj;
    const p = (x) => (x === null || x === undefined ? "n/a" : fmt(x));
    adjTable.push(a ? `| ${r.row.id} | ${a.breaks} | ${a.uncovered} | ${a.judged} | ${a.referenceWrong} | ${p(a.referenceErrorRate)}${a.referenceErrorCI ? ` (${p(a.referenceErrorCI[0])} to ${p(a.referenceErrorCI[1])})` : ""} | ${p(a.referenceUnusableRate)} | ${a.oursWrong}/${a.oursJudged} | ${p(a.oursErrorRate)} |` : `| ${r.row.id} | none | | | | not adjudicated | | | |`);
  }
  md += adjTable.join("\n") + "\n";
  writeFileSync(join(out, flag("--holdout") ? "summary-holdout.md" : "summary.md"), md);
  console.log("\n" + md.split("\n## ")[0]);
  if (flag("--json")) console.log(JSON.stringify(rows.map((r) => r.row), null, 1));
}
