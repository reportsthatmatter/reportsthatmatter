#!/usr/bin/env node
/**
 * Report ingestion.
 *
 *   pnpm ingest run <pdf> [<pdf>...] --id <slug> --title "..." [--authors "..."] [--published 2025]
 *   pnpm ingest verify [<slug>]
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
import { join } from "node:path";
import { ingestPageGroups, type IngestResult } from "./pipeline";
import { parseRecipe, checkVolume, resolveVolume } from "./recipe";
import { computeBaseline, diffBaselines, type Baseline } from "./baseline";
import { execFileSync } from "node:child_process";
import { runChecks } from "./fidelity";
import { extractPages, type Page } from "./extract";

const ROOT = join(import.meta.dirname, "../..");
const REPORTS = join(ROOT, "reports");

function arg(flags: string[], name: string): string | undefined {
  const i = flags.indexOf(`--${name}`);
  return i === -1 ? undefined : flags[i + 1];
}

function reportChecks(label: string, checks: ReturnType<typeof runChecks>): boolean {
  console.log(`\n${label}`);
  let ok = true;
  for (const check of checks) {
    console.log(`  ${check.ok ? "[32m✓[0m" : "[31m✗[0m"} ${check.name} — ${check.detail}`);
    if (!check.ok) ok = false;
  }
  return ok;
}

function runIngest(argv: string[]): number {
  const id = argv[0];
  if (!id || id.startsWith("--")) {
    console.error("Usage: pnpm ingest run <report-id>");
    return 1;
  }

  const recipePath = join(REPORTS, id, "ingest.yaml");
  if (!existsSync(recipePath)) {
    console.error(`No recipe for ${id}: expected ${join("reports", id, "ingest.yaml")}`);
    return 1;
  }

  let recipe;
  try {
    recipe = parseRecipe(readFileSync(recipePath, "utf8"), id);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const pageGroups: Page[][] = [];
  for (const volume of recipe.volumes) {
    const check = checkVolume(recipe, volume, ROOT);
    if (check.matched === false) {
      console.error(
        `Checksum mismatch for ${volume.path}\n` +
          `  recipe:  ${volume.sha256}\n` +
          `  on disk: ${check.sha256}\n` +
          "The source changed, or the recipe is wrong. Do not ingest until this is resolved."
      );
      return 1;
    }
    if (check.matched === null) console.log(`  (no checksum recorded for ${volume.path})`);
    console.log(`Extracting ${volume.path} …`);
    pageGroups.push(extractPages(check.path));
  }

  const result = ingestPageGroups(pageGroups, {
    title: recipe.title,
    authors: recipe.authors,
    published_at: recipe.published_at,
    source_url: recipe.source_url,
  });

  return writeReport(id, recipe.title, result);
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
function writeReport(id: string, title: string, result: IngestResult): number {
  const dir = join(REPORTS, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "full.md"), result.markdown, "utf8");

  const suspectReport = [
    `# Fidelity review — ${title}`,
    "",
    `Pages: ${result.pages}  ·  Footnotes: ${result.footnotes.length}  ·  Auto-fixes applied: ${result.autoFixes}`,
    "",
    "OCR suspects below are a **review queue, not errors**. Whether the text is",
    "faithful to the scan is a human judgement; these are the places most likely",
    "to need one.",
    "",
    "| Confidence | Pattern | Text | Where | Context |",
    "| --- | --- | --- | --- | --- |",
    ...result.suspects
      .slice(0, 200)
      .map(
        (s) =>
          `| ${s.confidence} | ${s.pattern} | \`${s.match}\` | ${where(s)} | ${s.context.replace(/\|/g, "\\|")} |`
      ),
  ].join("\n");
  writeFileSync(join(dir, "fidelity.md"), `${suspectReport}\n`, "utf8");

  console.log(`\nWrote ${join("reports", id, "full.md")} (${result.markdown.length} chars)`);
  console.log(`Pages: ${result.pages}  Footnotes: ${result.footnotes.length}  Auto-fixes: ${result.autoFixes}`);
  console.log(`OCR review queue: ${result.suspects.length} entries → reports/${id}/fidelity.md`);

  const ok = reportChecks("Fidelity checks", runChecks(result.sourceText, result.markdown));
  return ok ? 0 : 1;
}

function runVerify(argv: string[]): number {
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
    const recipePath = join(REPORTS, target.id, "ingest.yaml");
    if (!existsSync(recipePath)) {
      console.log(`\n${target.id}`);
      console.error("  \x1b[31m✗\x1b[0m no ingest.yaml — cannot verify against the source");
      allOk = false;
      continue;
    }

    const recipe = parseRecipe(readFileSync(recipePath, "utf8"), target.id);
    const missing = recipe.volumes
      .map((volume) => resolveVolume(recipe, volume, ROOT))
      .filter((path) => !existsSync(path));
    if (missing.length) {
      console.log(`\n${target.id}`);
      console.error(`  \x1b[31m✗\x1b[0m source unavailable: ${missing[0]}`);
      console.error(`      clone ${recipe.repo} alongside this repo, then re-run`);
      allOk = false;
      continue;
    }

    const sourceText = recipe.volumes
      .map((volume) =>
        extractPages(resolveVolume(recipe, volume, ROOT))
          .map((page) => page.lines.join("\n"))
          .join("\n")
      )
      .join("\n");

    allOk = reportChecks(target.id, runChecks(sourceText, markdown)) && allOk;
  }

  return allOk ? 0 : 1;
}

function popplerVersion(): string {
  const out = execFileSync("pdftotext", ["-v"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return /pdftotext version (\S+)/.exec(out)?.[1] ?? "unknown";
}

/** Regenerates a report from its recipe, in memory, writing nothing. */
function regenerate(id: string): IngestResult {
  const recipe = parseRecipe(readFileSync(join(REPORTS, id, "ingest.yaml"), "utf8"), id);
  const pageGroups = recipe.volumes.map((volume) =>
    extractPages(resolveVolume(recipe, volume, ROOT))
  );
  return ingestPageGroups(pageGroups, {
    title: recipe.title,
    authors: recipe.authors,
    published_at: recipe.published_at,
    source_url: recipe.source_url,
  });
}

function recipeIds(): string[] {
  return readdirSync(REPORTS, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(REPORTS, entry.name, "ingest.yaml"))
    )
    .map((entry) => entry.name)
    .sort();
}

function runBaseline(argv: string[]): number {
  const poppler = popplerVersion();
  for (const id of argv.length ? argv : recipeIds()) {
    const baseline = computeBaseline(regenerate(id), poppler);
    writeFileSync(
      join(REPORTS, id, "baseline.json"),
      `${JSON.stringify(baseline, null, 2)}\n`,
      "utf8"
    );
    console.log(`  wrote reports/${id}/baseline.json`);
  }
  return 0;
}

function runCheck(argv: string[]): number {
  const poppler = popplerVersion();
  let ok = true;
  for (const id of argv.length ? argv : recipeIds()) {
    const path = join(REPORTS, id, "baseline.json");
    if (!existsSync(path)) {
      console.error(
        `  \x1b[31m✗\x1b[0m ${id}: no baseline.json — run \`pnpm ingest baseline ${id}\``
      );
      ok = false;
      continue;
    }
    const before = JSON.parse(readFileSync(path, "utf8")) as Baseline;
    const differences = diffBaselines(before, computeBaseline(regenerate(id), poppler));
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

const [command, ...rest] = process.argv.slice(2);
let code = 0;
if (command === "run") code = runIngest(rest);
else if (command === "verify" || command === undefined) code = runVerify(rest);
else if (command === "baseline") code = runBaseline(rest);
else if (command === "check") code = runCheck(rest);
else {
  console.error(`Unknown command: ${command}`);
  code = 1;
}
process.exit(code);
