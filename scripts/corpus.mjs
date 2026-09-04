/* Corpus-level blast radius: what a rendering change did to every report.
 *
 *   pnpm corpus check           # fail if any report's rendered output moved
 *   pnpm corpus accept [<id>]   # accept the move, after reading the diff
 *
 * `pnpm ingest check` already covers each report's *markdown* against the
 * `baseline.json` in its own repo. Nothing covered what happens after it.
 * Paragraph ids are produced by `src/lib/markdown.ts` — in *this* repo, one
 * stage downstream of anything a report has a pin on — so an edit to
 * `paragraphId()` can repoint every citation in the archive and no gate
 * anywhere would see it. AGENTS.md says paragraph ids are the product; they
 * were the least governed artifact in the system.
 *
 * This is that gate, and it is deliberately corpus-wide: the failure it
 * exists for is "a fix aimed at one report silently changed three others",
 * which is invisible to any per-report check. It is also the precondition
 * for moving rendering out to the report repos
 * (docs/plans/2026-09-04-content-publishing.md §6), where no single command
 * sees the whole corpus any more.
 *
 * What it fingerprints, per section: the ordered list of citable ids, the
 * number of them, and the section's slug and title. Not the prose — that is
 * `pnpm ingest check`'s job, one stage up. Hashing per section rather than
 * per report is what makes a failure say *where*, instead of just "something
 * moved".
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parse } from "yaml";
import { extractPassages } from "../src/lib/passages.ts";

const root = join(import.meta.dirname, "..");
const BASELINE = join(root, "reports/corpus-baseline.json");

const sha = (value) => createHash("sha256").update(value).digest("hex").slice(0, 12);

/**
 * The citable units of a report, as the reader's page actually carries them.
 *
 * Read off the pre-rendered section pages, not recomputed from markdown, for
 * the same reason the search index is: a fingerprint of something other than
 * what ships is not evidence about what ships.
 */
function fingerprint(reportId) {
  const dir = join(root, `assets/generated/reports/${reportId}`);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));

  const sections = meta.sections.map((section) => {
    const html = readFileSync(join(dir, `sections/${section.slug}.html`), "utf8");
    const ids = extractPassages(html).map((passage) => passage.paragraphId);
    return { slug: section.slug, title: section.title, paragraphs: ids.length, ids: sha(ids.join("\n")) };
  });

  return {
    words: meta.words,
    paragraphs: sections.reduce((total, section) => total + section.paragraphs, 0),
    sections,
  };
}

function currentCorpus() {
  const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
  const corpus = {};
  for (const report of registry.reports) corpus[report.id] = fingerprint(report.id);
  return corpus;
}

/** Every difference between two reports' fingerprints, in reader-facing terms. */
function diffReport(before, after) {
  const problems = [];

  if (before.words !== after.words) {
    problems.push(`words ${before.words.toLocaleString()} → ${after.words.toLocaleString()}`);
  }
  if (before.paragraphs !== after.paragraphs) {
    problems.push(
      `citable paragraphs ${before.paragraphs.toLocaleString()} → ${after.paragraphs.toLocaleString()}`
    );
  }

  const bySlug = (list) => new Map(list.map((section) => [section.slug, section]));
  const oldSections = bySlug(before.sections);
  const newSections = bySlug(after.sections);

  for (const slug of oldSections.keys()) {
    if (!newSections.has(slug)) problems.push(`section gone: ${slug}`);
  }
  for (const slug of newSections.keys()) {
    if (!oldSections.has(slug)) problems.push(`section new: ${slug}`);
  }

  let idsMoved = 0;
  for (const [slug, after_] of newSections) {
    const before_ = oldSections.get(slug);
    if (!before_) continue;
    if (before_.title !== after_.title) {
      problems.push(`section retitled: ${slug} — "${before_.title}" → "${after_.title}"`);
    }
    if (before_.ids !== after_.ids) {
      idsMoved++;
      // Paragraph ids are permalinks. Naming the first few sections is the
      // difference between "read the diff" and "read 600 files".
      if (idsMoved <= 5) {
        const delta =
          before_.paragraphs === after_.paragraphs
            ? `${after_.paragraphs} ids, same count, different ids`
            : `${before_.paragraphs} → ${after_.paragraphs} ids`;
        problems.push(`paragraph ids moved in ${slug} (${delta})`);
      }
    }
  }
  if (idsMoved > 5) problems.push(`…and ${idsMoved - 5} more sections with moved paragraph ids`);

  return problems;
}

const [command, only] = process.argv.slice(2);

if (command === "accept") {
  const corpus = currentCorpus();
  if (only) {
    if (!corpus[only]) {
      console.error(`No such report: ${only}`);
      process.exit(2);
    }
    const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : { reports: {} };
    baseline.reports[only] = corpus[only];
    writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + "\n");
    console.log(`Accepted ${only}.`);
  } else {
    writeFileSync(BASELINE, JSON.stringify({ reports: corpus }, null, 2) + "\n");
    console.log(`Accepted all ${Object.keys(corpus).length} report(s).`);
  }
  process.exit(0);
}

if (command !== "check") {
  console.error("Usage: pnpm corpus check | pnpm corpus accept [<id>]");
  process.exit(2);
}

if (!existsSync(BASELINE)) {
  console.error(`No corpus baseline yet. Read the output, then: pnpm corpus accept`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8")).reports;
const corpus = currentCorpus();
let failed = 0;

for (const id of Object.keys(corpus)) {
  if (!baseline[id]) {
    console.log(`  ? ${id} — not in the baseline. New report? \`pnpm corpus accept ${id}\``);
    failed++;
    continue;
  }
  const problems = diffReport(baseline[id], corpus[id]);
  if (!problems.length) {
    console.log(`  ✓ ${id}`);
    continue;
  }
  failed++;
  console.log(`  ✗ ${id}`);
  for (const problem of problems) console.log(`      ${problem}`);
}

for (const id of Object.keys(baseline)) {
  if (!corpus[id]) {
    console.log(`  ✗ ${id} — in the baseline but no longer in the registry`);
    failed++;
  }
}

if (failed) {
  console.log(
    `\n${failed} report(s) moved. A paragraph id is a permalink: if these ids changed,\n` +
      `every citation pointing at them changed too. Read the diff, then accept it\n` +
      `deliberately with \`pnpm corpus accept\` — never to make the check quiet.`
  );
  process.exit(1);
}

console.log(`\n${Object.keys(corpus).length} report(s) unchanged.`);
