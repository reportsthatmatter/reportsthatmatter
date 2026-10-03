/* Alignment scorer: score each report against its reference edition (reportsthatmatter-38s.2).
 *
 *   pnpm score <id> [<id> ...]     # one or more reports
 *   pnpm score --all               # every development-set report with a reference edition
 *   pnpm score --all --holdout     # the held-out set instead (report scores only; never tune on these)
 *     --out <dir>                  # where to write (default score-out/)
 *     --no-layout                  # skip pdftohtml layout features in the decision dataset
 *     --adjudicate-draft           # also write <out>/<id>/adjudicated-draft.yaml: 20 random + 10 disagreeing page breaks to adjudicate
 *     --json                       # also print the summary as JSON
 *     --shadow                     # a report served from a clean edition (cleanEdition in its ingest.ts):
 *                                  # score its PDF ingest, run as the shadow, against the served full.md
 *                                  # instead of reference/ (writes <out>/<id>-shadow/)
 *   pnpm score --diff <outA> <outB> [<id> ...] [--limit N]
 *                                  # decision-level flips between two runs' decisions.jsonl (correct to wrong,
 *                                  # wrong to correct, new, gone), with the text; scores nothing itself
 *
 * Reads reports/<id>/full.md (as aggregated) and <repo>/reference/{manifest.json,blocks.jsonl}
 * (scripts/score/reference.py writes them); RTM_REPO_ROOT=<dir> reads <dir>/<repo> instead of the
 * sibling checkout. Writes, per report, <out>/<id>/errors.md (the worst examples per metric,
 * clustered, with page and paragraph id), <out>/<id>/score.json, <out>/<id>/decisions.jsonl (one
 * row per pipeline decision with features and the reference label: the input to 38s.8) and
 * <out>/<id>/signals.md (b78.2 signal precision and recall against the scorer); and
 * <out>/summary.md across reports. Measure-only: changes nothing.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse } from "yaml";
import { renderArtifacts } from "@rtm/ingest";
import { parseOurs } from "../src/lib/score/ours.ts";
import { hasReference, loadReference, referenceFromMarkdown } from "../src/lib/score/reference.ts";
import { pathToFileURL } from "node:url";
import { score } from "../src/lib/score/score.ts";
import { errorReport, summaryRow, summaryTable } from "../src/lib/score/report.ts";
import { evaluateSignals, signalsTable } from "../src/lib/score/signals.ts";
import { decisionRows } from "../src/lib/score/decisions.ts";
import { loadLayout } from "../src/lib/score/layout.ts";
import { diffDecisions, formatDecisionDiff } from "../src/lib/score/diff.ts";
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

/**
 * `--shadow`: the served text is the reference and the PDF ingest the report
 * keeps as its shadow is what is scored. Runs the report's own ingest.ts with
 * the site's @rtm/ingest (which must know `cleanEdition`).
 */
async function shadowInputs(id, repo, served) {
  const ingest = await import("@rtm/ingest");
  const def = (await import(pathToFileURL(join(repo, "ingest.ts")).href)).default;
  const resolved = ingest.resolvePasses(def);
  if (!resolved.edition) throw new Error(`${id}: its ingest.ts declares no cleanEdition, so it has no shadow to score`);
  const corrections = existsSync(join(repo, "corrections.yaml")) ? ingest.parseCorrections(readFileSync(join(repo, "corrections.yaml"), "utf8"), id) : [];
  const volumes = def.volumes.map((v) => ingest.resolveVolume(def, v, repo));
  const result = ingest.ingestPageGroups(
    volumes.map((v) => ingest.extractPages(v)),
    { title: def.title, authors: def.authors, published_at: def.published_at, source_url: def.source_url },
    resolved,
    corrections,
    { layout: ingest.openLayout(volumes, join(repo, ".cache")) },
  );
  const manifest = {
    report: id,
    set: "development",
    edition: `the served text (reports/${id}/full.md), built from the clean edition its ingest.ts declares; scored: the PDF ingest kept as its shadow`,
    licence: "",
    sources: [],
    blocks: { path: `reports/${id}/full.md`, sha256: "", normaliser: "referenceFromMarkdown", counts: {} },
  };
  return { markdown: result.shadow.markdown, ref: { manifest, blocks: referenceFromMarkdown(parseOurs(served)) } };
}

if (flag("--diff")) {
  // pnpm score --diff <outA> <outB> [ids]: which decisions changed verdict between two runs
  const at = args.indexOf("--diff");
  const [dirA, dirB, ...rest] = args.slice(at + 1).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--limit");
  if (!dirA || !dirB) {
    console.error("usage: pnpm score --diff <outA> <outB> [<id> ...] [--limit N]   (each a --out directory of a previous run)");
    process.exit(2);
  }
  const read = (dir, id) => {
    const path = join(resolve(root, dir), id, "decisions.jsonl");
    return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : null;
  };
  const listed = (dir) => (existsSync(resolve(root, dir)) ? readdirSync(resolve(root, dir), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
  const wanted = rest.length ? rest : listed(dirA).filter((id) => listed(dirB).includes(id)).sort();
  if (!wanted.length) {
    console.error(`no report has decisions.jsonl in both ${dirA} and ${dirB}`);
    process.exit(2);
  }
  const limit = Number(opt("--limit", 8));
  for (const id of wanted) {
    const a = read(dirA, id);
    const b = read(dirB, id);
    if (!a || !b) {
      console.error(`${id}: no decisions.jsonl in ${!a ? dirA : dirB}`);
      process.exitCode = 1;
      continue;
    }
    console.log(formatDecisionDiff(id, diffDecisions(a, b), limit));
  }
  process.exit(process.exitCode ?? 0);
}
const rows = [];
const list = ids();
if (!list.length) {
  console.error("usage: pnpm score <id> | --all [--holdout] (no report with a reference edition found)");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
for (const id of list) {
  const repo = repoDir(id);
  if (!flag("--shadow") && !hasReference(repo)) {
    console.error(`${id}: no reference edition at ${repo}/reference (scripts/score/reference.py all ${id})`);
    process.exitCode = 1;
    continue;
  }
  const t0 = Date.now();
  const report = registry.reports.find((r) => r.id === id);
  // a queued report (not yet in the registry) is scored from its own repo's full.md
  const source = report ? join(root, report.source_path) : join(repo, "full.md");
  let markdown = readFileSync(source, "utf8");
  // the score reads the site's aggregated copy, which `pnpm ingest aggregate` refreshes: say so when it is behind its repo
  const repoCopy = join(repo, "full.md");
  if (report && existsSync(repoCopy) && readFileSync(repoCopy, "utf8") !== markdown) {
    console.error(`  ! ${id}: ${report.source_path} differs from ${repoCopy}; this scores the site's copy. Run pnpm ingest aggregate to score the repo's.`);
  }
  let ref;
  if (flag("--shadow")) ({ markdown, ref } = await shadowInputs(id, repo, markdown));
  else ref = loadReference(repo);
  if (ref.manifest.set === "held-out" && !flag("--holdout") && flag("--all")) continue;
  const ours = parseOurs(markdown);
  const result = score(ours, ref.blocks, { versionDiffers: ref.manifest.version?.differs });
  const dir = join(out, flag("--shadow") ? `${id}-shadow` : id);
  mkdirSync(dir, { recursive: true });

  // b78.2 signals against the scorer
  const dirGen = join(root, `assets/generated/reports/${id}`);
  let html, meta;
  if (!flag("--shadow") && existsSync(join(dirGen, "full-body.html")) && existsSync(join(dirGen, "meta.json"))) {
    html = readFileSync(join(dirGen, "full-body.html"), "utf8");
    meta = JSON.parse(readFileSync(join(dirGen, "meta.json"), "utf8"));
  } else ({ meta, fullBody: html } = renderArtifacts(markdown));
  const signals = evaluateSignals({ markdown, html, meta }, result);

  // decision dataset
  const layout = flag("--no-layout") ? null : loadLayout(repo);
  const decisions = decisionRows(id, result, layout);
  // the reference's own error rate: page breaks adjudicated against the PDF (reference/adjudicated.yaml)
  if (flag("--adjudicate-draft")) writeFileSync(join(dir, "adjudicated-draft.yaml"), draftAdjudication(id, decisions));
  const adjFile = flag("--shadow") ? null : loadAdjudicated(repo);
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
