import { normaliseWhitespace } from "./extract";

/**
 * Where a block came from in the source. Carried so a fidelity note or an OCR
 * suspect can say "Volume II, PDF page 412, printed 380" rather than a flat
 * index into a document that no longer exists as one file. `blocksToMarkdown`
 * ignores it: provenance is metadata about the text, not part of it.
 */
export type Provenance = { volume: number; pdfIndex: number; printed: number | null };

export type Block = (
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[]; quoted: boolean }
  | { kind: "heading"; level: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "contents"; text: string; page: string }
  | { kind: "page"; number: number }
) & { at?: Provenance };

const HEADING_MAX_WORDS = 14;
const ROMAN = /^[IVXLC]+\.?$/;

const LEADERS = /[.·]{4,}\s*(\d{1,4})\s*$/;

/**
 * A bullet, and the text after it.
 *
 * True bullet glyphs only. A leading hyphen or en dash is far more often a
 * dash in running prose than a list marker, and mistaking one for the other
 * shreds a paragraph — the same trap that made the first footnote-marker rule
 * corrupt a citation.
 */
const BULLET = /^(\s*)([•·▪◦‣])\s+(\S.*)$/;

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

/**
 * Words a finished title does not end on. A heading closing on a preposition or
 * an article has been cut off by the line break, not written that way.
 */
const DANGLING =
  /\b(of|the|a|an|in|to|for|and|or|with|by|from|that|was|is|are|were|on|at|as|its|their|his|her)$/i;

/**
 * Words that carry no case information of their own, so their being lower-case
 * in a title says nothing. Anything *else* lower-case in a would-be title is a
 * verb or a common noun — i.e. the line is a sentence, not a title.
 */
const STOPWORD =
  /^(of|the|a|an|in|to|for|and|or|nor|with|by|from|that|as|at|on|is|was|were|are|be|been|its?|it|their|his|her|our|my|your|has|have|had|but|not|no|than|then|so|if|when|which|who|whom|whose|into|upon|per|via)$/i;

/**
 * An inquiry report's top-level divisions carry their own number in the label
 * — "Part 4:", "Chapter 1:", "Appendix 3:" — which the single-letter marker
 * regex in `isHeading` does not cover. `Part`, `Appendix`, `Annex` and `Volume`
 * are top level (h2); `Chapter` and `Section` nest under them (h3).
 */
const DIVISION_LABEL = /^(Part|Chapter|Appendix|Annex|Volume|Section)\s+(\d{1,3}|[IVXLC]{1,7})\b/;
const DIVISION_TOP = /^(Part|Appendix|Annex|Volume)$/;

/** A heading this pipeline emitted for a numbered division, by its text. */
export function isDivisionHeading(text: string): boolean {
  return /^(Part|Chapter|Appendix|Annex|Volume|Section) (?:\d{1,3}|[IVXLC]{1,7}):/.test(
    text
  );
}

/** "7.1", "10.14" — the paragraph numbering these reports run throughout. */
function opensNumberedParagraph(text: string): boolean {
  return /^\d{1,3}[.)]\d{0,3}\s/.test(text.trim());
}

/**
 * Titles are set in caps or title case; running prose is not. Used to tell a
 * numbered heading from a numbered sentence.
 */
function isTitular(text: string): boolean {
  if (text === text.toUpperCase()) return true;
  const words = text.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  if (words.length < 2) return false;
  const capitalised = words.filter((word) => /^[A-Z]/.test(word)).length;
  return capitalised / words.length >= 0.6;
}

export function danglesMidPhrase(text: string): boolean {
  return !/[.?!:]$/.test(text) && DANGLING.test(text.trim());
}

/**
 * A table-of-contents (or tabular list) entry: either dot leaders running to
 * a page number, or — in born-digital reports that right-align with spaces
 * instead — a gap wide enough that it can only be column alignment, not
 * ordinary word spacing.
 *
 * The gap alone is not enough: a footnote marker that wraps onto its own
 * short line ("previously reported results.   197") has exactly the same
 * shape and would otherwise be read as a contents entry, severing the
 * sentence and inventing a fake page listing. What tells them apart is the
 * character right before the gap — a title never ends the way a sentence
 * fragment does, on ".", "," ";" or ":".
 */
const TOC_ENTRY = /[.·]{4,}\s*\d{1,4}\s*$|(?<![.,;:])[ \t]{3,}\d{1,4}\s*$/;

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
  // "…should be rede-" is a line break inside a word, never a finished title.
  if (/[-­‐]$/.test(body)) return null;

  // "Part 4:  Why would anyone wish to kill" — a division that names its own
  // number. The title may wrap onto the next line (rejoined in `toBlocks`),
  // and a line that merely opens "Part 5 above…" is prose, not a division, so
  // the tail after the number has to read like a title: begin with a capital
  // or a quote and not trail off on a comma or full stop.
  const division = body.match(DIVISION_LABEL);
  if (division) {
    const rest = body.slice(division[0].length).replace(/^:\s*/, "").trim();
    if (rest && /^["'(A-Z0-9]/.test(rest) && !/[.,;]$/.test(rest)) {
      const label = `${division[1]} ${division[2]}`;
      return {
        level: DIVISION_TOP.test(division[1]) ? 2 : 3,
        text: `${label}: ${rest}`,
      };
    }
  }

  // "I. THE RESULTS OF THE INVESTIGATION" — roman numeral sections.
  // "A. Mr. Trump's Pressure on State Officials" — lettered subsections.
  const numbered = body.match(/^([IVXLC]{1,6}|[A-Z]|\d{1,2})\.\s+(.+)$/);
  if (numbered) {
    const title = numbered[2].trim();
    // A numbered *sentence* is a list item, not a heading. Reports set their
    // recommendations this way — "1. NASA should closely scrutinize each of the
    // concerns raised by …" — and reading them as structure fills the contents
    // with half-sentences. A wrapped narrative fragment ("On 23 November 2006,
    // Alexander Litvinenko died at University") clears the title-case bar on
    // its proper nouns alone and does not end on a full stop, so the tell is a
    // lower-case content word left once the stop-words are removed.
    const proseWord = title
      .split(/\s+/)
      .some((w) => /^[a-z]/.test(w) && /[a-z]/.test(w) && !STOPWORD.test(w));
    if (
      /^[A-Z]/.test(title) &&
      !/[.?!]$/.test(title) &&
      isTitular(title) &&
      !proseWord
    ) {
      // "C." and "D." are both letters and Roman numerals, so the marker
      // cannot tell us the level. In these reports the top-level sections are
      // set in caps and the subsections in title case, which can.
      const isSection = title === title.toUpperCase();
      return { level: isSection ? 2 : 3, text: title };
    }
  }

  // A standalone all-caps line with no terminal punctuation. Financial reports
  // set their tables in caps too, so a "heading" carrying money, percentages,
  // long numbers or a list of tickers is data, not structure.
  const letters = body.replace(/[^A-Za-z]/g, "");
  if (
    letters.length >= 4 &&
    body === body.toUpperCase() &&
    !/[.]$/.test(body) &&
    !/[$%]/.test(body) &&
    !/\d{3}/.test(body) &&
    (body.match(/,/g) ?? []).length < 2 &&
    letters.length / body.length > 0.6 &&
    // A single token in caps is an acronym on its own line ("RISC", "G-BNWX)"),
    // not a section title — real ones run to at least two words, or are a
    // single long word ("INTRODUCTION"). An embedded digit or hyphen is the
    // giveaway of a code, not a word.
    (/\s/.test(body) ? true : letters.length >= 5 && !/[-\d]/.test(body))
  ) {
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
    // TOC_ENTRY's whitespace-gap branch needs the line's real spacing, which
    // normaliseWhitespace below would collapse away before it gets a look.
    return TOC_ENTRY.test(line) || isHeading(normaliseWhitespace(line)) !== null;
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

  // The column a division heading's title starts at, while its title may still
  // be wrapping onto aligned continuation lines below it. -1 once the title is
  // complete (a blank line, a nested heading, or the first paragraph).
  let openDivisionIndent = -1;
  const DIVISION_LINE =
    /^(\s*)(?:Part|Chapter|Appendix|Annex|Volume|Section)\s+(?:\d{1,3}|[IVXLC]{1,7}):?\s+/;

  // An open list, and the column its items' text starts at. A line indented to
  // that column is the wrapped tail of the item above it, not a new block —
  // getting this wrong is what put text out of order (issue #12).
  let list: string[] | null = null;
  let listTextIndent = 0;

  // Which lines belong to a run that *opens* with a bullet.
  //
  // This is what tells a list apart from a quoted document that happens to
  // contain bullets. Both are indented runs, so indentation cannot separate
  // them. In the PSI report the bulleted passages are quoted emails: the run
  // opens with quoted prose and the bullets appear inside it, and lifting them
  // out breaks the quotation apart. A list of the kind issue #12 reported is a
  // run that is bullets from its first line.
  const inBulletRun = lines.map(() => false);
  for (let start = 0; start < lines.length; start++) {
    if (!lines[start].trim()) continue;
    let end = start;
    while (end + 1 < lines.length && lines[end + 1].trim()) end++;
    if (BULLET.test(lines[start])) {
      for (let j = start; j <= end; j++) inBulletRun[j] = true;
    }
    start = end;
  }

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
      openDivisionIndent = -1;
      // A blank line does not end a list: these documents routinely set one
      // between bullets.
      continue;
    }

    const bullet = inBulletRun[i] ? line.match(BULLET) : null;
    if (bullet) {
      flush();
      openDivisionIndent = -1;
      listTextIndent = line.length - bullet[3].length;
      if (!list) {
        list = [];
        // A list inside a quoted document stays inside it: these reports quote
        // guidance and emails that carry their own bullets, and dropping the
        // quotation would present someone else's words as the report's.
        blocks.push({ kind: "list", items: list, quoted: quoted[i] });
      }
      list.push(normaliseWhitespace(bullet[3]));
      continue;
    }

    if (list) {
      // Indented to the item text and not structure of its own: the rest of
      // the item above.
      if (inBulletRun[i] && !structural[i] && indentOf(line) >= listTextIndent - 1) {
        list[list.length - 1] = normaliseWhitespace(
          `${list[list.length - 1]} ${line.trim()}`
        );
        continue;
      }
      list = null;
    }

    // Headings and contents entries are recognisable on their own, and on
    // structured pages the indentation alone will not separate them — the
    // table of contents is set at a single indent throughout.
    const single = normaliseWhitespace(line);

    // Matched against the raw line, not `single` — the whitespace-gap branch
    // needs real spacing, which normaliseWhitespace collapses to one space.
    const contents = line.match(
      /^(.*\S)(?:[.·]{4,}\s*|(?<![.,;:])[ \t]{3,})(\d{1,4})\s*$/
    );
    if (contents && contents[1].trim()) {
      flush();
      openDivisionIndent = -1;
      blocks.push({
        kind: "contents",
        text: normaliseWhitespace(contents[1]).replace(/[.·\s]+$/, "").trim(),
        page: contents[2],
      });
      continue;
    }

    // A heading that wraps onto a line beginning lowercase is not detected as a
    // heading at all — "…the evenhanded administration of the" / "law was served
    // by Mr. Trump's prosecution" — so the title ships stopping mid-phrase and
    // its tail becomes a stray paragraph.
    const openHeading = blocks[blocks.length - 1];
    if (
      !current.length &&
      openHeading?.kind === "heading" &&
      danglesMidPhrase(openHeading.text) &&
      /^[a-z]/.test(single)
    ) {
      openHeading.text = `${openHeading.text} ${single}`;
      continue;
    }

    // A division title ("Part 6:  The polonium trail – events in") that runs
    // past one line continues on lines aligned under it. The tail is ordinary
    // title-case text — neither all-caps nor numbered — so it is not caught as
    // a heading of its own; fold it back in until the title is complete.
    if (
      !current.length &&
      openDivisionIndent >= 0 &&
      openHeading?.kind === "heading" &&
      isDivisionHeading(openHeading.text) &&
      !structural[i] &&
      !opensNumberedParagraph(single) &&
      indentOf(line) >= openDivisionIndent - 2
    ) {
      openHeading.text = `${openHeading.text} ${single}`;
      continue;
    }
    openDivisionIndent = -1;

    const standalone = isHeading(single);
    if (standalone) {
      flush();
      if (isDivisionHeading(standalone.text)) {
        openDivisionIndent = line.match(DIVISION_LINE)?.[0].length ?? indentOf(line);
      }
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
  const terminal = text.trim().replace(/["')\]]+$/, "");
  if (!/[.?!:;]$/.test(terminal)) return false;
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

    // A list item wrapping over the foot of a page arrives as a paragraph,
    // because each page is parsed on its own and the open list does not
    // survive the break. Left alone it reads after the list — the same
    // out-of-order defect as issue #12, one page-break narrower.
    if (
      block.kind === "paragraph" &&
      previous?.kind === "list" &&
      previous.items.length > 0 &&
      // A lowercase opening is the signal, not the punctuation the item ends
      // on: these items routinely end ")" or ";" mid-sentence, and a genuinely
      // new paragraph after a list opens with a capital.
      /^[a-z,;]/.test(block.text)
    ) {
      const last = previous.items.length - 1;
      previous.items[last] = `${previous.items[last]} ${block.text}`;
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
      if (block.kind === "list") {
        const prefix = block.quoted ? "> - " : "- ";
        return block.items.map((item) => `${prefix}${item}`).join("\n");
      }
      return block.text;
    })
    .join("\n\n");
}
