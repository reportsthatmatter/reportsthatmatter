import type { Page } from "./extract";

export type SplitPage = {
  index: number;
  /** Printed page number, if the page carries one. */
  printed: number | null;
  body: string[];
  footnotes: string[];
};

const PAGE_NUMBER = /^\s*(\d{1,4}|[ivxlcdm]{1,8})\s*$/i;
/** A footnote block line opens with its number hard against the text. */
const FOOTNOTE_START = /^\s{0,8}(\d{1,4})\s{0,3}(?=[A-Za-z"“(])/;

/**
 * Separates the three things a scanned report page contains: the running body,
 * the footnote block at the foot of the page, and the printed page number.
 *
 * Footnotes are found by walking up from the bottom: the block is the trailing
 * run of lines that starts with an ascending footnote number. Walking upward
 * matters because footnote numbers also appear inline in the body.
 */
export function splitPage(page: Page, expectedNote: number): SplitPage {
  const lines = [...page.lines];

  // printed page number: last non-empty line, if it is only a number
  let printed: number | null = null;
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (PAGE_NUMBER.test(line)) {
      const value = Number.parseInt(line.trim(), 10);
      printed = Number.isNaN(value) ? null : value;
      lines.splice(i, 1);
    }
    break;
  }

  // Footnote block: the notes sit at the foot of the page as a consecutively
  // numbered run. Anchor on that run rather than on the first number we see —
  // wrapped case citations ("575 F.3d 726, 735 …") look identical to a note
  // opening, and only the numbering tells them apart.
  const candidates: Array<{ line: number; note: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(FOOTNOTE_START);
    if (match) candidates.push({ line: i, note: Number.parseInt(match[1], 10) });
  }

  if (!candidates.length) {
    return { index: page.index, printed, body: lines, footnotes: [] };
  }

  // Walk back from the final candidate while the numbering stays consecutive.
  let start = candidates.length - 1;
  while (
    start > 0 &&
    candidates[start - 1].note === candidates[start].note - 1
  ) {
    start -= 1;
  }

  const run = candidates.slice(start);

  // A lone number is only a note if it continues the sequence. Allow a small
  // gap: a note that wraps across a page break leaves its opener on the page
  // before, so the counter drifts by one or two.
  const continuesSequence =
    run[0].note >= expectedNote && run[0].note <= expectedNote + 4;
  if (run.length < 2 && !continuesSequence) {
    return { index: page.index, printed, body: lines, footnotes: [] };
  }

  // A long run that restarts far below the sequence is a numbered list or a
  // wrapped citation, not the footnote block.
  if (run[0].note < expectedNote - 2) {
    return { index: page.index, printed, body: lines, footnotes: [] };
  }

  const noteStart = run[0].line;
  return {
    index: page.index,
    printed,
    body: lines.slice(0, noteStart),
    footnotes: lines.slice(noteStart),
  };
}

/**
 * pdftotext preserves the original double-spacing on many pages, which would
 * otherwise read as a paragraph break on every single line.
 */
export function collapseDoubleSpacing(lines: string[]): string[] {
  const nonEmpty = lines.filter((l) => l.trim()).length;
  if (nonEmpty < 4) return lines;

  let alternating = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim() && !lines[i + 1].trim()) alternating += 1;
  }

  // Double-spaced if most content lines are followed by a blank.
  if (alternating / nonEmpty < 0.6) return lines;

  // On a double-spaced page a single blank line is just the line spacing, but a
  // wider gap is a real break — a paragraph, or a heading standing on its own.
  // Dropping every blank loses that structure entirely.
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      out.push(lines[i]);
      continue;
    }

    let gap = 0;
    while (i + gap < lines.length && !lines[i + gap].trim()) gap += 1;
    if (gap > 1) out.push("");
    i += gap - 1;
  }
  return out;
}
