/* Checks our editorial layer against the reports and builds what the Worker
 * reads (reportsthatmatter-g0w.1).
 *
 *   pnpm editorial
 *   pnpm editorial --check     # read-only: write nothing; exit 1 if a quote or citation fails, or if
 *                              # src/generated/editorial.ts differs from what a plain run would write
 *
 * For every `editorial/<report-id>.yaml`: each excerpt's quote must appear
 * verbatim in its paragraph (or in the block quotations that paragraph
 * introduces), and every cited paragraph id must exist. Checked against the
 * pre-rendered body in assets/generated/, so run `pnpm prerender` first — the
 * same ids the reader is served, not a second rendering that could disagree.
 *
 * Writes src/generated/editorial.ts, drafts included: only the template
 * decides what a reader sees, so a draft can be previewed with `?draft` on
 * the contents page before it is approved. Exits 1 on any problem, listing
 * all of them. A plain run leaves a file alone when its bytes are already right.
 *
 * Also writes src/generated/picks.ts: the Editor's picks on /highlights (bght.10.3, g0w.5), each resolved
 * to report, section slug and title, words, anchor and page so the page needs no D1 read and no meta parse
 * for them. A highlight marked `pick: true` is a pick (at most one per report); until any file marks one,
 * the first `card: true` highlight of each approved report outside the affected-community list
 * (src/lib/feed-policy.ts, decision 0023 Q2) stands in. Registry order. --check covers it too.
 *
 * Also writes build/editorial-highlights.json: Rufus's highlights resolved to
 * marks-table rows, for `pnpm seed-highlights` (g0w.11), from approved files
 * only (wb0). Not bundled — the
 * Worker never needs them; they reach readers through the marks table.
 */
import "./lib/help.mjs";
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { resolveEditorial } from "../src/lib/editorial.ts";
import { AFFECTED_COMMUNITY_REPORTS } from "../src/lib/feed-policy.ts";
import { encodeAnchor } from "../assets/anchor.js";
import { webpSize } from "./imagery/webp.mjs";

const checkOnly = process.argv.includes("--check");
// EDITORIAL_ROOT points the data (editorial/, registry, pre-rendered bodies, the generated file) at a fixture; tests/editorial-check.test.ts.
const root = process.env.EDITORIAL_ROOT ?? join(import.meta.dirname, "..");
const dir = join(root, "editorial");
const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
const known = new Set(registry.reports.map((report) => report.id));

// A hero's files are read off disk: `/assets/heroes/x.webp` is assets/heroes/x.webp.
const assetSize = (src) => {
  const path = join(root, src.replace(/^\//, ""));
  return existsSync(path) ? webpSize(readFileSync(path)) : null;
};

const problems = [];
const resolved = {};
const highlights = [];
/** Per report, its picks (pick: true) and its first card: true highlight, with section titles. */
const pickSources = new Map();

const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort() : [];

// Without the pre-rendered bodies nothing can be checked, and writing
// src/generated/editorial.ts anyway would silently drop those reports from
// it (reportsthatmatter-v4w). Stop before writing anything.
const unrendered = files
  .map((name) => name.replace(/\.yaml$/, ""))
  .filter((id) => known.has(id) && !existsSync(join(root, `assets/generated/reports/${id}/full-body.html`)));
if (unrendered.length) {
  console.error(`No pre-rendered text for ${unrendered.join(", ")} in assets/generated/reports/.`);
  console.error("Run pnpm prerender first. Nothing was written.");
  process.exit(1);
}

for (const name of files) {
  const source = parse(readFileSync(join(dir, name), "utf8"));
  const expected = name.replace(/\.yaml$/, "");

  if (source.report !== expected) {
    problems.push(`${name}: report is "${source.report}", but the file is named for "${expected}"`);
    continue;
  }
  if (!known.has(source.report)) {
    problems.push(`${name}: no report "${source.report}" in reports/registry.yaml`);
    continue;
  }

  const bodyPath = join(root, `assets/generated/reports/${source.report}/full-body.html`);

  const structure = JSON.parse(
    readFileSync(join(root, `assets/generated/reports/${source.report}/meta.json`), "utf8")
  );
  const result = resolveEditorial(source, readFileSync(bodyPath, "utf8"), structure, assetSize);
  problems.push(...result.problems);
  resolved[source.report] = result.editorial;
  // Only an approved file's highlights reach the marks table: a draft's are
  // previewed with ?draft, never published as the editor's (wb0).
  if (source.status === "approved") {
    highlights.push(...result.highlights);
    const titled = (h) => ({ ...h, sectionTitle: structure.sections.find((s) => s.slug === h.section)?.title ?? h.section });
    pickSources.set(source.report, {
      picks: result.highlights.filter((h) => h.pick).map(titled),
      card: result.highlights.filter((h) => h.card).map(titled)[0] ?? null,
    });
  }

  const { findings, readingGuide } = result.editorial;
  const quotes = findings.filter((f) => f.excerpt).length + readingGuide.filter((r) => r.excerpt).length;
  console.log(
    `  ${result.problems.length ? "✗" : "✓"} ${source.report} (${source.status}) — ` +
      `${findings.length} findings, ${readingGuide.length} to read, ${quotes} quotes on the page, ` +
      `${result.highlights.length} highlights${result.editorial.hero ? ", a hero" : ""}`
  );
}

const generatedPath = join(root, "src/generated/editorial.ts");
const generated = `/* Generated by scripts/editorial.mjs from editorial/*.yaml — do not edit. */
import type { Editorial } from "../lib/editorial";

export const EDITORIAL: Readonly<Record<string, Editorial>> = ${JSON.stringify(resolved, null, 2)};
`;
const stale = !existsSync(generatedPath) || readFileSync(generatedPath, "utf8") !== generated;

// Editor's picks (bght.10.3): explicit picks once any file names one, else one card highlight per report.
const anyPick = [...pickSources.values()].some((entry) => entry.picks.length);
const picks = registry.reports
  .map((report) => report.id)
  .filter((id) => pickSources.has(id) && !AFFECTED_COMMUNITY_REPORTS.includes(id))
  .map((id) => (anyPick ? pickSources.get(id).picks[0] : pickSources.get(id).card))
  .filter(Boolean)
  .map((h) => ({
    report: h.report,
    slug: h.section,
    sectionTitle: h.sectionTitle,
    paragraph: h.paragraph,
    words: h.exact,
    anchor: encodeAnchor({ prefix: h.prefix, exact: h.exact, suffix: h.suffix }),
    page: h.page,
  }));
const picksPath = join(root, "src/generated/picks.ts");
const picksSource = `/* Generated by scripts/editorial.mjs from editorial/*.yaml — do not edit. */
import type { EditorPick } from "../lib/feed";

export const EDITOR_PICKS: readonly EditorPick[] = ${JSON.stringify(picks, null, 2)};
`;
const picksStale = !existsSync(picksPath) || readFileSync(picksPath, "utf8") !== picksSource;

if (!checkOnly) {
  if (stale) writeFileSync(generatedPath, generated);
  if (picksStale) writeFileSync(picksPath, picksSource);
  mkdirSync(join(root, "build"), { recursive: true });
  writeFileSync(join(root, "build/editorial-highlights.json"), JSON.stringify(highlights, null, 2));
}

if (checkOnly && stale) console.error("\n  ✗ src/generated/editorial.ts differs from what pnpm editorial would write");
if (checkOnly && picksStale) console.error("\n  ✗ src/generated/picks.ts differs from what pnpm editorial would write");

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

if (checkOnly) {
  if (stale || picksStale) {
    console.error("\neditorial output is stale: run pnpm prerender && pnpm editorial and commit the result");
    process.exit(1);
  }
  console.log(`\nChecked ${files.length} editorial file(s); src/generated/editorial.ts is current (nothing written)`);
} else {
  console.log(`\nChecked ${files.length} editorial file(s); ${stale ? "wrote" : "kept"} src/generated/editorial.ts; ${picksStale ? "wrote" : "kept"} src/generated/picks.ts (${picks.length} picks)`);
}
