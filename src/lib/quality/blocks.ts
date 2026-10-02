/**
 * The block model the quality signals read: a report's `full.md` (front
 * matter stripped) split on blank lines, each block classified by its first
 * characters. Independent of @rtm/ingest's own block model on purpose: a gate
 * that reuses the pipeline's parser shares its blind spots (catalogue §2,
 * reason 5).
 */

export type BlockKind = "heading" | "quote" | "list" | "note" | "page" | "table" | "prose";

export type Block = {
  kind: BlockKind;
  /** The block as written (quote blocks keep their `> ` prefixes). */
  raw: string;
  /** Prose text; for a quote the text with its `> ` prefixes removed. */
  text: string;
  /** The printed page this block sits on (last page marker seen), if numeric. */
  page: number | null;
  /** The marker's own label (`12`, `2#3`, `xiv`); null before any marker. */
  pageLabel: string | null;
};

export function stripFrontMatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
}

export function frontMatterPages(markdown: string): number | null {
  const m = /^---\n[\s\S]*?\n---\n/.exec(markdown);
  const p = m ? /^pages:\s*(\d+)\s*$/m.exec(m[0]) : null;
  return p ? Number(p[1]) : null;
}

const PAGE_MARKER = /^%%page ([^%]+)%%$/;

/** `12` and the duplicate-numbered `12#2` are page 12; roman folios have no number. */
export function pageNumber(label: string): number | null {
  const m = /^(\d+)(?:#\d+)?$/.exec(label);
  return m ? Number(m[1]) : null;
}

export function classify(raw: string): BlockKind {
  if (PAGE_MARKER.test(raw)) return "page";
  if (/^#{1,6}\s/.test(raw)) return "heading";
  if (raw.startsWith(">")) return "quote";
  if (/^\[\^[^\]]+\]:/.test(raw)) return "note";
  if (raw.startsWith("|")) return "table";
  if (/^- /.test(raw)) return "list";
  return "prose";
}

export function toBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let page: number | null = null;
  let pageLabel: string | null = null;
  for (const piece of stripFrontMatter(markdown).split(/\n{2,}/)) {
    const raw = piece.trim();
    if (!raw) continue;
    const kind = classify(raw);
    if (kind === "page") {
      pageLabel = PAGE_MARKER.exec(raw)![1];
      page = pageNumber(pageLabel);
    }
    const text = kind === "quote" ? raw.replace(/^>[ \t]?/gm, "") : raw;
    blocks.push({ kind, raw, text, page, pageLabel });
  }
  return blocks;
}

/** A linked footnote marker (`[^12]`, `[^12-14]`). */
export const LINKED_MARKERS = /\[\^\d+(?:-\d+)?\]/g;

export function stripMarkers(text: string): string {
  return text.replace(LINKED_MARKERS, "");
}

const ABBREVIATION =
  /\b(mr|mrs|ms|dr|prof|sen|rep|gov|st|nos?|vs?|inc|co|corp|ltd|jr|sr|u\.s|e\.g|i\.e|cf|ch|art|sec|fig|para|pp?|ecf|tr)\.$/i;
const INITIAL = /\b[A-Z]\.$/;
const SENTENCE_END = /[.?!:;][”’"')\]]*(?:\s*(?:\d{1,3}|\*))*\s*$/;

/**
 * Whether a prose block finishes its sentence: a closing [.?!:;], then
 * optional closing quotes or brackets, then any run of linked markers, bare
 * one-to-three digit markers or asterisks. An abbreviation or initial before
 * the full stop does not end one.
 */
export function endsSentence(text: string): boolean {
  const t = stripMarkers(text).trim();
  if (!SENTENCE_END.test(t)) return false;
  const bare = t.replace(/(?:\s*(?:\d{1,3}|\*))+\s*$/, "").replace(/[”’"')\]]+$/, "");
  if (ABBREVIATION.test(bare) || INITIAL.test(bare)) return false;
  return true;
}
