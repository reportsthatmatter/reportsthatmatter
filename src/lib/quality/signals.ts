/**
 * Quality signals: pure functions over one report, each counting a class of
 * defect the reader sees and no earlier check measured. See
 * docs/design/2026-10-02-quality-harness-plan.md §3.1 and the catalogue (class
 * letters in brackets below).
 *
 * A signal is `(input) => Finding[]`. `pnpm quality check` compares each
 * signal's count for a report with reports/quality-budget.yaml.
 */
import { paragraphDensityCheck } from "../density";
import { endsSentence, frontMatterPages, pageNumber, stripMarkers, toBlocks, type Block } from "./blocks";
import { bodyOf, noteDefinitions, pairNoteReferences } from "./note-pairing";
import { numberedProseList } from "./numbered-lists";

export type Meta = {
  words: number;
  sections: { slug: string; title: string; page?: string | null; level?: number }[];
  paragraphToSection?: Record<string, string>;
};

export type QualityInput = {
  markdown: string;
  html: string;
  meta: Meta;
  /** From the budget file: this report's own citation vocabulary (SCO-, Hearing Exhibit ...). */
  citationVocabulary?: string[];
};

export type Finding = {
  signal: string;
  /** Printed page number the finding sits on, when the report has one. */
  page: number | null;
  excerpt: string;
  /** Whether the defect straddles a page break. */
  crossedPage?: boolean;
};

export type SignalKind =
  /** One finding per instance; the budget is a maximum count. */
  | "count"
  /** One number (a percentage, in points); `value` gives it and the budget is its ceiling. */
  | "metric";

export type Signal = {
  id: string;
  kind: SignalKind;
  /** Catalogue class letter(s). */
  cls: string;
  /** Advisory signals are reported but never gated (no budget until precision is measured). */
  advisory?: boolean;
  doc: string;
  run: (input: QualityInput) => Finding[];
  /** metric signals: the measured number (percentage points). */
  value?: (input: QualityInput) => number;
};

const clip = (text: string, n = 160) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

const finding = (signal: string, block: Block, excerpt: string, extra: Partial<Finding> = {}): Finding => ({
  signal,
  page: block.page,
  excerpt: clip(excerpt),
  ...extra,
});

const proseBlocks = (input: QualityInput) => toBlocks(input.markdown);

// ---------------------------------------------------------------- severed (A, B, C)

/** Lower case, or punctuation no sentence opens on. */
const CONTINUES = /^[a-zà-ÿ,;)]/;
/** A lettered or roman sub-item ("b. On 4 November ..."): a new item, not a continuation (reportsthatmatter-0wm). */
const ITEM_LABEL = /^\(?(?:[a-z]|[ivx]{1,4})[.)]\s+\S/;
const OPENS_QUOTATION = /^["“‘'[(]/;

type Severed = { kind: "quote" | "paragraph" | "capitalised"; before: Block; after: Block; crossed: boolean };

function severed(input: QualityInput): Severed[] {
  const blocks = proseBlocks(input);
  const out: Severed[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const before = blocks[i];
    // A quotation that stops mid-sentence counts too: the catalogue's counts do.
    if ((before.kind !== "prose" && before.kind !== "quote") || endsSentence(before.text)) continue;
    let j = i + 1;
    while (j < blocks.length && blocks[j].kind === "page") j++;
    if (j >= blocks.length) continue;
    const after = blocks[j];
    const crossed = j > i + 1;
    if (ITEM_LABEL.test(after.text.replace(/^>\s*/, ""))) continue;
    if (after.kind === "quote") {
      if (/^-/.test(after.text) || OPENS_QUOTATION.test(after.text)) continue;
      if (CONTINUES.test(after.text)) out.push({ kind: "quote", before, after, crossed });
    } else if (after.kind === "prose") {
      if (CONTINUES.test(after.text)) out.push({ kind: "paragraph", before, after, crossed });
      else if (crossed) out.push({ kind: "capitalised", before, after, crossed });
    }
  }
  return out;
}

const severedFinding = (signal: string, s: Severed): Finding =>
  finding(signal, s.before, `${s.before.text.slice(-70)} ⏎ ${s.after.text.slice(0, 70)}`, { crossedPage: s.crossed });

export const severedIntoQuote: Signal = {
  id: "severed-into-quote",
  kind: "count",
  cls: "A",
  doc: "A prose or quotation block that does not end its sentence, then a quotation opening in lower case or on , ; ) with no opening quotation mark.",
  run: (input) => severed(input).filter((s) => s.kind === "quote").map((s) => severedFinding("severed-into-quote", s)),
};

export const severedParagraph: Signal = {
  id: "severed-paragraph",
  kind: "count",
  cls: "B/C",
  doc: "A prose or quotation block that does not end its sentence, then a prose block opening in lower case or on , ; ).",
  run: (input) =>
    severed(input)
      .filter((s) => s.kind === "paragraph")
      .map((s) => severedFinding("severed-paragraph", s)),
};

export const severedParagraphCapital: Signal = {
  id: "severed-paragraph-capital",
  kind: "count",
  cls: "B",
  advisory: true,
  doc: "Across a page break only: unfinished sentence, next page's first prose block opens on a capital. Unbudgeted until its precision is measured (b78.6).",
  run: (input) =>
    severed(input)
      .filter((s) => s.kind === "capitalised")
      .map((s) => severedFinding("severed-paragraph-capital", s)),
};

// ---------------------------------------------------------------- bare footnote markers (F)

const BARE_MARKER = /[a-z\)”"’][.,;:!?][1-9]\d{0,2}(?=\s+[A-Z“"]|$)/gm;

export function bareMarkerStats(input: QualityInput): { bare: number; definitions: number } {
  const bare = bareFootnoteMarker.run(input).length;
  const definitions = (input.markdown.match(/^\[\^[^\]]+\]:/gm) ?? []).length;
  return { bare, definitions };
}

export const bareFootnoteMarker: Signal = {
  id: "bare-footnote-marker",
  kind: "count",
  cls: "F",
  doc: "Digits glued to a word after sentence punctuation in prose or quotations (`impartial.15 I underline`): a footnote marker that never became a link.",
  run: (input) => {
    const out: Finding[] = [];
    for (const block of proseBlocks(input)) {
      if (block.kind !== "prose" && block.kind !== "quote") continue;
      const text = stripMarkers(block.text);
      for (const m of text.matchAll(BARE_MARKER)) {
        const at = m.index ?? 0;
        out.push(finding("bare-footnote-marker", block, text.slice(Math.max(0, at - 40), at + m[0].length + 30)));
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------- note text in the body (E)

const MONTH = /^\d{1,3}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/;
const NOTE_NUMBER = /^\d{1,3}\s+(?:[A-Z]|See\b|Id\.|Ibid)/;
const NOTE_WORDS = /^(?:Ibid|Id\.|See,? (?:e\.g\.,? )?(?:supra|id\.|[A-Z])|Cf\.|Supra|Testimony of|Interview with|Hearing Exhibit)/;

export const noteTextInBody: Signal = {
  id: "note-text-in-body",
  kind: "count",
  cls: "E",
  doc: "A prose block that opens the way a footnote does: `12 See ...`, `Ibid.`, `Testimony of`.",
  run: (input) => {
    const out: Finding[] = [];
    for (const block of proseBlocks(input)) {
      if (block.kind !== "prose") continue;
      const text = stripMarkers(block.text).trim();
      if ((NOTE_NUMBER.test(text) && !MONTH.test(text)) || NOTE_WORDS.test(text)) {
        out.push(finding("note-text-in-body", block, text));
      }
    }
    return out;
  },
};

export const noteCitationVocabulary: Signal = {
  id: "note-citation-vocabulary",
  kind: "count",
  cls: "E",
  doc: "Prose blocks containing a term from the report's own citationVocabulary (budget file), the technique that found PSI's 626. Counts nothing where none is declared.",
  run: (input) => {
    const vocab = input.citationVocabulary ?? [];
    if (!vocab.length) return [];
    const escaped = vocab.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(escaped.join("|"));
    const out: Finding[] = [];
    for (const block of proseBlocks(input)) {
      if (block.kind !== "prose") continue;
      const text = stripMarkers(block.text);
      if (pattern.test(text)) out.push(finding("note-citation-vocabulary", block, text));
    }
    return out;
  },
};

// ---------------------------------------------------------------- furniture (K)

export const furnitureParagraph: Signal = {
  id: "furniture-paragraph",
  kind: "count",
  cls: "K/I",
  doc: "A prose block of at most 12 words (the plan said 8, but Litvinenko's `Part 3 | Chapters 1 to 5 | Alexander Litvinenko` running head is 10) whose lower-cased text recurs 4 or more times in the report (running heads left as paragraphs). Every occurrence counts.",
  run: (input) => {
    const short = proseBlocks(input).filter((b) => b.kind === "prose" && b.text.trim().split(/\s+/).length <= 12);
    const key = (b: Block) => stripMarkers(b.text).trim().toLowerCase();
    const seen = new Map<string, Block[]>();
    for (const b of short) seen.set(key(b), [...(seen.get(key(b)) ?? []), b]);
    const out: Finding[] = [];
    for (const [text, blocks] of seen) {
      if (!text || blocks.length < 4) continue;
      for (const b of blocks) out.push(finding("furniture-paragraph", b, `${b.text} (×${blocks.length})`));
    }
    return out.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
  },
};

// ---------------------------------------------------------------- contents without headings (I)

const ENTRY_STRICT = /^- (.+?)(?:\s+—\s+|\s*(?:\.\s?){3,}\s*)(\d{1,4}|[ivxlc]{1,6})\s*$/i;

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/\\([.\-()[\]#*_])/g, "$1")
    .replace(/\[\^\d+(?:-\d+)?\]/g, "")
    .replace(/^(?:chapter|part|section|annex|appendix)?\s*(?:\d+(?:\.\d+)*|[ivxlc]+|[a-z])[.):]\s+/, "")
    .replace(/^\((?:\d+|[a-z]|[ivxlc]+)\)\s*/, "")
    .replace(/^(?:chapter|part|section|annex|appendix)\s+(?:\d+(?:\.\d+)*|[ivxlc]+)\s+/, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export function contentsEntries(blocks: Block[]): { entry: string; block: Block }[] {
  const entries: { entry: string; block: Block }[] = [];
  for (const block of blocks) {
    if (block.kind !== "list") continue;
    for (const line of block.raw.split("\n")) {
      const m = ENTRY_STRICT.exec(line);
      if (m) entries.push({ entry: m[1], block });
    }
  }
  return entries;
}

export function contentsStats(input: QualityInput): { entries: number; missing: number; ratio: number } {
  const entries = contentsEntries(proseBlocks(input)).length;
  const missing = contentsEntryWithoutHeading.run(input).length;
  return { entries, missing, ratio: entries ? missing / entries : 0 };
}

export const contentsEntryWithoutHeading: Signal = {
  id: "contents-entry-without-heading",
  kind: "count",
  cls: "I",
  doc: "A list item shaped `- Title — N` (or dot leaders then N) with no heading whose normalised text equals or ends with it: a contents entry whose chapter never became a heading.",
  run: (input) => {
    const blocks = proseBlocks(input);
    const headings = blocks.filter((b) => b.kind === "heading").map((b) => normalise(b.text.replace(/^#+\s*/, "")));
    const out: Finding[] = [];
    for (const { entry, block } of contentsEntries(blocks)) {
      const n = normalise(entry);
      if (!n) continue;
      if (headings.some((h) => h === n || h.endsWith(n) || h.startsWith(n) || (h.length >= 12 && n.startsWith(h)))) continue;
      out.push(finding("contents-entry-without-heading", block, entry));
    }
    return out;
  },
};

// ---------------------------------------------------------------- heading plausibility (H/I)

const FUNCTION_WORD_END = /\b(?:of|the|and|to|in|for|a|an|on|by|with|or|at)$/i;

function headings(input: QualityInput) {
  return proseBlocks(input)
    .filter((b) => b.kind === "heading")
    .map((block) => ({ block, title: block.text.replace(/^#+\s*/, "").trim() }));
}

export const headingDensity: Signal = {
  id: "heading-density",
  kind: "count",
  cls: "H/I",
  doc: "One finding when headings per 100 pages fall outside [3, 60]: a flat report or one with captions promoted to sections.",
  run: (input) => {
    const hs = headings(input);
    const blocks = proseBlocks(input);
    const pages = frontMatterPages(input.markdown) ?? blocks.filter((b) => b.kind === "page").length;
    if (!pages) return [];
    const per100 = (hs.length / pages) * 100;
    if (per100 >= 3 && per100 <= 60) return [];
    return [
      { signal: "heading-density", page: null, excerpt: `${hs.length} headings over ${pages} pages = ${per100.toFixed(1)} per 100 pages (allowed 3 to 60)` },
    ];
  },
};

export const headingRepeated: Signal = {
  id: "heading-repeated",
  kind: "count",
  cls: "H",
  doc: "A heading text that appears 3 or more times; one finding per repeated text.",
  run: (input) => {
    const seen = new Map<string, ReturnType<typeof headings>>();
    for (const h of headings(input)) {
      const k = h.title.toLowerCase();
      seen.set(k, [...(seen.get(k) ?? []), h]);
    }
    return [...seen.values()]
      .filter((hs) => hs.length >= 3)
      .map((hs) => finding("heading-repeated", hs[0].block, `${hs[0].title} (×${hs.length})`));
  },
};

export const headingFunctionWord: Signal = {
  id: "heading-function-word",
  kind: "count",
  cls: "H/I",
  doc: "A heading ending in a function word (of, the, and, to ...): truncated or wrapped.",
  run: (input) =>
    headings(input)
      .filter((h) => FUNCTION_WORD_END.test(stripMarkers(h.title).trim()))
      .map((h) => finding("heading-function-word", h.block, h.title)),
};

export const headingMarker: Signal = {
  id: "heading-marker",
  kind: "count",
  cls: "G",
  doc: "A heading containing a footnote marker [^N].",
  run: (input) =>
    headings(input)
      .filter((h) => /\[\^\d+/.test(h.title))
      .map((h) => finding("heading-marker", h.block, h.title)),
};

export const headingLong: Signal = {
  id: "heading-long",
  kind: "count",
  cls: "H",
  doc: "A heading longer than 14 words: usually a caption or a body line promoted.",
  run: (input) =>
    headings(input)
      .filter((h) => stripMarkers(h.title).split(/\s+/).length > 14)
      .map((h) => finding("heading-long", h.block, h.title)),
};

// ---------------------------------------------------------------- page reversal (K)

export const printedPageReversal: Signal = {
  id: "printed-page-reversal",
  kind: "count",
  cls: "K",
  doc: "Consecutive %%page N%% markers where N decreases (`94 → 2`): a chapter number or folio misread as the page. Duplicate-numbered pages (`2#3`) count as 2.",
  run: (input) => {
    const out: Finding[] = [];
    let prev: { n: number; label: string } | null = null;
    for (const b of proseBlocks(input)) {
      if (b.kind !== "page" || b.pageLabel === null) continue;
      const n = pageNumber(b.pageLabel);
      if (n === null) continue;
      if (prev && n < prev.n) {
        out.push({ signal: "printed-page-reversal", page: n, excerpt: `page ${prev.label} → ${b.pageLabel}` });
      }
      prev = { n, label: b.pageLabel };
    }
    return out;
  },
};

// ---------------------------------------------------------------- rendered HTML (J, N)

export const renderedH1: Signal = {
  id: "rendered-h1",
  kind: "count",
  cls: "N",
  doc: "An <h1> in the rendered body (a paragraph opening with a literal `#`). Should be 0.",
  run: (input) => {
    const out: Finding[] = [];
    for (const m of input.html.matchAll(/<h1[\s>][\s\S]*?<\/h1>/g)) {
      out.push({ signal: "rendered-h1", page: null, excerpt: clip(m[0].replace(/<[^>]+>/g, "")) });
    }
    return out;
  },
};

/**
 * A chapter heading (h2) with opening paragraphs before its first subsection (h3) whose first
 * paragraph is served on a section page other than the one headed by that chapter: the chapter
 * opening is filed under the previous section (reportsthatmatter-n9em: 9/11 chapter 1 under
 * 'preface'). Reads the shipped meta (paragraphToSection, section titles), so it checks what a
 * reader is served, not the markdown. Should be 0.
 */
export const chapterIntroMisfiled: Signal = {
  id: "chapter-intro-misfiled",
  kind: "count",
  cls: "N",
  doc: "A chapter's opening paragraphs (between a ## and its first ###) served under a different section page than the chapter's own. Should be 0.",
  run: (input) => {
    const out: Finding[] = [];
    const titleOf = new Map(input.meta.sections.map((sec) => [sec.slug, plain(sec.title)]));
    const index = input.meta.paragraphToSection ?? {};
    for (const m of input.html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h[23]\b|$)/g)) {
      const firstId = m[2].match(/<p\b[^>]*\bid="([^"]+)"/)?.[1];
      if (!firstId) continue;
      if (!/<h3\b/.test(input.html.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 5))) continue;
      const slug = index[firstId];
      if (slug === undefined || titleOf.get(slug) === plain(m[1])) continue;
      out.push({ signal: "chapter-intro-misfiled", page: null, excerpt: clip(`${plain(m[1])} (opening is under "${titleOf.get(slug) ?? slug}")`) });
    }
    return out;
  },
};

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export function olWordsShare(input: QualityInput): number {
  if (!input.meta.words) return 0;
  let words = 0;
  for (const m of input.html.matchAll(/<ol[\s>][\s\S]*?<\/ol>/g)) {
    words += (m[0].replace(/<[^>]+>/g, " ").match(/\S+/g) ?? []).length;
  }
  return (words / input.meta.words) * 100;
}

export const renderedOlWordsShare: Signal = {
  id: "rendered-ol-words-share",
  kind: "metric",
  cls: "J",
  doc: "Words inside <ol> as a percentage of the report's words: text with no paragraph id, so no permalink. Budget is the ceiling in whole points.",
  value: olWordsShare,
  run: (input) => {
    const v = olWordsShare(input);
    return v > 0 ? [{ signal: "rendered-ol-words-share", page: null, excerpt: `${v.toFixed(1)}% of ${input.meta.words.toLocaleString()} words are inside <ol>` }] : [];
  },
};

export const idsPer1kWords: Signal = {
  id: "ids-per-1k-words",
  kind: "count",
  cls: "J",
  doc: "Paragraph ids per 1,000 words below the density floor (src/lib/density.ts). One finding when below; its budget is 0.",
  run: (input) => {
    const ids = Object.keys(input.meta.paragraphToSection ?? {}).length;
    const { ok, perThousandWords } = paragraphDensityCheck(input.meta.words, ids);
    return ok
      ? []
      : [{ signal: "ids-per-1k-words", page: null, excerpt: `${perThousandWords.toFixed(2)} ids per 1,000 words (floor 4)` }];
  },
};

// ---------------------------------------------------------------- quote share by page parity (D)

export function quoteParity(input: QualityInput): { overall: number; even: number; odd: number; gap: number } {
  const count = { even: { q: 0, p: 0 }, odd: { q: 0, p: 0 } };
  let q = 0;
  let p = 0;
  for (const b of proseBlocks(input)) {
    if (b.kind !== "quote" && b.kind !== "prose") continue;
    if (b.kind === "quote") q++;
    else p++;
    if (b.page === null) continue;
    const side = count[b.page % 2 === 0 ? "even" : "odd"];
    if (b.kind === "quote") side.q++;
    else side.p++;
  }
  const share = (c: { q: number; p: number }) => (c.q + c.p ? (c.q / (c.q + c.p)) * 100 : 0);
  const even = share(count.even);
  const odd = share(count.odd);
  return { overall: q + p ? (q / (q + p)) * 100 : 0, even, odd, gap: Math.abs(even - odd) };
}

export const quoteShareParity: Signal = {
  id: "quote-share-parity",
  kind: "metric",
  cls: "D",
  doc: "Absolute difference, in points, between the share of blocks that are quotations on even and on odd printed pages. A body printed as quotations on one side of the spread (Deepwater) shows ~90.",
  value: (input) => quoteParity(input).gap,
  run: (input) => {
    const s = quoteParity(input);
    return s.gap > 0
      ? [{ signal: "quote-share-parity", page: null, excerpt: `quotations ${s.even.toFixed(1)}% of blocks on even pages, ${s.odd.toFixed(1)}% on odd (gap ${s.gap.toFixed(1)})` }]
      : [];
  },
};

// ---------------------------------------------------------------- notes that open the wrong note (G)

const REFERENCE = /\[\^(\d+(?:-\d+)?)\]/g;
const SIDENOTE = /<span class="sidenote(?: long)?"><sup>[^<]*<\/sup> ([\s\S]*?)(?:<label class="sidenote-expand"[^>]*>Show full note<\/label>)?<\/span>/g;

const unescapeText = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

type Pairing = { label: string; excerpt: string; defined: boolean; expected: string | null };

/**
 * Every `[^N]` reference in the body with the definition it belongs to: a label defined once is
 * that note; a repeated label (numbering that restarts per chapter) is paired by alignment, which
 * a stray marker cannot shift. `expected` is null for a reference no definition pairs with.
 */
function notePairings(markdown: string): Pairing[] {
  const defs = noteDefinitions(markdown);
  const body = bodyOf(markdown);
  const refs = [...body.matchAll(REFERENCE)];
  const paired = pairNoteReferences(refs.map((m) => m[1]), defs.map((d) => d.label));
  const byLabel = new Map<string, string[]>();
  for (const d of defs) byLabel.set(d.label, [...(byLabel.get(d.label) ?? []), d.text]);
  return refs.map((m, i) => {
    const at = m.index ?? 0;
    const list = byLabel.get(m[1]);
    return {
      label: m[1],
      excerpt: body.slice(Math.max(0, at - 50), at + m[0].length + 20),
      defined: !!list,
      expected: list && paired[i] !== null ? list[paired[i]!] : null,
    };
  });
}

export const noteMarkerWrongNote: Signal = {
  id: "note-marker-wrong-note",
  kind: "count",
  cls: "G",
  doc: "A marker whose rendered sidenote is not the definition it belongs to: a repeated note label (numbering that restarts per chapter) resolved by count, so one stray marker made every later one open the previous chapter's note (9/11 `Tue sday, Se ptembe r 11,[^20] 01`, 148 markers; reportsthatmatter-apk). Compares the rendered page's sidenotes with the alignment of references to definitions, so it also fails on a renderer that goes back to counting.",
  run: (input) => {
    // Only references with a definition render a sidenote; the others stay as `[^N]` text.
    const shown = notePairings(input.markdown).filter((p) => p.defined);
    const rendered = [...input.html.matchAll(SIDENOTE)].map((m) => unescapeText(m[1]).trim());
    if (shown.length !== rendered.length) {
      return [{ signal: "note-marker-wrong-note", page: null, excerpt: `${shown.length} references with notes, ${rendered.length} rendered sidenotes: cannot compare` }];
    }
    const out: Finding[] = [];
    shown.forEach((p, i) => {
      if (p.expected !== null && rendered[i] !== p.expected) {
        out.push({ signal: "note-marker-wrong-note", page: null, excerpt: clip(`${p.excerpt} → opens "${rendered[i]}", belongs to "${p.expected}"`, 260) });
      }
    });
    return out;
  },
};

export const noteMarkerUnpaired: Signal = {
  id: "note-marker-unpaired",
  kind: "count",
  cls: "G",
  doc: "A reference to a repeated note label that no definition pairs with in reading order: a spurious marker (a year split `20 01`, a count read as a note) or a note cited twice. The root defect behind note-marker-wrong-note; each one is a place the text or the notes lost a number.",
  run: (input) =>
    notePairings(input.markdown)
      .filter((p) => p.defined && p.expected === null)
      .map((p) => ({ signal: "note-marker-unpaired", page: null, excerpt: clip(p.excerpt) })),
};

// ---------------------------------------------------------------- registry

export const SIGNALS: Signal[] = [
  severedIntoQuote,
  severedParagraph,
  severedParagraphCapital,
  bareFootnoteMarker,
  noteMarkerWrongNote,
  noteMarkerUnpaired,
  noteTextInBody,
  noteCitationVocabulary,
  furnitureParagraph,
  contentsEntryWithoutHeading,
  headingDensity,
  headingRepeated,
  headingFunctionWord,
  headingMarker,
  headingLong,
  printedPageReversal,
  renderedH1,
  chapterIntroMisfiled,
  renderedOlWordsShare,
  numberedProseList,
  idsPer1kWords,
  quoteShareParity,
];
