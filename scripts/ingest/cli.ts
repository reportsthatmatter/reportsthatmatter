#!/usr/bin/env node
/**
 * Report ingestion.
 *
 *   pnpm ingest run <pdf> [<pdf>...] --id <slug> --title "..." [--authors "..."] [--published 2025]
 *   pnpm ingest try <branch|path> [<id>...] [--no-score] [--keep]   what an unreleased ingest does to the rendered corpus (scripts/ingest/try.ts)
 *   pnpm ingest verify [<slug>] [--no-oracle] [--no-golden] [--findings] [--explain]
 *   pnpm ingest preflight [<slug>...]           is each repo's installed @rtm/ingest the one it pins? (run, verify, check, baseline do this first; --no-preflight skips)
 *   pnpm ingest outline <slug>                  one line per PDF page: headings, block counts (to choose golden pages)
 *   pnpm ingest page <slug> <volume> <pdfPage> [--draft] [--fixture <name> [--fixture-dir <dir>]]
 *
 * `run` writes reports/<slug>/full.md plus a fidelity report; `verify` re-runs
 * the checks against what is already committed. More than one PDF concatenates
 * them, in argument order, into one document before extraction — a multi-volume
 * report (Leveson: 4; Chilcot: dozens) is one continuous inquiry with its own
 * running footnote numbers and page markers, not several unrelated reports, and
 * splitting it into separate `full.md` files would break both across volume
 * boundaries. Page indices are renumbered to run continuously across every
 * volume, so a fidelity note's "page" never collides between one volume's
 * page 12 and another's.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { formatPreflight, preflight } from "../lib/preflight.ts";
import { pathToFileURL } from "node:url";
import { checkOracleBudget, loadOracleBudget, ratchetOracleBudgetFile } from "./oracle-budget";
import {
  Baseline,
  Correction,
  Dismissal,
  IngestResult,
  Page,
  PipelineDef,
  ASSERTION_KINDS,
  checkGoldenPage,
  checkVolume,
  computeBaseline,
  correctionVocabulary,
  diffBaselines,
  draftGolden,
  extractPages,
  finalBlocks,
  ingestPageGroups,
  measureLayout,
  ORACLE_SIGNALS,
  openLayout,
  pageFixture,
  parseCorrections,
  parseGolden,
  parseDismissals,
  popplerVersion,
  popplerWarning,
  resolvePasses,
  renderPage,
  resolveVolume,
  runChecks,
  scoreOracle,
  layoutXml,
  type OracleReport,
  type PageCounts,
} from "@rtm/ingest";

const ROOT = join(import.meta.dirname, "../..");
const ORACLE_BUDGET_PATH = join(ROOT, "reports/oracle-budget.yaml");
const REPORTS = join(ROOT, "reports");

/**
 * Where each report's authority lives.
 *
 * A migrated report owns its build in its own repo; one still under
 * `reports/<id>` has not moved yet. Both work, so the migration is per report
 * rather than a single flag day.
 */
function reportDirs(): Map<string, string> {
  const raw = parseYaml(readFileSync(join(REPORTS, "manifest.yaml"), "utf8")) as {
    reports?: Array<{ id: string; dir: string }>;
  };
  // RTM_REPORT_DIRS=<dir>: use <dir>/<repo> where it exists, so a report repo's git worktree
  // (golden.yaml, an ingest.ts under change) is read instead of the shared checkout.
  const override = process.env.RTM_REPORT_DIRS;
  return new Map(
    (raw.reports ?? []).map((entry) => {
      const alt = override ? join(resolve(override), basename(entry.dir)) : undefined;
      return [entry.id, alt && existsSync(alt) ? alt : join(ROOT, entry.dir)];
    })
  );
}

function reportDir(id: string): string {
  const dir = reportDirs().get(id);
  if (!dir) throw new Error(`${id} is not in reports/manifest.yaml`);
  return dir;
}

/** Copies each report's authoritative markdown into this repo for serving. */
function runAggregate(): number {
  for (const [id, dir] of reportDirs()) {
    const source = join(dir, "full.md");
    if (!existsSync(source)) {
      console.error(
        `  \x1b[31m✗\x1b[0m ${id}: no full.md at ${dir}\n` +
          "      Clone the report repo alongside this one, or fix its dir in " +
          "reports/manifest.yaml. Serving a stale copy silently is worse."
      );
      return 1;
    }
    const target = join(REPORTS, id, "full.md");
    if (resolve(source) === resolve(target)) continue;
    mkdirSync(join(REPORTS, id), { recursive: true });
    const markdown = readFileSync(source, "utf8");
    const current = existsSync(target) ? readFileSync(target, "utf8") : null;
    if (current !== markdown) {
      writeFileSync(target, markdown, "utf8");
      console.log(`  updated reports/${id}/full.md from ${dir}`);
    }
    copyProcessingNotes(id, dir);
  }
  return 0;
}

/**
 * A report's own account of how it was processed, if it has written one.
 * Optional, unlike full.md: absent is normal, and the site shows no link.
 * Copied by the same step as full.md for the same reason — a cold clone must
 * build without a sibling checkout.
 */
function copyProcessingNotes(id: string, dir: string): void {
  const source = join(dir, "PROCESSING.md");
  const target = join(REPORTS, id, "PROCESSING.md");
  if (!existsSync(source)) return;
  if (resolve(source) === resolve(target)) return;
  const text = readFileSync(source, "utf8");
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (current !== text) {
    writeFileSync(target, text, "utf8");
    console.log(`  updated reports/${id}/PROCESSING.md from ${dir}`);
  }
}

/** The suspects this report's reviewers have judged correct as they stand. */
function loadDismissals(id: string): Dismissal[] {
  const path = join(reportDir(id), "corrections.yaml");
  if (!existsSync(path)) return [];
  return parseDismissals(readFileSync(path, "utf8"), id);
}

/** A report's corrections, if it has any. Absent is normal, not an error. */
function loadCorrections(id: string): Correction[] {
  const path = join(reportDir(id), "corrections.yaml");
  if (!existsSync(path)) return [];
  return parseCorrections(readFileSync(path, "utf8"), id);
}

/**
 * Loads a report's pipeline definition — the program in its own directory
 * that says how it is built. Dynamic because each report owns its own file.
 */
async function loadDefinition(id: string): Promise<PipelineDef> {
  const path = join(reportDir(id), "ingest.ts");
  if (!existsSync(path)) {
    throw new Error(
      `No pipeline for ${id}: expected ${path}`
    );
  }
  const module = await import(pathToFileURL(path).href);
  return module.default as PipelineDef;
}

/**
 * The report's source PDFs as a lazy line layout, cached under the report
 * repo's `.cache/` (self-ignoring), for passes that gate on layout and for
 * the oracle. Costs nothing until something asks for a line.
 */
function layoutFor(def: PipelineDef) {
  return openLayout(
    def.volumes.map((volume) => resolveVolume(def, volume, reportDir(def.id))),
    join(reportDir(def.id), ".cache")
  );
}

function arg(flags: string[], name: string): string | undefined {
  const i = flags.indexOf(`--${name}`);
  return i === -1 ? undefined : flags[i + 1];
}

function reportChecks(label: string, checks: ReturnType<typeof runChecks>): boolean {
  console.log(`\n${label}`);
  let ok = true;
  for (const check of checks) {
    // Informational checks (ingest >= the release after v0.15.0) measure without gating.
    const info = (check as { info?: boolean }).info;
    console.log(`  ${info ? "·" : check.ok ? "[32m✓[0m" : "[31m✗[0m"} ${check.name} — ${check.detail}`);
    if (!check.ok) ok = false;
  }
  return ok;
}

async function runIngest(argv: string[]): Promise<number> {
  const id = argv[0];
  if (!id || id.startsWith("--")) {
    console.error("Usage: pnpm ingest run <report-id>");
    return 1;
  }

  let def: PipelineDef;
  try {
    def = await loadDefinition(id);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const pageGroups: Page[][] = [];
  for (const volume of def.volumes) {
    const check = checkVolume(def, volume, reportDir(id));
    if (check.matched === false) {
      console.error(
        `Checksum mismatch for ${volume.path}\n` +
          `  definition: ${volume.sha256}\n` +
          `  on disk:    ${check.sha256}\n` +
          "The source changed, or the definition is wrong. Do not ingest until this is resolved."
      );
      return 1;
    }
    if (check.matched === null) console.log(`  (no checksum recorded for ${volume.path})`);
    console.log(`Extracting ${volume.path} …`);
    pageGroups.push(extractPages(check.path));
  }

  const result = ingestPageGroups(
    pageGroups,
    {
      title: def.title,
      authors: def.authors,
      published_at: def.published_at,
      source_url: def.source_url,
    },
    resolvePasses(def),
    loadCorrections(id),
    { layout: layoutFor(def) }
  );

  return writeReport(id, def.title, result, loadCorrections(id), loadDismissals(id));
}

/**
 * Where to look in the source. A flat page index is useless for a multi-volume
 * report — Leveson's four PDFs each start at page 1 — so cite the volume and
 * the page you would actually open the file at.
 */
function where(s: { page: number; volume?: number; pdfIndex?: number }): string {
  if (s.volume === undefined || s.pdfIndex === undefined) return String(s.page);
  return `Vol ${s.volume} · PDF p.${s.pdfIndex}`;
}

/** Writes a report's markdown and its OCR review queue, then gates on fidelity. */
function writeReport(
  id: string,
  title: string,
  result: IngestResult,
  corrections: Correction[] = [],
  dismissed: Dismissal[] = []
): number {
  const dir = reportDir(id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "full.md"), result.markdown, "utf8");

  // A suspect a reviewer has already judged correct is not a finding. Dropping
  // it here is what lets the queue shrink as it is worked through, instead of
  // presenting the same list forever (#105).
  const judged = new Set(dismissed.map((entry) => entry.match));
  const open = result.suspects.filter((suspect) => !judged.has(suspect.match));

  const suspectReport = [
    `# Fidelity review — ${title}`,
    "",
    `Pages: ${result.pages}  ·  Footnotes: ${result.footnotes.length}  ·  Auto-fixes applied: ${result.autoFixes}  ·  Human corrections: ${result.corrections}`,
    "",
    `**${open.length} open**, ${judged.size} reviewed and judged correct.`,
    "",
    "OCR suspects below are a **review queue, not errors**. Whether the text is",
    "faithful to the scan is a human judgement; these are the places most likely",
    "to need one.",
    "",
    `When you make one, record it in \`reports/${id}/corrections.yaml\` — never by`,
    "editing `full.md`, which the next ingest overwrites. A correction there is",
    "applied deterministically, survives re-ingestion, and fails the build if it",
    "ever stops matching. If the scan is right as it stands, say so in the same",
    "file under `dismissed:` and the entry leaves this queue for good.",
    "",
    "| Confidence | Pattern | Text | Where | Context |",
    "| --- | --- | --- | --- | --- |",
    ...open
      .slice(0, 200)
      .map(
        (s) =>
          `| ${s.confidence} | ${s.pattern} | \`${s.match}\` | ${where(s)} | ${s.context.replace(/\|/g, "\\|")} |`
      ),
  ].join("\n");
  writeFileSync(join(dir, "fidelity.md"), `${suspectReport}\n`, "utf8");

  console.log(`\nWrote ${join(dir, "full.md")} (${result.markdown.length} chars)`);
  console.log(`Pages: ${result.pages}  Footnotes: ${result.footnotes.length}  Auto-fixes: ${result.autoFixes}`);
  console.log(
    `OCR review queue: ${open.length} open (${judged.size} judged correct) → ${join(dir, "fidelity.md")}`
  );

  const ok = reportChecks(
    "Fidelity checks",
    runChecks(result.sourceText, result.markdown, correctionVocabulary(corrections))
  );
  return ok ? 0 : 1;
}

async function runVerify(args: string[]): Promise<number> {
  const flags = args.filter((a) => a.startsWith("--"));
  const argv = args.filter((a) => !a.startsWith("--"));
  const registryPath = join(REPORTS, "registry.yaml");
  const registry = readFileSync(registryPath, "utf8");

  const entries = [
    ...registry.matchAll(/- id:\s*(\S+)[\s\S]*?source_path:\s*(\S+)([\s\S]*?)(?=\n\s*- id:|\n*$)/g),
  ].map((m) => ({
    id: m[1],
    sourcePath: m[2],
    // Reports predating the pipeline are served but not gated; weakening the
    // checks to accommodate them would hide exactly what they are there to find.
    ingested: !/ingested:\s*false/.test(m[0]),
  }));

  const only = argv[0];
  const targets = only ? entries.filter((e) => e.id === only) : entries;

  let allOk = true;
  const oracleBudget = loadOracleBudget(ORACLE_BUDGET_PATH);
  const allRows: Array<{ oracle: PageCounts | undefined; truth: Partial<PageCounts> }> = [];
  for (const target of targets) {
    if (!target.ingested) {
      console.log(`\n${target.id}`);
      console.log("  \x1b[33m–\x1b[0m not produced by the pipeline; fidelity gate skipped");
      continue;
    }

    const markdownPath = join(ROOT, target.sourcePath);
    if (!existsSync(markdownPath)) {
      console.error(`missing markdown: ${target.sourcePath}`);
      allOk = false;
      continue;
    }
    const markdown = readFileSync(markdownPath, "utf8");

    // Without a recipe there is no way to find the source, and comparing the
    // markdown against itself would report a meaningless 100%.
    if (!existsSync(join(reportDir(target.id), "ingest.ts"))) {
      console.log(`\n${target.id}`);
      console.error("  \x1b[31m✗\x1b[0m no ingest.ts — cannot verify against the source");
      allOk = false;
      continue;
    }

    const def = await loadDefinition(target.id);
    const missing = def.volumes
      .map((volume) => resolveVolume(def, volume, reportDir(def.id)))
      .filter((path) => !existsSync(path));
    if (missing.length) {
      console.log(`\n${target.id}`);
      console.error(`  \x1b[31m✗\x1b[0m source unavailable: ${missing[0]}`);
      console.error(`      clone ${def.repo} alongside this repo, then re-run`);
      allOk = false;
      continue;
    }

    const sourceText = def.volumes
      .map((volume) =>
        extractPages(resolveVolume(def, volume, reportDir(def.id)))
          .map((page) => page.lines.join("\n"))
          .join("\n")
      )
      .join("\n");

    allOk =
      reportChecks(
        target.id,
        runChecks(sourceText, markdown, correctionVocabulary(loadCorrections(target.id)))
      ) && allOk;

    // The layout oracle: what the PDF's layout says against what the pipeline
    // produced. Measure-only, never fails the run (plan §3.3). Golden pages
    // (plan §3.2) do fail it, and give the oracle's signals a precision.
    const wantOracle = !flags.includes("--no-oracle");
    const wantGolden = !flags.includes("--no-golden");
    if (wantOracle || wantGolden) {
      let result: IngestResult | undefined;
      let report: OracleReport | undefined;
      try {
        const started = Date.now();
        result = await regenerate(target.id);
        if (wantOracle) {
          report = measureLayout(layoutFor(def), finalBlocks(result), result.footnotes, { relink: !result.linkedText });
          const seconds = ((Date.now() - started) / 1000).toFixed(1);
          console.log(
            `  · layout oracle (${seconds}s) — ` +
              ORACLE_SIGNALS.map((signal) => `${signal} ${report!.counts[signal]}`).join(", ") +
              `\n      expected: ${report.expected.headings} headings, ${report.expected.markers} markers, ` +
              `${report.expected.paragraphStarts} paragraph starts, ${report.expected.quoteRuns} quote runs; ` +
              `unlocated: ${report.unlocated.headings} headings, ${report.unlocated.paragraphStarts} paragraphs, ${report.unlocated.quotes} quotes`
          );
          const budget = checkOracleBudget(oracleBudget, target.id, report.counts);
          for (const o of budget.over) {
            console.log(`  \x1b[31m✗\x1b[0m oracle budget: ${o.signal} ${o.count} is over its budget of ${o.budget} (reports/oracle-budget.yaml; read the findings with --findings)`);
            allOk = false;
          }
          if (budget.slack.length) {
            if (flags.includes("--ratchet-oracle")) {
              ratchetOracleBudgetFile(ORACLE_BUDGET_PATH, target.id, report.counts);
              console.log(`  \x1b[32m✓\x1b[0m oracle budget ratcheted: ${budget.slack.map((o) => `${o.signal} ${o.budget} to ${o.count}`).join(", ")}`);
            } else {
              console.log(`  · oracle budget can be ratcheted (--ratchet-oracle): ${budget.slack.map((o) => `${o.signal} ${o.count} < ${o.budget}`).join(", ")}`);
            }
          }
          writeFileSync(join(reportDir(target.id), ".cache", "oracle.json"), `${JSON.stringify(report, null, 1)}\n`, "utf8");
          if (flags.includes("--findings")) {
            for (const signal of ORACLE_SIGNALS) {
              for (const f of report.findings.filter((x) => x.signal === signal).slice(0, 5)) {
                console.log(`      ${signal} · vol ${f.volume} p.${f.page} · ${f.text}`);
              }
            }
          }
        }
      } catch (error) {
        console.log(`  · layout oracle skipped: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (wantGolden && result) {
        const g = await goldenChecks(target.id, result, report, flags.includes("--explain"));
        allOk = g.ok && allOk;
        if (report && g.rows.length) {
          allRows.push(...g.rows);
          const scores = scoreOracle(g.rows).filter((x) => x.tp + x.fp + x.fn > 0);
          if (scores.length) console.log(`      oracle on golden pages: ${scores.map((x) => `${x.signal} tp${x.tp}/fp${x.fp}/fn${x.fn}`).join(", ")}`);
        }
      }
    }
  }

  if (allRows.length && !only) {
    // The oracle's precision and recall against every golden page of every report (docs/quality-harness.md).
    console.log("\noracle against golden pages, all reports (tp = counted and true, fp = counted and not true, fn = true and not counted)");
    console.log("  signal                  tp    fp    fn  precision  recall");
    for (const x of scoreOracle(allRows)) {
      if (x.tp + x.fp + x.fn === 0) continue;
      const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "n/a");
      console.log(
        `  ${x.signal.padEnd(22)} ${String(x.tp).padStart(4)} ${String(x.fp).padStart(5)} ${String(x.fn).padStart(5)}  ${pct(x.tp, x.tp + x.fp).padStart(9)}  ${pct(x.tp, x.tp + x.fn).padStart(6)}`
      );
    }
  }
  return allOk ? 0 : 1;
}

/**
 * The report's golden pages (`<report repo>/golden.yaml`, quality-harness plan
 * §3.2): each entry is a page's true structure, read off the page image, and
 * must match what the pipeline regenerates. A page marked `xfail: <bead>` is a
 * known defect: it must still fail (so the defect stays visible) and a pass
 * that fixes it fails the run until the xfail is removed.
 */
async function goldenChecks(
  id: string,
  result: IngestResult,
  oracle: OracleReport | undefined,
  explain = false
): Promise<{ ok: boolean; rows: Array<{ oracle: PageCounts | undefined; truth: Partial<PageCounts> }>; pages: number }> {
  const path = join(reportDir(id), "golden.yaml");
  const none = { ok: true, rows: [], pages: 0 };
  if (!existsSync(path)) {
    console.log("  \x1b[33m–\x1b[0m no golden.yaml");
    return none;
  }
  const golden = parseGolden(readFileSync(path, "utf8"));
  if (!result.linkedText) console.log("  \x1b[33m!\x1b[0m the pipeline did not return each block's final text; golden pages compare re-linked block text");
  let ok = true;
  let passed = 0;
  let knownFailures = 0;
  const rows: Array<{ oracle: PageCounts | undefined; truth: Partial<PageCounts> }> = [];
  for (const page of golden.pages) {
    const r = checkGoldenPage(page, finalBlocks(result), result.footnotes, { relink: !result.linkedText });
    rows.push({ oracle: oracle?.pages[`${page.volume}:${page.pdf}`], truth: r.truth });
    if (explain && oracle) {
      // where the oracle and the page's entry disagree, with what the oracle saw
      for (const signal of ORACLE_SIGNALS) {
        const t = r.truth[signal];
        const o = oracle.pages[`${page.volume}:${page.pdf}`]?.[signal] ?? 0;
        if (t === undefined || o === t) continue;
        console.log(`      oracle≠golden vol ${page.volume} p.${page.pdf} ${signal}: oracle ${o}, golden ${t}`);
        for (const f of oracle.findings.filter((x) => x.signal === signal && x.volume === page.volume && x.page === page.pdf).slice(0, 4)) console.log(`          · ${f.text}`);
      }
    }
    const tag = `${page.volume > 1 ? `vol ${page.volume} ` : ""}p.${page.pdf}${page.printed !== undefined ? ` (printed ${page.printed})` : ""}`;
    // An xfail page may fail in the assertions it names (`xfail_only`, else any), must fail in at least one
    // of them, and must pass in the rest: so a page that is red for a known reason still catches a new regression.
    const allowed = page.xfail ? (page.xfail_only ?? ASSERTION_KINDS) : [];
    const unexpected = r.failing.filter((k) => !allowed.includes(k));
    const known = r.failing.filter((k) => allowed.includes(k));
    if (r.problems.length === 0 && !page.xfail) {
      passed++;
    } else if (page.xfail && known.length === 0 && unexpected.length === 0) {
      ok = false;
      console.log(`  \x1b[31m✗\x1b[0m golden ${tag}: passes now but is marked xfail ${page.xfail}; remove the xfail`);
    } else if (page.xfail && unexpected.length === 0) {
      knownFailures++;
      console.log(`  \x1b[33m~\x1b[0m golden ${tag}: known failure ${page.xfail} [${r.failing.join(", ")}] — ${r.problems[0]}`);
      const fixed = page.xfail_only?.filter((k) => !r.failing.includes(k)) ?? [];
      if (fixed.length) console.log(`        now passing: ${fixed.join(", ")} (narrow xfail_only)`);
    } else {
      ok = false;
      console.log(`  \x1b[31m✗\x1b[0m golden ${tag}: ${r.problems[0]}`);
      for (const more of r.problems.slice(1, 6)) console.log(`        ${more}`);
      if (page.xfail) console.log(`        (marked xfail ${page.xfail} for ${[...allowed].join(", ")} only; failing now in ${unexpected.join(", ")})`);
    }
  }
  console.log(
    `  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} golden pages — ${passed}/${golden.pages.length} match the PDF` +
      (knownFailures ? `, ${knownFailures} known failure(s)` : "")
  );
  return { ok, rows, pages: golden.pages.length };
}

/** `pnpm ingest outline`: what each page started, to choose golden pages from. */
async function runOutline(argv: string[]): Promise<number> {
  const id = argv[0];
  if (!id) {
    console.error("Usage: pnpm ingest outline <report-id>");
    return 1;
  }
  const result = await regenerate(id);
  const pages = new Map<string, { v: number; p: number; h: string[]; para: number; quote: number; list: number }>();
  for (const b of result.blocks ?? []) {
    if (!b.at) continue;
    const k = `${b.at.volume}:${b.at.pdfIndex}`;
    const e = pages.get(k) ?? { v: b.at.volume, p: b.at.pdfIndex, h: [], para: 0, quote: 0, list: 0 };
    if (b.kind === "heading") e.h.push(`${"#".repeat(b.level)} ${b.text.slice(0, 50)}`);
    else if (b.kind === "paragraph") e.para++;
    else if (b.kind === "quote") e.quote++;
    else if (b.kind === "list") e.list++;
    pages.set(k, e);
  }
  const notes = new Map<string, number>();
  for (const n of result.footnotes) notes.set(`${n.volume ?? 1}:${n.pdfIndex}`, (notes.get(`${n.volume ?? 1}:${n.pdfIndex}`) ?? 0) + 1);
  for (const e of pages.values()) {
    console.log(
      `v${e.v} p.${String(e.p).padStart(4)}  ${e.para}p ${e.quote}q ${e.list}l ${notes.get(`${e.v}:${e.p}`) ?? 0}n  ${e.h.join(" | ")}`
    );
  }
  return 0;
}

/** `pnpm ingest page`: one page's layout lines beside the pipeline's blocks, a draft golden entry, a fixture. */
async function runPage(argv: string[]): Promise<number> {
  const [id, vol, pdf] = argv.filter((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--fixture" && argv[argv.indexOf(a) - 1] !== "--fixture-dir");
  const volume = Number(vol);
  const pdfPage = Number(pdf);
  if (!id || !Number.isInteger(volume) || !Number.isInteger(pdfPage)) {
    console.error("Usage: pnpm ingest page <report-id> <volume> <pdfPage> [--draft] [--fixture <name> [--fixture-dir <dir>]]");
    return 1;
  }
  const def = await loadDefinition(id);
  const result = await regenerate(id);
  const layout = layoutFor(def);
  const flags = argv.filter((a) => a.startsWith("--"));
  if (flags.includes("--draft")) {
    console.log(draftGolden(result.blocks ?? [], result.footnotes, layout, volume, pdfPage));
  } else {
    console.log(renderPage(id, layout, result.blocks ?? [], result.footnotes, volume, pdfPage));
  }
  const name = arg(argv, "fixture");
  if (name) {
    const pdfPath = resolveVolume(def, def.volumes[volume - 1], reportDir(id));
    const xml = layoutXml(pdfPath, join(reportDir(id), ".cache"));
    const fixture = pageFixture(`${id} volume ${volume} PDF page ${pdfPage}`, xml, result.blocks ?? [], result.footnotes, volume, pdfPage);
    const dir = arg(argv, "fixture-dir") ?? join(reportDir(id), ".cache", "fixtures");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name}.json`);
    writeFileSync(file, `${JSON.stringify(fixture, null, 1)}\n`, "utf8");
    console.log(`\nwrote fixture ${file}\n  (copy it to ingest/tests/fixtures/oracle/ to use it in a test)`);
  }
  return 0;
}

/** Regenerates a report from its definition, in memory, writing nothing. */
async function regenerate(id: string): Promise<IngestResult> {
  const def = await loadDefinition(id);
  const pageGroups = def.volumes.map((volume) =>
    extractPages(resolveVolume(def, volume, reportDir(def.id)))
  );
  return ingestPageGroups(
    pageGroups,
    {
      title: def.title,
      authors: def.authors,
      published_at: def.published_at,
      source_url: def.source_url,
    },
    resolvePasses(def),
    loadCorrections(id),
    { layout: layoutFor(def) }
  );
}

/**
 * Stale node_modules in a report repo (a pin was bumped, `pnpm install` was not run there) make the
 * pipeline crash on a missing export instead of reporting a diff (reportsthatmatter-14su). Check first,
 * say which repo and the command that fixes it.
 */
function runPreflight(ids: string[], quiet: boolean): boolean {
  const all = reportDirs();
  const wanted = ids.length ? ids.filter((id) => all.has(id)) : [...all.keys()];
  const rows = preflight(ROOT, wanted.map((id) => [id, all.get(id)!] as [string, string]));
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) {
    console.error(`Preflight: the installed @rtm/ingest differs from the pin\n${formatPreflight(rows)}`);
    console.error("\nRun the fix above, then re-run; or pass --no-preflight to try anyway.");
  } else if (!quiet) {
    console.log(`Preflight: the installed @rtm/ingest matches each pin\n${formatPreflight(rows)}`);
  }
  return bad.length === 0;
}

function recipeIds(): string[] {
  return [...reportDirs().keys()].sort();
}

async function runBaseline(argv: string[]): Promise<number> {
  const poppler = popplerVersion();
  for (const id of argv.length ? argv : recipeIds()) {
    const baseline = computeBaseline(await regenerate(id), poppler);
    writeFileSync(
      join(reportDir(id), "baseline.json"),
      `${JSON.stringify(baseline, null, 2)}\n`,
      "utf8"
    );
    console.log(`  wrote ${join(reportDir(id), "baseline.json")}`);
  }
  return 0;
}

async function runCheck(argv: string[]): Promise<number> {
  const poppler = popplerVersion();
  let ok = true;
  for (const id of argv.length ? argv : recipeIds()) {
    const path = join(reportDir(id), "baseline.json");
    if (!existsSync(path)) {
      console.error(
        `  \x1b[31m✗\x1b[0m ${id}: no baseline.json — run \`pnpm ingest baseline ${id}\``
      );
      ok = false;
      continue;
    }
    const before = JSON.parse(readFileSync(path, "utf8")) as Baseline;
    const differences = diffBaselines(before, computeBaseline(await regenerate(id), poppler));
    if (!differences.length) {
      console.log(`  \x1b[32m✓\x1b[0m ${id}`);
      continue;
    }
    ok = false;
    console.error(`  \x1b[31m✗\x1b[0m ${id} — output moved:`);
    for (const line of differences) console.error(`      ${line}`);
  }
  if (!ok) {
    console.error(
      "\nA change that moves a report's output must land with an updated\n" +
        "baseline in the same commit. Read the diff first, then:\n" +
        "  pnpm ingest baseline <id>"
    );
  }
  return ok ? 0 : 1;
}

const warning = popplerWarning();
if (warning) console.warn(`\x1b[33m!\x1b[0m ${warning}`);

const [command, ...restAll] = process.argv.slice(2);
const skipPreflight = restAll.includes("--no-preflight");
const rest = restAll.filter((a) => a !== "--no-preflight");
let code = 0;
// Which reports a command touches, for the preflight: the id it names, else all of them.
const named = rest.filter((a) => !a.startsWith("--"));
const needsPipeline = ["run", "verify", "outline", "page", "baseline", "check", undefined].includes(command);
if (command === "preflight") code = runPreflight(named, false) ? 0 : 1;
else if (needsPipeline && !skipPreflight && !runPreflight(command === "page" ? named.slice(0, 1) : named, true)) code = 1;
else if (command === "run") code = await runIngest(rest);
else if (command === "verify" || command === undefined) code = await runVerify(rest);
else if (command === "outline") code = await runOutline(rest);
else if (command === "page") code = await runPage(rest);
else if (command === "baseline") code = await runBaseline(rest);
else if (command === "check") code = await runCheck(rest);
else if (command === "aggregate") code = runAggregate();
else if (command === "try") code = await (await import("./try.ts")).runTry(rest);
else {
  console.error(`Unknown command: ${command}`);
  code = 1;
}
process.exit(code);
