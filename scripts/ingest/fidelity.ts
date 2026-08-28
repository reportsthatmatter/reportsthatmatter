/**
 * Fidelity checks for an ingested report.
 *
 * Layers 1-3 are gates: structural invariants, lossless content, and word-count
 * deltas. They answer "did the pipeline silently destroy something?", which is
 * decidable. They deliberately do not try to answer "is this faithful to the
 * source?", which is not.
 */

import { autoFix } from "./ocr";

export type Check = { name: string; ok: boolean; detail: string };

const STOP_CHARS = /[^a-z0-9]/g;

/** Front matter is metadata we added, not content extracted from the source. */
function stripFrontMatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/**
 * Both sides of a comparison must be normalised identically. Footnote markers
 * exist as `[^11]` in the output and as a bare `11` in the source, and leaving
 * either in place makes ordinary words ("prospects.[^11]") look invented.
 */
function comparable(text: string): string {
  return text.replace(/\[\^\d+\]:?/g, " ");
}

function words(text: string): string[] {
  return comparable(text)
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(STOP_CHARS, ""))
    .filter(Boolean);
}

export function structuralChecks(markdown: string): Check[] {
  const checks: Check[] = [];
  const lines = stripFrontMatter(markdown).split("\n");

  const pageNumberLines = lines.filter((line) => /^\s*\d{1,4}\s*$/.test(line));
  checks.push({
    name: "no bare page-number lines",
    ok: pageNumberLines.length === 0,
    detail: pageNumberLines.length ? `${pageNumberLines.length} left` : "none",
  });

  checks.push({
    name: "no form feeds",
    ok: !markdown.includes("\f"),
    detail: markdown.includes("\f") ? "form feed present" : "none",
  });

  const orphaned = markdown.match(/\[\^(\d+)\]/g) ?? [];
  const defined = new Set(
    (markdown.match(/^\[\^(\d+)\]:/gm) ?? []).map((d) => d.replace(/[^\d]/g, ""))
  );
  const missing = orphaned
    .map((ref) => ref.replace(/[^\d]/g, ""))
    .filter((n) => !defined.has(n));
  checks.push({
    name: "every footnote reference has a note",
    ok: missing.length === 0,
    detail: missing.length ? `${missing.length} orphaned (e.g. ${missing[0]})` : "all resolved",
  });

  const headings = lines.filter((line) => /^#{1,6}\s/.test(line));
  checks.push({
    name: "document has headings",
    ok: headings.length > 0,
    detail: `${headings.length} headings`,
  });

  checks.push({
    name: "no runs of blank lines",
    ok: !/\n{4,}/.test(markdown),
    detail: /\n{4,}/.test(markdown) ? "found 3+ consecutive blanks" : "clean",
  });

  return checks;
}

/**
 * Layer 2: every word of the output must exist in the source. Catches the
 * failure mode that matters most — silently inventing or mangling text — while
 * tolerating the reordering that lifting footnotes necessarily causes.
 */
export function losslessCheck(
  sourceText: string,
  markdown: string,
  extraVocabulary: string[] = []
): Check {
  // Compare against the source with the same certain-substitution pass applied,
  // so a legitimate OCR repair does not read as invented text — while anything
  // the pipeline actually made up still does.
  // Text a correction deliberately introduced is not in the scan, and is not
  // invented either — it is a human judgement on the record.
  const source = new Set([
    ...words(sourceText),
    ...words(autoFix(sourceText).text),
    ...words(extraVocabulary.join(" ")),
  ]);
  const output = words(stripFrontMatter(markdown));

  const foreign = output.filter((word) => !source.has(word));
  const ratio = output.length ? foreign.length / output.length : 1;

  return {
    name: "output words all appear in the source",
    ok: ratio < 0.001,
    detail:
      foreign.length === 0
        ? `${output.length} words, all accounted for`
        : `${foreign.length}/${output.length} not in source (e.g. ${foreign.slice(0, 5).join(", ")})`,
  };
}

/** Layer 3: the output must not have lost a meaningful share of the source. */
export function retentionCheck(sourceText: string, markdown: string): Check {
  const sourceWords = words(sourceText).length;
  const outputWords = words(stripFrontMatter(markdown)).length;
  const retained = sourceWords ? outputWords / sourceWords : 0;

  return {
    name: "content retained from source",
    ok: retained > 0.9 && retained < 1.05,
    detail: `${(retained * 100).toFixed(1)}% (${outputWords}/${sourceWords} words)`,
  };
}

/**
 * Layers 1-3 together.
 *
 * `sourceText` must be the text extracted from the source PDF. Passing the
 * markdown itself makes layers 2 and 3 tautologies that report 100% for any
 * input — which is exactly what `ingest verify` silently did for every report
 * until #118, because no report had a `source.pdf` to compare against.
 */
export function runChecks(
  sourceText: string,
  markdown: string,
  extraVocabulary: string[] = []
): Check[] {
  if (sourceText === markdown) {
    throw new Error(
      "runChecks was asked to check a document against itself: with the " +
        "markdown as its own source, layers 2 and 3 are tautologies that " +
        "report 100% for any input. Pass the text extracted from the source " +
        "PDF, or call structuralChecks() and say that is all you are checking."
    );
  }
  return [
    ...structuralChecks(markdown),
    losslessCheck(sourceText, markdown, extraVocabulary),
    retentionCheck(sourceText, markdown),
  ];
}
