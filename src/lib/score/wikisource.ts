/**
 * A Wikisource Page: transcription (wikitext) as clean body text with footnote markers at character
 * offsets, for use as a page-level reference (reportsthatmatter-7d4y).
 *
 * Wikisource pages carry volunteer markup around the words: the running head and proofreading
 * status in <noinclude>, layout templates ({{c|..}}, {{asc|..}}, {{gap}}, {{dhr}}), wiki bold and
 * tables, and the footnotes. What this keeps is what the printed page's body says:
 *   - 9/11 marks a note reference as {{9-11|<chapter>|<note>}} and writes endnote text on its own
 *     pages as {{note|<n>|<n>.}}text; references become markers, note text goes to `notes`.
 *   - Chilcot writes the note inline as <ref>text</ref>; the reference becomes an unlabelled marker
 *     and the text goes to `notes`.
 * Only letters and digits matter downstream (src/lib/score/tokens.ts), so punctuation, quote styles and
 * markup need not be reproduced exactly; they only must not leave words behind or invent them.
 */

export type WikiMarker = { label: string | null; chapter: string | null; offset: number };
export type WikiPage = {
  text: string;
  markers: WikiMarker[];
  /** Text of notes written on the page (not part of the body reference). */
  notes: string[];
  /** The printed page label from the running head, when there is one. */
  printed: string | null;
  /** proofread-page quality level from <pagequality level="N" />, when present. */
  quality: number | null;
};

const MARK_OPEN = "\u0001";
const MARK_SEP = "\u0002";
const MARK_CLOSE = "\u0004";
const NOTE_START = "\u0003";

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#160;": " ", "&thinsp;": " ", "&ensp;": " ", "&emsp;": " " };

const IGNORE = new Set(["nop", "nopt", "br", "gap", "dhr", "ts", "raw image", "missing image", "image", "page break", "pb", "clear", "rule", "rh", "rvh", "left", "bar"]);
const SECOND_ARG = new Set(["inline-block", "spl"]);
const THIRD_ARG = new Set(["spl2"]);

function template(inner: string): string {
  const args = inner.split("|");
  const name = args[0].trim().toLowerCase();
  if (name === "9-11") return `${MARK_OPEN}${(args[2] ?? "").trim()}${MARK_SEP}${(args[1] ?? "").trim()}${MARK_CLOSE}`;
  if (name === "note") return NOTE_START;
  if (name === ". . ." || name === "..." || name === "…") return " ... ";
  if (IGNORE.has(name) || /\/(s|e)$/.test(name)) return " ";
  if (SECOND_ARG.has(name)) return ` ${args[1] ?? ""} `;
  if (THIRD_ARG.has(name)) return ` ${args[2] ?? ""} `;
  // a layout template wraps its content: the last argument that is not a named parameter (level=2, bold=no)
  const positional = args.slice(1).filter((a) => !/^\s*[\w -]{1,24}=[^=]{0,12}$/.test(a));
  const last = positional;
  return ` ${last.length ? last[last.length - 1] : ""} `;
}

export function cleanWikitext(src: string): WikiPage {
  const quality = /<pagequality\s+level="(\d)"/.exec(src);
  const head = [...src.matchAll(/<noinclude>([\s\S]*?)<\/noinclude>/g)].map((m) => m[1]).join(" ");
  let printed: string | null = null;
  const rvh = /\{\{rvh\|([^|}]*)\|/.exec(head);
  if (rvh && rvh[1].trim()) printed = rvh[1].trim();
  else {
    const rh = /\{\{rh\|([^}]*)\}\}/.exec(head);
    if (rh) printed = rh[1].split("|").map((s) => s.trim()).find((s) => /^(\d+|[ivxlc]+)$/i.test(s)) ?? null;
  }
  let s = src.replace(/<noinclude>[\s\S]*?<\/noinclude>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<\/?section\b[^>]*\/?>/g, " ");
  // note references written as <ref>: an unlabelled marker, text kept as a note
  s = s.replace(/<ref\b[^>]*\/>/g, `${MARK_OPEN}${MARK_SEP}${MARK_CLOSE}`);
  s = s.replace(/<ref\b[^>]*>([\s\S]*?)<\/ref>/g, (_m, t: string) => `${MARK_OPEN}${MARK_SEP}${MARK_CLOSE}${NOTE_START}${t}${NOTE_START}`);
  // a note reference written as a link to the notes page: <sup>[[9/11 Commission Report/Notes/Part 8#endnote_18|18]]</sup>
  s = s.replace(/<sup>\s*\[\[[^\]|]*#endnote_(\d+)\|[^\]]*\]\]\s*<\/sup>/g, (_m, n: string) => `${MARK_OPEN}${n}${MARK_SEP}${MARK_CLOSE}`);
  // images: the file's alt text is the transcriber's, not the page's
  s = s.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, " ");
  // links: [[a|b]] -> b, [[a]] -> a; external [url text] -> text
  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/\[(?:https?:)?\/\/\S+ ([^\]]*)\]/g, "$1");
  for (let k = 0; k < 12 && /\{\{/.test(s); k++) s = s.replace(/\{\{([^{}]*)\}\}/g, (_m, inner: string) => template(inner));
  s = s.replace(/\{\{|\}\}/g, " ");
  s = s.replace(/\b(?:style|class|colspan|rowspan|width|height|align|valign|scope|border|cellpadding|cellspacing|bgcolor)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s|"']+)/gi, " ");
  s = s.replace(/^\{\|.*$|^\|[-}+].*$/gm, " ").replace(/^[|!]\s*/gm, " ").replace(/\|\|/g, " ").replace(/\s\|\s/g, " ");
  s = s.replace(/'{2,5}/g, "").replace(/^=+\s*(.*?)\s*=+\s*$/gm, "$1");
  s = s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&#?\w+;/g, (e) => ENTITIES[e] ?? " ");

  // body vs notes: a Chilcot <ref> was wrapped in NOTE_START ... NOTE_START (back to the body after the second);
  // a 9/11 {{note|..}} starts a note that runs to the next {{note|..}} or the end of the page.
  let body = "";
  const notes: string[] = [];
  const parts = s.split(NOTE_START);
  const wrapped = /<ref\b/.test(src);
  parts.forEach((p, i) => {
    if (i === 0) body += p;
    else if (wrapped) (i % 2 === 1 ? notes.push(p.trim()) : (body += p));
    else notes.push(p.trim());
  });

  // markers: extract, with offsets into the whitespace-collapsed text
  let text = "";
  const markers: WikiMarker[] = [];
  let space = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === MARK_OPEN) {
      const end = body.indexOf(MARK_CLOSE, i);
      const [label, chapter] = body.slice(i + 1, end).split(MARK_SEP);
      markers.push({ label: label || null, chapter: chapter || null, offset: text.length });
      i = end;
    } else if (/\s/.test(ch)) {
      if (!space && text.length) text += " ";
      space = true;
    } else {
      text += ch;
      space = false;
    }
  }
  return { text: text.trim(), markers, notes, printed, quality: quality ? Number(quality[1]) : null };
}
