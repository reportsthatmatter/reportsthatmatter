import { normaliseWhitespace } from "./extract";

export type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "contents"; text: string; page: string }
  | { kind: "page"; number: number };

const HEADING_MAX_WORDS = 14;
const ROMAN = /^[IVXLC]+\.?$/;

const LEADERS = /[.·]{4,}\s*(\d{1,4})\s*$/;

/**
 * A contents page, where entries wrap across several lines and only the last
 * carries the dot leaders. Parsing these line by line shreds one entry into a
 * heading, a block quote and a list item, so they get their own pass.
 */
export function isContentsPage(lines: string[]): boolean {
  return lines.filter((line) => LEADERS.test(line)).length >= 3;
}

export function parseContentsPage(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const single = normaliseWhitespace(line);
    const leaders = single.match(LEADERS);

    if (!leaders) {
      buffer.push(single);
      continue;
    }

    const text = normaliseWhitespace(
      [...buffer, single.replace(LEADERS, "")].join(" ")
    )
      .replace(/[.·\s]+$/, "")
      .trim();
    buffer = [];
    if (text) blocks.push({ kind: "contents", text, page: leaders[1] });
  }

  // A trailing fragment with no leaders is a heading on the contents page
  // itself ("TABLE OF CONTENTS"), not an entry.
  const leftover = normaliseWhitespace(buffer.join(" "));
  if (leftover) blocks.push({ kind: "paragraph", text: leftover });

  return blocks;
}

/** Leading-space count, which `pdftotext -layout` preserves from the page. */
function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * The most common indent among content lines — the left margin of running text.
 * Paragraph-initial lines sit measurably to the right of it.
 */
export function bodyIndent(lines: string[]): number {
  const counts = new Map<number, number>();
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = indentOf(line);
    counts.set(indent, (counts.get(indent) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [indent, count] of counts) {
    // On a tie prefer the smaller indent: continuation lines sit at the left
    // margin, and treating a first-line indent as the margin would merge every
    // paragraph on the page into one.
    if (count > bestCount || (count === bestCount && indent < best)) {
      best = indent;
      bestCount = count;
    }
  }
  return best;
}

/** A table-of-contents entry: dot leaders running to a page number. */
const TOC_ENTRY = /[.·]{4,}\s*\d{1,4}\s*$/;

/** Section headings carry the printed page number after the title. */
function stripTrailingPageNumber(text: string): string {
  return text.replace(/\s+\d{1,4}$/, "").trim();
}

function isHeading(text: string): { level: number; text: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Contents entries look exactly like headings but are a listing of them.
  if (TOC_ENTRY.test(trimmed)) return null;

  const body = stripTrailingPageNumber(trimmed);
  if (!body || body.split(/\s+/).length > HEADING_MAX_WORDS) return null;
  if (/[;:,]$/.test(body)) return null;

  // "I. THE RESULTS OF THE INVESTIGATION" — roman numeral sections.
  // "A. Mr. Trump's Pressure on State Officials" — lettered subsections.
  const numbered = body.match(/^([IVXLC]{1,6}|[A-Z]|\d{1,2})\.\s+(.+)$/);
  if (numbered) {
    const title = numbered[2].trim();
    if (/^[A-Z]/.test(title) && !/\.$/.test(title)) {
      // "C." and "D." are both letters and Roman numerals, so the marker
      // cannot tell us the level. In these reports the top-level sections are
      // set in caps and the subsections in title case, which can.
      const isSection = title === title.toUpperCase();
      return { level: isSection ? 2 : 3, text: title };
    }
  }

  // A standalone all-caps line with no terminal punctuation.
  const letters = body.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && body === body.toUpperCase() && !/[.]$/.test(body)) {
    return { level: 2, text: body };
  }

  return null;
}

/**
 * Reflows hard-wrapped lines back into paragraphs.
 *
 * The signal is indentation: a line indented past the running left margin opens
 * a new paragraph. Blank lines are a secondary signal, and block quotes (set
 * far to the right) are kept as quotes.
 */
export function toBlocks(lines: string[], documentMargin?: number): Block[] {
  // The left margin is a property of the document's layout, not of one page. A
  // short page — the last of a section, say — can have too few lines to infer
  // it from, and getting it wrong turns an ordinary paragraph into a quote.
  const margin = documentMargin ?? bodyIndent(lines);
  const blocks: Block[] = [];

  // A block quote is a *sustained* run of indented lines. A paragraph's first
  // line is indented just as deeply but is followed by lines back at the
  // margin — judging on indent alone splits sentences in half and quotes the
  // opening clause.
  // Headings and contents entries are indented too, so they must not count as
  // quote neighbours — otherwise the first line of the paragraph beneath a
  // heading looks like the continuation of an indented block and gets quoted.
  const structural = lines.map((line) => {
    if (!line.trim()) return false;
    const single = normaliseWhitespace(line);
    return TOC_ENTRY.test(single) || isHeading(single) !== null;
  });

  const quoted = lines.map((line, i) => {
    if (!line.trim() || structural[i] || indentOf(line) < margin + 5) return false;
    const neighbour = (j: number) => {
      const other = lines[j];
      return (
        Boolean(other?.trim()) && !structural[j] && indentOf(other) >= margin + 5
      );
    };
    return neighbour(i - 1) || neighbour(i + 1);
  });

  let current: string[] = [];
  let currentKind: "paragraph" | "quote" = "paragraph";

  const flush = () => {
    if (!current.length) return;
    const text = normaliseWhitespace(current.join(" "));
    current = [];
    if (!text) return;
    // A paragraph that is only a number is page furniture the footer sweep
    // missed, not content.
    if (/^\d{1,4}$/.test(text)) return;

    if (currentKind === "quote") {
      blocks.push({ kind: "quote", text });
      return;
    }
    const heading = isHeading(text);
    if (heading) blocks.push({ kind: "heading", ...heading });
    else blocks.push({ kind: "paragraph", text });
  };

  for (const [i, line] of lines.entries()) {
    if (!line.trim()) {
      flush();
      continue;
    }

    // Headings and contents entries are recognisable on their own, and on
    // structured pages the indentation alone will not separate them — the
    // table of contents is set at a single indent throughout.
    const single = normaliseWhitespace(line);

    const contents = single.match(/^(.*?)[.·]{4,}\s*(\d{1,4})$/);
    if (contents && contents[1].trim()) {
      flush();
      blocks.push({
        kind: "contents",
        text: contents[1].trim().replace(/\.+$/, "").trim(),
        page: contents[2],
      });
      continue;
    }

    const standalone = isHeading(single);
    if (standalone) {
      flush();
      const previous = blocks[blocks.length - 1];
      // A heading too long for one line continues on the next, where it is
      // detected as a second heading. Rejoin them rather than shipping a title
      // that stops mid-phrase.
      if (
        previous?.kind === "heading" &&
        previous.level === standalone.level &&
        !/[.?!:]$/.test(previous.text) &&
        // A line that opens its own numbering starts a new heading, not a
        // continuation. Test for the numbering, not the first letter — "I" and
        // "C" begin plenty of ordinary words.
        !/^([IVXLC]{1,6}|[A-Z]|\d{1,2})\.\s/.test(single)
      ) {
        previous.text = `${previous.text} ${standalone.text}`;
      } else {
        blocks.push({ kind: "heading", ...standalone });
      }
      continue;
    }

    const indent = indentOf(line);
    const kind: "paragraph" | "quote" = quoted[i] ? "quote" : "paragraph";
    const startsParagraph = !quoted[i] && indent > margin + 1;

    if ((startsParagraph || kind !== currentKind) && current.length) flush();

    currentKind = kind;
    current.push(line.trim());
  }

  flush();
  return blocks;
}

/**
 * Rejoins paragraphs split by a page break.
 *
 * Each page is parsed on its own, so a sentence running over the foot of one
 * page and onto the next arrives as two paragraphs — and, because the second
 * half starts with a lowercase word, as visibly broken prose.
 */
/**
 * Abbreviations that end in a full stop without ending a sentence. Without
 * these, a page break falling between "Mr." and "Trump" leaves a paragraph
 * opening mid-sentence — and in a document about Mr. Trump, that is often.
 */
const ABBREVIATION =
  /\b(mr|mrs|ms|dr|prof|sen|rep|gov|st|nos?|vs?|inc|co|corp|ltd|jr|sr|u\.s|e\.g|i\.e|cf|ch|art|sec|fig|para|pp?|ecf|tr)\.$/i;

/** A single initial — "Donald J." — is not a sentence end either. */
const INITIAL = /\b[A-Z]\.$/;

export function endsSentence(text: string): boolean {
  if (!/[.?!:;"')\]]$/.test(text)) return false;
  if (ABBREVIATION.test(text) || INITIAL.test(text)) return false;
  return true;
}

export function mergeAcrossPages(blocks: Block[]): Block[] {
  const merged: Block[] = [];

  for (const block of blocks) {
    // A page marker sits exactly where a sentence is most likely to be split,
    // so look past it — then leave it after the joined paragraph, since the
    // sentence belongs to the page it started on.
    const markerIndex =
      merged.length && merged[merged.length - 1].kind === "page"
        ? merged.length - 1
        : -1;
    const previous = merged[markerIndex === -1 ? merged.length - 1 : markerIndex - 1];

    // A word broken by the page break. Whether the hyphen belongs to the word
    // or to the typesetter cannot be known for certain, but the case of what
    // follows is a good guide: "Co-" + "Conspirator" is a real compound,
    // "regu-" + "lation" is a line break.
    if (
      block.kind === "paragraph" &&
      previous?.kind === "paragraph" &&
      /[-­‐]$/.test(previous.text)
    ) {
      const stem = previous.text.replace(/[-­‐]$/, "");
      previous.text = /^[A-Z]/.test(block.text)
        ? `${stem}-${block.text}`
        : stem + block.text;
      continue;
    }

    if (
      block.kind === "paragraph" &&
      previous?.kind === "paragraph" &&
      !endsSentence(previous.text) &&
      // A lowercase opening is the usual sign of a continuation. After an
      // abbreviation the next word is often a name, so allow either.
      (/^[a-z,;]/.test(block.text) ||
        ABBREVIATION.test(previous.text) ||
        INITIAL.test(previous.text))
    ) {
      previous.text = `${previous.text} ${block.text}`;
      continue;
    }
    merged.push(block);
  }

  return merged;
}

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((block) => {
      if (block.kind === "heading") return `${"#".repeat(block.level)} ${block.text}`;
      if (block.kind === "quote") return `> ${block.text}`;
      // Em dash rather than a full stop: the inline-marker pass keys off
      // sentence punctuation, and a contents page number is not a footnote.
      if (block.kind === "contents") return `- ${block.text} — ${block.page}`;
      if (block.kind === "page") return `%%page ${block.number}%%`;
      return block.text;
    })
    .join("\n\n");
}
