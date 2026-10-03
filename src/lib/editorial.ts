/**
 * Our own layer on a report (reportsthatmatter-g0w): the report's landing
 * page — what it was about, why it matters, what it found, and how to read it
 * — written by us and shown labelled as ours.
 *
 * Source is `editorial/<report-id>.yaml`. `scripts/editorial.mjs` checks every
 * quote against the pre-rendered report and writes the resolved result to
 * `src/generated/editorial.ts`, which is all the Worker ever reads. The check
 * is the point: a quote we attribute to a report that is not in it is the one
 * mistake this project cannot afford, so it fails the build rather than
 * shipping.
 */
import { extractParagraph } from "../templates/report";
import { encodeAnchor, findText, normalise, selectorFor } from "../../assets/anchor.js";

/** A verbatim quotation from the report, and the paragraph it comes from. */
export type QuoteSource = { paragraph: string; quote: string };

/**
 * A landing page's hero photograph, as written in the editorial file
 * (reportsthatmatter-cdp.3). The file itself is built by `pnpm heroes` from
 * docs/design/2026-09-27-hero/sources.yaml, which holds the full sourcing
 * record; this is what the page shows.
 */
export type HeroSource = {
  /** The 2400px file, `/assets/heroes/<report-id>.webp`; its `-1200.webp` sibling must exist too. */
  src: string;
  /** The line under the image: what it shows, the date, photographer and licence. */
  credit: string;
  /** The page the credit links to: the photograph's source. */
  source: string;
  /** What the photograph shows. Required: it is content, not decoration. */
  alt: string;
  /** CSS object-position, so the subject survives the band's wide crop. Default "50% 50%". */
  focus?: string;
  /** For the record, e.g. "CC BY 2.0" or "Fair use"; not printed. */
  licence?: string;
};

/** A hero resolved at build time, with the pixel size of each file. */
export type Hero = {
  src: string;
  width: number;
  height: number;
  small: { src: string; width: number };
  credit: string;
  source: string;
  alt: string;
  focus: string;
};

/** How the build learns a hero file's pixel size: null when there is no such file. */
export type AssetSize = (src: string) => { width: number; height: number } | null;

/** As written in `editorial/<report-id>.yaml` (format v2, g0w.9). */
export type EditorialSource = {
  report: string;
  status: "draft" | "approved";
  /** One or two sentences: the standfirst, and the page's meta description. */
  why_it_matters: string;
  /** What the report was about, what happened, and why it still matters. Paragraphs split on blank lines. */
  background?: string;
  findings: Array<{ text: string; cites: string[]; excerpt?: QuoteSource }>;
  /** "If you have half an hour": the sections to read, and why. */
  reading_guide?: Array<{
    section: string;
    /** Our name for it, where the report's own heading is not usable (an extraction artefact, a shouted caption). */
    title?: string;
    why: string;
    excerpt?: QuoteSource;
  }>;
  /** Passages Rufus has highlighted: seeded into the marks table, not printed on the landing page. */
  highlights?: Array<QuoteSource & { context?: string; card?: boolean }>;
  /** The landing page's hero photograph (reportsthatmatter-cdp): optional. */
  hero?: HeroSource;
};

/** A paragraph a finding or passage links to, resolved at build time. */
export type Citation = { id: string; page: number | null; href: string };

/** A verified quotation, with its link. */
export type Quotation = { quote: string; cite: Citation };

/** What the Worker renders: the source, with every reference checked and resolved. */
export type Editorial = {
  status: "draft" | "approved";
  whyItMatters: string;
  background: string[];
  findings: Array<{ text: string; cites: Citation[]; excerpt?: Quotation }>;
  readingGuide: Array<{ slug: string; title: string; page: string | null; why: string; excerpt?: Quotation }>;
  hero?: Hero;
};

/** A highlight, resolved to a row the marks table can take. */
export type ResolvedHighlight = {
  report: string;
  section: string;
  paragraph: string;
  exact: string;
  prefix: string;
  suffix: string;
  page: number | null;
};

/** What the build knows of a report's structure, from its pre-rendered meta.json. */
export type ReportStructure = {
  sections: Array<{ slug: string; title: string; page?: string | null }>;
  paragraphToSection: Record<string, string>;
};

/**
 * A quote or a paragraph as plain readable text: whitespace collapsed and soft
 * hyphens dropped, but otherwise as printed (curly quotes and all), so anchors
 * built from it keep the report's own spelling.
 *
 * Matching goes through `findText`, which also forgives typographic variants
 * (quote style, dashes, ellipses, nbsp, ligatures) on both sides, so a quote
 * need not be edited to match the edition's quote style. Anything beyond that
 * — a corrected OCR slip, a changed word — is a different quote and must fail.
 */
export function comparable(text: string): string {
  return normalise(text.replace(/­/g, ""));
}

/** Plain text of whatever follows a paragraph up to the next one with an id: its block quotations. */
function followingUnlabelled(html: string, id: string): string {
  const start = html.indexOf(`<p id="${id}"`);
  if (start === -1) return "";
  const end = html.indexOf("</p>", start);
  const next = html.slice(end + 4).search(/<(p|h[1-6]) id="/);
  const tail = next === -1 ? html.slice(end + 4) : html.slice(end + 4, end + 4 + next);
  return tail
    .replace(/<a class="page-marker"[\s\S]*?<\/a>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Where `quote` sits relative to paragraph `id`, or why it cannot be placed.
 *
 * `inParagraph` means the words are in the paragraph itself, so the link can
 * name them exactly. A quote from a block quotation — which has no id of its
 * own yet (reportsthatmatter-dam) — is found in the unlabelled blocks after
 * the paragraph that introduces it, and links to that paragraph.
 */
export function placeQuote(
  html: string,
  id: string,
  quote: string
): { ok: true; inParagraph: boolean; paragraph: string } | { ok: false; reason: string } {
  const paragraph = extractParagraph(html, id);
  if (paragraph === null) return { ok: false, reason: `no paragraph "${id}"` };

  const wanted = comparable(quote);
  if (findText(comparable(paragraph), wanted)) return { ok: true, inParagraph: true, paragraph };
  if (findText(comparable(followingUnlabelled(html, id)), wanted)) {
    return { ok: true, inParagraph: false, paragraph };
  }
  return { ok: false, reason: `quote not found verbatim in "${id}" or the block quotations after it` };
}

/** The printed page a paragraph starts on, from the renderer's `data-page`. */
export function pageOf(html: string, id: string): number | null {
  const match = html.match(new RegExp(`<p id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*data-page="(\\d+)"`));
  return match ? Number(match[1]) : null;
}

/**
 * A link into the report. With a quote from the paragraph itself, `?h=`
 * names the exact words, so the reader lands on them highlighted rather than
 * on a paragraph that may run to a page.
 */
export function citationHref(reportId: string, id: string, paragraph?: string, quote?: string): string {
  let anchor: string | null = null;
  if (paragraph && quote) {
    const text = comparable(paragraph);
    const found = findText(text, comparable(quote));
    if (found) anchor = encodeAnchor(selectorFor(text, found.start, found.end));
  }
  const base = `/reports/${reportId}?p=${encodeURIComponent(id)}`;
  // Exactly as share.js builds it: the anchor is already percent-encoded.
  return anchor ? `${base}&h=${anchor}` : base;
}

/**
 * Checks one report's source against its rendered body and resolves every
 * reference. Returns the problems rather than throwing, so one run reports
 * all of them.
 */
export function resolveEditorial(
  source: EditorialSource,
  html: string,
  structure: ReportStructure,
  /** Required for a file with a hero; `scripts/editorial.mjs` reads it off assets/heroes/. */
  assetSize?: AssetSize
): { editorial: Editorial; highlights: ResolvedHighlight[]; problems: string[] } {
  const problems: string[] = [];
  const at = (where: string, reason: string) => problems.push(`${source.report}: ${where}: ${reason}`);

  if (source.status !== "draft" && source.status !== "approved") at("status", `must be draft or approved, not "${source.status}"`);
  if (!source.why_it_matters?.trim()) at("why_it_matters", "missing");

  const cite = (id: string): Citation => ({ id, page: pageOf(html, id), href: citationHref(source.report, id) });

  const quotation = (where: string, q: QuoteSource): Quotation => {
    const placed = placeQuote(html, q.paragraph, q.quote);
    if (!placed.ok) at(where, placed.reason);
    const href =
      placed.ok && placed.inParagraph
        ? citationHref(source.report, q.paragraph, placed.paragraph, q.quote)
        : citationHref(source.report, q.paragraph);
    return { quote: q.quote.trim(), cite: { id: q.paragraph, page: pageOf(html, q.paragraph), href } };
  };

  const background = (source.background ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const findings = (source.findings ?? []).map((finding, i) => {
    if (!finding.cites?.length) at(`findings[${i}]`, "cites nothing; every finding must point into the report");
    for (const id of finding.cites ?? []) {
      if (extractParagraph(html, id) === null) at(`findings[${i}]`, `no paragraph "${id}"`);
    }
    return {
      text: finding.text,
      cites: (finding.cites ?? []).map(cite),
      ...(finding.excerpt ? { excerpt: quotation(`findings[${i}].excerpt`, finding.excerpt) } : {}),
    };
  });

  const readingGuide = (source.reading_guide ?? []).map((item, i) => {
    const section = structure.sections.find((s) => s.slug === item.section);
    if (!section) at(`reading_guide[${i}]`, `no section "${item.section}"`);
    if (item.excerpt && structure.paragraphToSection[item.excerpt.paragraph] !== item.section) {
      at(`reading_guide[${i}].excerpt`, `paragraph "${item.excerpt.paragraph}" is not in section "${item.section}"`);
    }
    return {
      slug: item.section,
      title: item.title ?? section?.title ?? item.section,
      page: section?.page ?? null,
      why: item.why,
      ...(item.excerpt ? { excerpt: quotation(`reading_guide[${i}].excerpt`, item.excerpt) } : {}),
    };
  });

  const highlights: ResolvedHighlight[] = [];
  (source.highlights ?? []).forEach((h, i) => {
    const placed = placeQuote(html, h.paragraph, h.quote);
    if (!placed.ok) return at(`highlights[${i}]`, placed.reason);
    // A highlight marks words in a paragraph, so it has to be *in* one: a
    // block quotation has no id to hang the mark on yet (reportsthatmatter-dam).
    if (!placed.inParagraph) return at(`highlights[${i}]`, "quote is in a block quotation, which cannot be marked yet");
    const text = comparable(placed.paragraph);
    const found = findText(text, comparable(h.quote))!; // placeQuote found it in this paragraph
    const selector = selectorFor(text, found.start, found.end);
    highlights.push({
      report: source.report,
      section: structure.paragraphToSection[h.paragraph] ?? "",
      paragraph: h.paragraph,
      exact: selector.exact,
      prefix: selector.prefix,
      suffix: selector.suffix,
      page: pageOf(html, h.paragraph),
    });
  });

  const hero = source.hero ? resolveHero(source.hero, (reason) => at("hero", reason), assetSize) : undefined;

  return {
    editorial: {
      status: source.status,
      whyItMatters: source.why_it_matters?.trim() ?? "",
      background,
      findings,
      readingGuide,
      ...(hero ? { hero } : {}),
    },
    highlights,
    problems,
  };
}

const HERO_SRC = /^\/assets\/heroes\/[a-z0-9-]+\.webp$/;
const FOCUS = /^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/;

/**
 * Checks a hero and resolves its files' sizes. Alt text and a credit are
 * required, the credit must link to a source, and both widths must exist on
 * disk: a hero whose file is missing would ship a broken band at the top of
 * the page.
 */
function resolveHero(hero: HeroSource, problem: (reason: string) => void, assetSize?: AssetSize): Hero | undefined {
  let ok = true;
  const fail = (reason: string) => { ok = false; problem(reason); };

  if (!hero.alt?.trim()) fail("alt is required: describe what the photograph shows");
  if (!hero.credit?.trim()) fail("credit is required");
  if (!/^https?:\/\//.test(hero.source ?? "")) fail("source must be the photograph's http(s) page");
  if (hero.focus !== undefined && !FOCUS.test(hero.focus)) fail(`focus must be "x% y%", not "${hero.focus}"`);
  if (!HERO_SRC.test(hero.src ?? "")) {
    fail(`src must be /assets/heroes/<name>.webp, not "${hero.src}"`);
    return undefined;
  }
  const smallSrc = hero.src.replace(/\.webp$/, "-1200.webp");
  if (!assetSize) {
    fail("cannot check the hero files: no asset lookup given");
    return undefined;
  }
  const large = assetSize(hero.src);
  const small = assetSize(smallSrc);
  if (!large) fail(`no file for ${hero.src}; run pnpm heroes`);
  if (!small) fail(`no file for ${smallSrc}; run pnpm heroes`);
  if (!ok || !large || !small) return undefined;

  return {
    src: hero.src,
    width: large.width,
    height: large.height,
    small: { src: smallSrc, width: small.width },
    credit: hero.credit.trim(),
    source: hero.source,
    alt: hero.alt.trim(),
    focus: hero.focus ?? "50% 50%",
  };
}
