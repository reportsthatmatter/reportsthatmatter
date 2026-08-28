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
import { pathToFileURL } from "node:url";
import { ingestPageGroups, type IngestResult } from "./pipeline";
import { checkVolume, resolveVolume } from "./volumes";
import { resolvePasses, type PipelineDef } from "./define";
import { computeBaseline, diffBaselines, type Baseline } from "./baseline";
import { execFileSync } from "node:child_process";
import { runChecks } from "./fidelity";
import { extractPages, type Page } from "./extract";

const ROOT = join(import.meta.dirname, "../..");
const REPORTS = join(ROOT, "reports");

/**
 * Loads a report's pipeline definition — the program in its own directory
 * that says how it is built. Dynamic because each report owns its own file.
 */
async function loadDefinition(id: string): Promise<PipelineDef> {
  const path = join(REPORTS, id, "ingest.ts");
  if (!existsSync(path)) {
    throw new Error(
      `No pipeline for ${id}: expected ${join("reports", id, "ingest.ts")}`
    );
  }
  const module = await import(pathToFileURL(path).href);
  return module.default as PipelineDef;
}

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
    const check = checkVolume(def, volume, ROOT);
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
    resolvePasses(def)
  );

  return writeReport(id, def.title, result);
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

async function runVerify(argv: string[]): Promise<number> {
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
    if (!existsSync(join(REPORTS, target.id, "ingest.ts"))) {
      console.log(`\n${target.id}`);
      console.error("  \x1b[31m✗\x1b[0m no ingest.ts — cannot verify against the source");
      allOk = false;
      continue;
    }

    const def = await loadDefinition(target.id);
    const missing = def.volumes
      .map((volume) => resolveVolume(def, volume, ROOT))
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
        extractPages(resolveVolume(def, volume, ROOT))
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

/** Regenerates a report from its definition, in memory, writing nothing. */
async function regenerate(id: string): Promise<IngestResult> {
  const def = await loadDefinition(id);
  const pageGroups = def.volumes.map((volume) =>
    extractPages(resolveVolume(def, volume, ROOT))
  );
  return ingestPageGroups(
    pageGroups,
    {
      title: def.title,
      authors: def.authors,
      published_at: def.published_at,
      source_url: def.source_url,
    },
    resolvePasses(def)
  );
}

function recipeIds(): string[] {
  return readdirSync(REPORTS, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(REPORTS, entry.name, "ingest.ts"))
    )
    .map((entry) => entry.name)
    .sort();
}

async function runBaseline(argv: string[]): Promise<number> {
  const poppler = popplerVersion();
  for (const id of argv.length ? argv : recipeIds()) {
    const baseline = computeBaseline(await regenerate(id), poppler);
    writeFileSync(
      join(REPORTS, id, "baseline.json"),
      `${JSON.stringify(baseline, null, 2)}\n`,
      "utf8"
    );
    console.log(`  wrote reports/${id}/baseline.json`);
  }
  return 0;
}

async function runCheck(argv: string[]): Promise<number> {
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

const [command, ...rest] = process.argv.slice(2);
let code = 0;
if (command === "run") code = await runIngest(rest);
else if (command === "verify" || command === undefined) code = await runVerify(rest);
else if (command === "baseline") code = await runBaseline(rest);
else if (command === "check") code = await runCheck(rest);
else {
  console.error(`Unknown command: ${command}`);
  code = 1;
}
process.exit(code);
