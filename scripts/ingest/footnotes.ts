import { normaliseWhitespace } from "./extract";

export type Footnote = {
  number: number;
  text: string;
  page: number;
  volume?: number;
  pdfIndex?: number;
};

const NOTE_INLINE = /^\s{0,8}(\d{1,4})\s{0,3}(?=[A-Za-z"“(])/;
const NOTE_STACKED = /^\s{0,10}(\d{1,4})\s*$/;

/**
 * Parses a page's footnote block into individual notes, in either layout —
 * number inline with its text, or number alone on its line with the text
 * beneath. Continuation lines fold into the note above them.
 */
export function parseFootnotes(lines: string[], page: number): Footnote[] {
  const notes: Footnote[] = [];

  const append = (text: string) => {
    const last = notes[notes.length - 1];
    if (!last) return;
    last.text = normaliseWhitespace(`${last.text} ${text}`);
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    const inline = line.match(NOTE_INLINE);
    if (inline) {
      notes.push({
        number: Number.parseInt(inline[1], 10),
        text: normaliseWhitespace(line.slice(inline[0].length)),
        page,
      });
      continue;
    }

    const stacked = line.match(NOTE_STACKED);
    if (stacked) {
      notes.push({ number: Number.parseInt(stacked[1], 10), text: "", page });
      continue;
    }

    append(line);
  }

  // A stacked note whose text never arrived carries nothing worth keeping.
  return notes.filter((note) => note.text);
}

/**
 * Rewrites the bare superscript numbers left inline by OCR into markdown
 * footnote references.
 *
 * Only numbers that match a note we actually collected are converted, and only
 * where they sit after sentence-like text — otherwise ordinary figures in the
 * prose ("about 12,000 voters") would be mangled into references.
 */
/**
 * Reference-like abbreviations that are followed by a number which is *not* a
 * footnote marker: "ECF No. 252", "at 79", "n. 452", "§ 371". Linking these
 * corrupts the citation into a reference to an unrelated note.
 */
const CITES_A_NUMBER =
  /(\b(?:nos?|nn?|pp?|art|ch|sec|para|vol|ex|fig|tbl|id|at|see)\.?|§)\s*$/i;

export function linkInlineMarkers(text: string, known: Set<number>): string {
  return text.replace(
    /([.,;:!?"'\)])\s+(\d{1,4})(?=\s|$)/g,
    (whole, punctuation: string, digits: string, offset: number) => {
      const value = Number.parseInt(digits, 10);
      if (!known.has(value)) return whole;

      // Look at what sits immediately before the punctuation.
      const preceding = text.slice(Math.max(0, offset - 12), offset + 1);
      if (CITES_A_NUMBER.test(preceding)) return whole;

      return `${punctuation}[^${value}]`;
    }
  );
}

/**
 * One definition per note number.
 *
 * A number can arrive twice — most often because the note runs over a page
 * break and its tail is parsed as a fresh note. Dropping the second copy loses
 * that tail, so distinct text is appended instead; only exact repeats are
 * discarded.
 */
export function renderEndnotes(notes: Footnote[]): string {
  if (!notes.length) return "";

  const byNumber = new Map<number, string[]>();
  for (const note of notes) {
    const parts = byNumber.get(note.number) ?? [];
    if (!parts.includes(note.text)) parts.push(note.text);
    byNumber.set(note.number, parts);
  }

  return [...byNumber.entries()]
    .map(([number, parts]) => `[^${number}]: ${parts.join(" ")}`)
    .join("\n\n");
}
