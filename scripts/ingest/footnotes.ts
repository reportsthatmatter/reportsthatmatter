import { normaliseWhitespace } from "./extract";

export type Footnote = { number: number; text: string; page: number };

const NOTE_START = /^\s{0,8}(\d{1,4})\s{0,3}(?=[A-Za-z"“(])/;

/**
 * Parses a page's footnote block into individual notes. Continuation lines are
 * folded into the note above them.
 */
export function parseFootnotes(lines: string[], page: number): Footnote[] {
  const notes: Footnote[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(NOTE_START);
    if (match) {
      notes.push({
        number: Number.parseInt(match[1], 10),
        text: normaliseWhitespace(line.slice(match[0].length)),
        page,
      });
    } else if (notes.length) {
      notes[notes.length - 1].text = normaliseWhitespace(
        `${notes[notes.length - 1].text} ${line}`
      );
    }
  }

  return notes;
}

/**
 * Rewrites the bare superscript numbers left inline by OCR into markdown
 * footnote references.
 *
 * Only numbers that match a note we actually collected are converted, and only
 * where they sit after sentence-like text — otherwise ordinary figures in the
 * prose ("about 12,000 voters") would be mangled into references.
 */
export function linkInlineMarkers(text: string, known: Set<number>): string {
  return text.replace(
    /([.,;:!?"'\)])\s+(\d{1,4})(?=\s|$)/g,
    (whole, punctuation: string, digits: string) => {
      const value = Number.parseInt(digits, 10);
      return known.has(value) ? `${punctuation}[^${value}]` : whole;
    }
  );
}

export function renderEndnotes(notes: Footnote[]): string {
  if (!notes.length) return "";
  const seen = new Set<number>();
  const lines: string[] = [];
  for (const note of notes) {
    if (seen.has(note.number)) continue;
    seen.add(note.number);
    lines.push(`[^${note.number}]: ${note.text}`);
  }
  return lines.join("\n\n");
}
