import { normaliseWhitespace, type Page } from "./extract";

export type SplitPage = {
  index: number;
  /** Printed page number, if the page carries one. */
  printed: number | null;
  body: string[];
  footnotes: string[];
};

const PAGE_EDGE_DEPTH = 3;
const MIN_REPEATED_FURNITURE = 3;

const PAGE_NUMBER = /^\s*(\d{1,4}|[ivxlcdm]{1,8})\s*$/i;

/**
 * Two layouts, both common.
 *
 * Inline — the number sits hard against its text:
 *   `110   See 3/1/2007 Washington Mutual Inc. 10-K filing.`
 *
 * Stacked — the number is alone on its line and the text follows beneath:
 *   `110`
 *   `    See 3/1/2007 Washington Mutual Inc. 10-K filing.`
 *
 * The Jack Smith report uses the first, the PSI financial crisis report the
 * second, and supporting only one finds seven notes in a document with
 * thousands.
 */
export const FOOTNOTE_INLINE = /^\s{0,8}(\d{1,4})\s{0,3}(?=[A-Za-z"“(])/;
const FOOTNOTE_STACKED = /^\s{0,10}(\d{1,4})\s*$/;

/** Candidate note openings on a page, in either layout. */
export function noteCandidates(
  lines: string[]
): Array<{ line: number; note: number }> {
  const candidates: Array<{ line: number; note: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const inline = lines[i].match(FOOTNOTE_INLINE);
    if (inline) {
      candidates.push({ line: i, note: Number.parseInt(inline[1], 10) });
      continue;
    }

    const stacked = lines[i].match(FOOTNOTE_STACKED);
    if (!stacked) continue;

    // A lone number is only a note opening if prose follows it. Note text
    // frequently opens with a date or a docket number ("4/2010 Evaluation of
    // …"), so require words rather than a leading letter.
    const next = lines.slice(i + 1).find((line) => line.trim());
    if (next && /[A-Za-z]{2}/.test(next) && !FOOTNOTE_STACKED.test(next)) {
      candidates.push({ line: i, note: Number.parseInt(stacked[1], 10) });
    }
  }

  return candidates;
}

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

  // The printed page number sits alone on a line, at the foot of the page or
  // at its head — the Jack Smith report uses a footer, the PSI report a header,
  // and looking in only one place loses page anchors for half the archive.
  let printed: number | null = null;

  const takeNumber = (index: number) => {
    const value = Number.parseInt(lines[index].trim(), 10);
    if (Number.isNaN(value)) return false;
    printed = value;
    lines.splice(index, 1);
    return true;
  };

  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
    if (!lines[i].trim()) continue;
    if (PAGE_NUMBER.test(lines[i])) takeNumber(i);
    break;
  }

  if (printed === null) {
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      if (!lines[i].trim()) continue;
      if (PAGE_NUMBER.test(lines[i])) takeNumber(i);
      break;
    }
  }

  // Footnote block: the notes sit at the foot of the page as a consecutively
  // numbered run. Anchor on that run rather than on the first number we see —
  // wrapped case citations ("575 F.3d 726, 735 …") look identical to a note
  // opening, and only the numbering tells them apart.
  const candidates = noteCandidates(lines);

  if (!candidates.length) {
    return { index: page.index, printed, body: lines, footnotes: [] };
  }

  const start = chooseBlockStart(candidates, expectedNote, lines.length);
  if (start === null) {
    return { index: page.index, printed, body: lines, footnotes: [] };
  }

  const noteStart = start.line;
  return {
    index: page.index,
    printed,
    body: lines.slice(0, noteStart),
    footnotes: lines.slice(noteStart),
  };
}

/**
 * Removes running headers and footers that recur at a page edge. PDF text
 * extraction cannot distinguish these from the report body, but their repeated
 * position can: a real line of prose should not appear at the top or bottom of
 * three distinct pages.
 */
export function stripRepeatedPageFurniture(pages: SplitPage[]): SplitPage[] {
  const counts = new Map<string, number>();
  const edgeIndices = pages.map((page) => pageEdgeIndices(page.body));

  for (const [pageIndex, page] of pages.entries()) {
    const seen = new Set<string>();
    for (const lineIndex of edgeIndices[pageIndex]) {
      const text = normaliseWhitespace(page.body[lineIndex]);
      if (text) seen.add(text);
    }
    for (const text of seen) counts.set(text, (counts.get(text) ?? 0) + 1);
  }

  return pages.map((page, pageIndex) => ({
    ...page,
    body: page.body.filter((line, lineIndex) => {
      if (!edgeIndices[pageIndex].has(lineIndex)) return true;
      const text = normaliseWhitespace(line);
      return !text || (counts.get(text) ?? 0) < MIN_REPEATED_FURNITURE;
    }),
  }));
}

function pageEdgeIndices(lines: string[]): Set<number> {
  const indices = new Set<number>();
  let found = 0;
  for (let i = 0; i < lines.length && found < PAGE_EDGE_DEPTH; i++) {
    if (!lines[i].trim()) continue;
    indices.add(i);
    found += 1;
  }

  found = 0;
  for (let i = lines.length - 1; i >= 0 && found < PAGE_EDGE_DEPTH; i--) {
    if (!lines[i].trim()) continue;
    indices.add(i);
    found += 1;
  }
  return indices;
}

type Candidate = { line: number; note: number };

/**
 * Picks where the footnote block starts.
 *
 * The running note number is the strongest signal available: notes are
 * sequential across the whole document, so the block almost always opens on the
 * number we are expecting. Anchoring on that survives the stray candidates that
 * litter these pages — a citation wrapping onto a line that begins "20 U.S.C.",
 * an exhibit number, a figure. Searching backwards from the last candidate
 * instead, as this used to, let a single stray at the foot of the page reject
 * the entire block: one page offered notes 140-147 and was thrown out because a
 * spurious "20" followed them.
 */
function chooseBlockStart(
  candidates: Candidate[],
  expectedNote: number,
  lineCount: number
): Candidate | null {
  /** Corroboration: the next note follows it, or it sits low on the page. */
  const plausible = (candidate: Candidate) =>
    candidates.some((other) => other.note === candidate.note + 1) ||
    candidate.line > lineCount * 0.55;

  const exact = candidates.find((candidate) => candidate.note === expectedNote);
  if (exact && plausible(exact)) return exact;

  // Notes we failed to collect leave the counter behind; accept a small jump.
  const ahead = candidates
    .filter((c) => c.note > expectedNote && c.note <= expectedNote + 6)
    .sort((a, b) => a.note - b.note)[0];
  if (ahead && plausible(ahead)) return ahead;

  // Appendices restart their numbering. Fall back to the longest consecutive
  // run, but only a substantial one sitting at the foot of the page.
  const best = longestRun(candidates);
  if (best.length >= 3 && best[0].line > lineCount * 0.4) return best[0];

  return null;
}

function longestRun(candidates: Candidate[]): Candidate[] {
  let best: Candidate[] = [];
  let current: Candidate[] = [];

  for (const candidate of candidates) {
    const previous = current[current.length - 1];
    if (previous && candidate.note === previous.note + 1) current.push(candidate);
    else current = [candidate];
    if (current.length > best.length) best = [...current];
  }

  return best;
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
