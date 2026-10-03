/* Alignment scorer: score each report against its reference edition (reportsthatmatter-38s.2).
 *
 *   pnpm score                     # every report in reports/score-sets.yaml, the two sets reported separately;
 *                                  # writes the headline numbers to docs/scores.json (with the previous value and delta)
 *   pnpm score <id> [<id> ...]     # one or more reports (merged into docs/scores.json)
 *   pnpm score --all               # the development set only
 *   pnpm score --all --holdout     # the held-out set only (report scores only; never tune on these)
 *     --no-write                   # do not touch docs/scores.json
 *     --ungated                    # record reports that have no reference/adjudicated.yaml (default: printed, not recorded)
 *     --out <dir>                  # where to write (default score-out/)
 *     --no-layout                  # skip pdftohtml layout features in the decision dataset
 *     --adjudicate-draft           # also write <out>/<id>/adjudicated-draft.yaml: 20 random + 10 disagreeing page breaks to adjudicate
 *     --json                       # also print the summary as JSON
 *     --shadow                     # a report served from a clean edition (cleanEdition in its ingest.ts):
 *                                  # score its PDF ingest, run as the shadow, against the served full.md
 *                                  # instead of reference/ (writes <out>/<id>-shadow/); not recorded.
 *                                  # Without --shadow such a report is scored both ways (<out>/<id>/ is the edition
 *                                  # adapter against reference/, <out>/<id>-shadow/ the shadow) and docs/scores.json
 *                                  # records the shadow as the report's score, the adapter run as `adapter` (79ze)
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
 * <out>/summary.md across reports. Where the report repo has page references (reference/wikisource/, reference/page-text/),
 * also <out>/<id>/pages.md and pages.json: word error rate and footnote-marker accuracy per page (docs/scoring.md). Measure-only: changes nothing.
 */
import "./lib/help.mjs";
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
import { headline, headlineTable, mergeScores, referenceWarning, setOf, REFERENCE_CEILING } from "../src/lib/score/headline.ts";
import { loadPageRefs, pagesMarkdown, scorePages } from "../src/lib/score/pages.ts";
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

const setsRaw = parse(readFileSync(join(root, "reports/score-sets.yaml"), "utf8"));
const sets = { development: setsRaw.development ?? [], heldOut: setsRaw.held_out ?? [] };
const ceiling = { error: setsRaw.reference_ceiling?.error ?? REFERENCE_CEILING.error, noAnswer: setsRaw.reference_ceiling?.no_answer ?? REFERENCE_CEILING.noAnswer };

function ids() {
  const positional = args.filter((a, i) => !a.startsWith("--") && !["--out"].includes(args[i - 1]));
  if (positional.length) return positional;
  if (flag("--all")) return flag("--holdout") ? sets.heldOut : sets.development;
  return [...sets.development, ...sets.heldOut];
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

/** A report served from a clean edition declares `cleanEdition` in its own ingest.ts (reportsthatmatter-79ze). */
async function isHybrid(repo) {
  if (!existsSync(join(repo, "ingest.ts"))) return false;
  const ingest = await import("@rtm/ingest");
  const def = (await import(pathToFileURL(join(repo, "ingest.ts")).href)).default;
  return !!ingest.resolvePasses(def).edition;
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
const warnings = [];
const list = ids();
if (!list.length) {
  console.error("usage: pnpm score <id> | --all [--holdout] (no report with a reference edition found)");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
// in a shadow run the reference is the served text, so its own error rate says nothing; our adjudicated page breaks still count
const shadowMetrics = (m, shadow) => (shadow ? { ...m, ref_error_rate: null, ref_no_answer_rate: null, ref_unusable_rate: null } : m);

async function scoreReport(id, shadow) {
  const repo = repoDir(id);
  if (!shadow && !hasReference(repo)) {
    console.error(`${id}: no reference edition at ${repo}/reference (scripts/score/reference.py all ${id})`);
    process.exitCode = 1;
    return null;
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
  if (shadow) ({ markdown, ref } = await shadowInputs(id, repo, markdown));
  else ref = loadReference(repo);
  const set = setOf(sets, id) ?? "unassigned";
  if (set === "unassigned") warnings.push(`${id}: in neither set of reports/score-sets.yaml; add it to development or held_out before tuning against it`);
  else if (ref.manifest.set && ref.manifest.set !== set) warnings.push(`${id}: reports/score-sets.yaml says ${set}, ${repo}/reference/manifest.json says ${ref.manifest.set}; the config wins, fix the manifest`);
  const ours = parseOurs(markdown);
  const result = score(ours, ref.blocks, { versionDiffers: ref.manifest.version?.differs });
  const dir = join(out, shadow ? `${id}-shadow` : id);
  mkdirSync(dir, { recursive: true });

  // b78.2 signals against the scorer
  const dirGen = join(root, `assets/generated/reports/${id}`);
  let html, meta;
  if (!shadow && existsSync(join(dirGen, "full-body.html")) && existsSync(join(dirGen, "meta.json"))) {
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

  const row = { ...summaryRow(id, ref.manifest, result), set };
  // page-level references (Wikisource pages, checked transcriptions): word and footnote-marker accuracy per page
  const pageRefs = loadPageRefs(repo);
  const pageScores = pageRefs.length ? scorePages(ours, pageRefs) : null;
  if (pageScores) {
    writeFileSync(join(dir, "pages.md"), pagesMarkdown(id, pageScores.pages, pageScores.totals));
    writeFileSync(join(dir, "pages.json"), JSON.stringify({ id, totals: pageScores.totals, pages: pageScores.pages }, null, 1) + "\n");
  }
  const refWarning = referenceWarning(id, adj, ceiling);
  if (refWarning) warnings.push(refWarning);
  const entry = { id, row, signals, adj, set, pageScores, metrics: shadowMetrics(headline(row, decisions, adj, pageScores?.totals ?? null), shadow), gated: !!adj, refWarning };
  let errors = errorReport(id, ref.manifest, result, signals);
  if (adj) errors = errors.replace("\n## Excluded stretches", "\n" + adjudicationMarkdown(adj, adjFile, adjPairs) + "\n## Excluded stretches");
  else errors = errors.replace("\n## Excluded stretches", "\n## Reference error rate at page breaks\n\nNo `reference/adjudicated.yaml` in the report repo: the reference's own error rate is unknown.\n\n## Excluded stretches");
  writeFileSync(join(dir, "errors.md"), errors);
  writeFileSync(join(dir, "signals.md"), signalsTable(id, signals));
  const { detail, examples, ...rest } = result;
  writeFileSync(join(dir, "score.json"), JSON.stringify({ id, manifest: { set: ref.manifest.set, edition: ref.manifest.edition, version: ref.manifest.version }, ...rest, examples: examples.length, signals, adjudication: adj }, null, 1) + "\n");
  const b = row;
  console.log(
    `${id}: boundaries P ${fmt(b.boundaryP)} R ${fmt(b.boundaryR)} F1 ${fmt(b.boundaryF1)} · headings P ${fmt(b.headingP)} R ${fmt(b.headingR)} level ${fmt(b.headingLevel)} · markers P ${fmt(b.markerP)} R ${fmt(b.markerR)} · WER ${fmt(b.wer)} · OOV ${(b.oov * 100).toFixed(2)}% · reference page-break error ${adj ? `${adj.referenceWrong}/${adj.judged} = ${adj.referenceErrorRate === null ? "n/a" : fmt(adj.referenceErrorRate)}` : "not adjudicated"} · ${pageScores ? `page WER ${fmt(pageScores.totals.wer)} over ${pageScores.totals.pages} pages · page markers P ${fmt(pageScores.totals.markerP)} R ${fmt(pageScores.totals.markerR)}` : "no page references"} · ${decisions.length} decisions · ${((Date.now() - t0) / 1000).toFixed(1)}s → ${join(dir, "errors.md")}`,
  );
  return entry;
}

for (const id of list) {
  const repo = repoDir(id);
  const hybrid = !flag("--shadow") && (await isHybrid(repo));
  const entry = await scoreReport(id, flag("--shadow"));
  if (!entry) continue;
  rows.push(entry);
  if (hybrid) {
    // reportsthatmatter-79ze: the report's own score is its PDF pipeline, run as the shadow against the served text;
    // the default run above only says how well the edition adapter agrees with the scorer's reference adapter.
    // docs/scores.json records the shadow as `metrics` and the adapter run as `adapter` (the adjudication that gates
    // the report is the reference's, so the gate is the adapter run's); the tables show both, labelled.
    const shadowEntry = await scoreReport(id, true);
    entry.recordAs = { metrics: shadowEntry.metrics, adapter: entry.metrics };
    entry.row = { ...entry.row, id: `${id} (edition adapter vs reference adapter)` };
    shadowEntry.row = { ...shadowEntry.row, id: `${id} (PDF shadow)` };
    shadowEntry.displayOnly = true;
    rows.push(shadowEntry);
  }
}
if (rows.length) {
  let md = summaryTable(rows.map((r) => r.row), rows.map((r) => r.signals));
  const adjTable = ["", "## The reference's own error rate at page breaks", "", "Page breaks adjudicated against the PDF (`reference/adjudicated.yaml`): how often the reference and our text are wrong at them. The reference's error rate is the ceiling on trusting any page-break score above.", "", "| report | adjudicated | no reference answer | judged | reference wrong | reference error rate (95% interval) | wrong or no answer | ours wrong | our error rate |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|"];
  for (const r of rows.filter((x) => !x.displayOnly)) {
    const a = r.adj;
    const p = (x) => (x === null || x === undefined ? "n/a" : fmt(x));
    adjTable.push(a ? `| ${r.row.id} | ${a.breaks} | ${a.uncovered} | ${a.judged} | ${a.referenceWrong} | ${p(a.referenceErrorRate)}${a.referenceErrorCI ? ` (${p(a.referenceErrorCI[0])} to ${p(a.referenceErrorCI[1])})` : ""} | ${p(a.referenceUnusableRate)} | ${a.oursWrong}/${a.oursJudged} | ${p(a.oursErrorRate)} |` : `| ${r.row.id} | none | | | | not adjudicated | | | |`);
  }
  md += adjTable.join("\n") + "\n";
  const withPages = rows.filter((r) => r.pageScores);
  if (withPages.length) {
    md += ["", "## Page-level references", "", "Our text against human-checked page transcriptions (`reference/wikisource/`, `reference/page-text/`): word error rate and footnote-marker accuracy over the pages that have one. Per page: `<id>/pages.md`.", "", "| report | pages | reference words | WER | markers (reference) | markers (ours) | marker precision | marker recall |", "|---|---:|---:|---:|---:|---:|---:|---:|", ...withPages.map((r) => { const t = r.pageScores.totals; return `| ${r.row.id} | ${t.pages} | ${t.refWords} | ${fmt(t.wer)} | ${t.refMarkers} | ${t.ourMarkers} | ${fmt(t.markerP)} | ${fmt(t.markerR)} |`; })].join("\n") + "\n";
  }
  writeFileSync(join(out, flag("--holdout") ? "summary-holdout.md" : "summary.md"), md);
  console.log("\n" + md.split("\n## ")[0]);
  if (flag("--json")) console.log(JSON.stringify(rows.map((r) => r.row), null, 1));

  // headline numbers: docs/scores.json, the dev and held-out sets separately, with the previous value and delta
  const SCORES = join(root, "docs/scores.json");
  const old = existsSync(SCORES) ? JSON.parse(readFileSync(SCORES, "utf8")) : null;
  const pin = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies?.["@rtm/ingest"]?.split("#").pop();
  const recordable = rows.filter((r) => !r.displayOnly && (r.gated || flag("--ungated")));
  for (const r of rows.filter((x) => !x.displayOnly && !x.gated && !flag("--ungated"))) warnings.push(`${r.id}: not recorded in docs/scores.json (no reference/adjudicated.yaml; --ungated to record it anyway)`);
  const fresh = Object.fromEntries(recordable.map((r) => [r.id, { set: r.set, metrics: r.recordAs?.metrics ?? r.metrics, ...(r.recordAs ? { adapter: r.recordAs.adapter } : {}) }]));
  const merged = mergeScores(old, fresh, pin);
  const section = (title, want) => {
    const here = Object.fromEntries(Object.entries(merged.reports).filter(([id, e]) => e.set === want && id in fresh));
    if (!Object.keys(here).length) return "";
    return `\n### ${title}\n\n` + headlineTable(here, "previous") + "\n";
  };
  const heldOutFell = Object.entries(merged.reports).filter(([id, e]) => e.set === "held-out" && id in fresh && e.previous && e.metrics.boundary_f1 < e.previous.boundary_f1 - 0.0005);
  let card = `## Headline scores (ingest ${pin ?? "?"})\n` + section("Development set (tune on these)", "development") + section("Held-out set (report only: a pass must not lower these, and must not be tuned on them)", "held-out");
  if (existsSync(SCORES) || !flag("--no-write")) card += "\n(Deltas are against the previous value recorded in docs/scores.json; `▼` marks a regression. 'ours wrong / judged' is on the adjudicated page breaks.)\n";
  console.log("\n" + card);
  for (const [id, e] of heldOutFell) warnings.push(`${id}: held-out boundary F1 fell ${(e.previous.boundary_f1 * 100).toFixed(1)}% to ${(e.metrics.boundary_f1 * 100).toFixed(1)}%: was this pass tuned on the held-out set, or does it not generalise? (docs/design/lessons.md)`);
  if (!flag("--no-write") && recordable.length) {
    writeFileSync(SCORES, JSON.stringify(merged, null, 1) + "\n");
    console.log(`wrote ${SCORES}`);
  }
}
if (warnings.length) console.log("\nWARNINGS\n" + warnings.map((w) => `  ! ${w}`).join("\n"));
