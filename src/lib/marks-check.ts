/**
 * Replaying what readers and we have anchored to a report's text against a candidate text
 * (reportsthatmatter-p4h6, from the qgf7 retro: a source swap that would have orphaned a real reader mark
 * passed every other check).
 *
 * Three things hold words of a report by reference, and a re-ingest can strand any of them while every
 * paragraph id still resolves:
 *   - stored marks (D1 `marks`): a paragraph id plus a quote selector, shown by `assets/social-proof.js`,
 *   - `?p=`/`?h=` links already posted or queued (`marketing/queue.yaml`), opened by `assets/highlight.js`,
 *   - editorial quotations and citations (`editorial/<id>.yaml`), which `pnpm editorial` checks at build time.
 *
 * This module is the pure half: it takes a `ReportText` (a report's rendered body and alias tables) and says,
 * per reference, whether it still anchors. It uses the same functions as the product (`locate`, `placeQuote`,
 * `followAlias`), never a second matcher, so the answer is the page's answer. `scripts/marks-check.mjs` reads
 * the inputs and prints.
 */
import { decodeAnchor, fold, foldText, locate, type Selector } from "../../assets/anchor.js";
import { extractParagraph } from "../templates/report";
import { followAlias } from "./aliases";
import { placeQuote, type EditorialSource } from "./editorial";

/** One report's candidate text: the layout-free body `pnpm prerender` writes, and its meta.json alias fields. */
export type ReportText = {
  /** `full-body.html`. */
  html: string;
  paragraphToSection: Record<string, string>;
  paragraphAliases?: Record<string, string>;
  sectionAliases?: Record<string, string>;
  sections?: Array<{ slug: string }>;
};

/**
 * - ok: still anchors where it was made.
 * - weaker: anchors in the right paragraph, but only by its words and not their context (the neighbours moved).
 * - aliased: the paragraph id has moved; a `?p=` link redirects and finds the words, and `/marks` maps a stored
 *   mark's id through the same aliases (`markCounts`, j53o), so it still renders. An editorial reference is keyed
 *   by the id and does not follow, so it fails.
 * - elsewhere: the words are in the report, in a different paragraph. A link falls back to the whole page and
 *   finds them; a stored mark does not.
 * - text-gone: the paragraph is there and the words are not.
 * - paragraph-gone: neither the id nor an alias of it, and the words are not found anywhere.
 */
export type Status = "ok" | "weaker" | "aliased" | "elsewhere" | "text-gone" | "paragraph-gone";

export type Kind = "mark" | "link" | "editorial";

export type Verdict = {
  kind: Kind;
  report: string;
  /** Where the reference came from: a mark's row key, a queue item id, an editorial path. */
  origin: string;
  paragraph: string;
  /** The words it names, trimmed for printing. */
  quote: string;
  status: Status;
  /** For `aliased` and `elsewhere`: the paragraph the words are in now. */
  now?: string;
  /** Readers behind a stored mark. */
  readers?: number;
  /** Does this stop the reference doing its job? Decided per kind, see `fails`. */
  fail: boolean;
  detail: string;
};

/** What a reference of each kind needs from the new text, which is not the same for the three. */
export function fails(kind: Kind, status: Status): boolean {
  if (status === "ok" || status === "weaker") return false;
  // A link survives a move: the Worker redirects an aliased id and highlight.js searches the page.
  if (kind === "link") return status !== "aliased" && status !== "elsewhere";
  // `/marks` maps a stored mark's id through the aliases (j53o), so a moved id is fine for a mark. A mark whose
  // words are in a different paragraph (`elsewhere`) has no alias to follow and renders nowhere.
  if (kind === "mark" && status === "aliased") return false;
  // An editorial reference is keyed by the id and does not follow an alias.
  return true;
}

const snippet = (text: string, n = 90) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** Paragraph ids and plain text, in document order; built once per report, only when something failed. */
function paragraphIndex(html: string): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = [];
  for (const m of html.matchAll(/<p id="([^"]+)"/g)) {
    const text = extractParagraph(html, m[1]);
    if (text) out.push({ id: m[1], text });
  }
  return out;
}

const indexCache = new WeakMap<ReportText, Array<{ id: string; text: string }>>();
function indexOf(text: ReportText) {
  let idx = indexCache.get(text);
  if (!idx) indexCache.set(text, (idx = paragraphIndex(text.html)));
  return idx;
}

/** The first paragraph (other than `except`) whose text holds the selector's words. */
export function findElsewhere(text: ReportText, selector: Selector, except?: string): string | null {
  const wanted = foldText(selector.exact).trim();
  if (wanted.includes("⋯")) {
    // A long passage named by its ends: locate() resolves it, so use it paragraph by paragraph.
    for (const p of indexOf(text)) if (p.id !== except && locate(p.text, selector)) return p.id;
    return null;
  }
  for (const p of indexOf(text)) {
    if (p.id === except) continue;
    if (fold(p.text).text.includes(wanted)) return p.id;
  }
  return null;
}

/**
 * Where a selector made in paragraph `paragraph` lands in the candidate text.
 * The shared core of a mark and a link; the callers differ only in what they do with the status.
 */
export function resolveAnchor(text: ReportText, paragraph: string, selector: Selector): { status: Status; now?: string } {
  const live = (id: string) => Object.hasOwn(text.paragraphToSection, id);
  let id = paragraph;
  let moved = false;
  if (!live(id)) {
    const target = text.paragraphAliases ? followAlias(text.paragraphAliases, id, live) : null;
    if (target) {
      id = target;
      moved = true;
    }
  }

  if (live(id)) {
    const body = extractParagraph(text.html, id);
    const found = body ? locate(body, selector) : null;
    if (found) {
      if (moved) return { status: "aliased", now: id };
      return { status: found.tier === "context" ? "ok" : "weaker" };
    }
  }

  const elsewhere = findElsewhere(text, selector, live(id) ? id : undefined);
  if (elsewhere) return { status: "elsewhere", now: elsewhere };
  return { status: live(id) ? "text-gone" : "paragraph-gone" };
}

const DETAIL: Record<Status, (v: { paragraph: string; now?: string }) => string> = {
  ok: () => "anchors",
  weaker: () => "anchors by its words only; the surrounding context changed",
  aliased: (v) => `paragraph id moved to ${v.now}`,
  elsewhere: (v) => `words are now in ${v.now}`,
  "text-gone": () => "paragraph exists, the quoted words are not in it",
  "paragraph-gone": () => "no such paragraph, no alias, and the words are not anywhere in the report",
};

function verdict(kind: Kind, report: string, origin: string, paragraph: string, quote: string, r: { status: Status; now?: string }, extra: Partial<Verdict> = {}): Verdict {
  let detail = DETAIL[r.status]({ paragraph, now: r.now });
  if (kind === "mark" && r.status === "aliased") {
    detail += "; /marks maps the stored id through the alias, so the mark still renders";
  }
  if (kind === "mark" && r.status === "elsewhere") {
    detail += "; the stored mark is looked up by its id and no alias leads to those words, so it renders nowhere";
  }
  return { kind, report, origin, paragraph, quote: snippet(quote), status: r.status, fail: fails(kind, r.status), detail, ...(r.now ? { now: r.now } : {}), ...extra };
}

/** A mark as exported from D1, one row per distinct passage (readers already counted). */
export type StoredMark = { report: string; section?: string; paragraph: string; exact: string; prefix: string; suffix: string; readers: number };

export function checkMark(text: ReportText, mark: StoredMark): Verdict {
  const selector: Selector = { prefix: mark.prefix, exact: mark.exact, suffix: mark.suffix };
  const origin = `${mark.paragraph}:${snippet(mark.exact, 24)}`;
  return verdict("mark", mark.report, origin, mark.paragraph, mark.exact, resolveAnchor(text, mark.paragraph, selector), { readers: mark.readers });
}

/** A queue item's link: `?p=<paragraph>&h=<anchor>`. A link without `h=` only needs its paragraph. */
export function checkLink(text: ReportText, report: string, itemId: string, link: string): Verdict | null {
  let url: URL;
  try {
    url = new URL(link, "https://reportsthatmatter.org");
  } catch {
    return null;
  }
  const paragraph = url.searchParams.get("p") ?? url.hash.slice(1);
  if (!paragraph) return null;
  const selector = decodeAnchor(url.searchParams.get("h"));
  if (!selector) {
    const live = Object.hasOwn(text.paragraphToSection, paragraph);
    const target = !live && text.paragraphAliases ? followAlias(text.paragraphAliases, paragraph, (x) => Object.hasOwn(text.paragraphToSection, x)) : null;
    const r: { status: Status; now?: string } = live ? { status: "ok" } : target ? { status: "aliased", now: target } : { status: "paragraph-gone" };
    return verdict("link", report, itemId, paragraph, "(paragraph link)", r);
  }
  return verdict("link", report, itemId, paragraph, selector.exact, resolveAnchor(text, paragraph, selector));
}

/** Every quotation and citation an editorial file makes, against the candidate text. */
export function checkEditorial(text: ReportText, source: EditorialSource): Verdict[] {
  const out: Verdict[] = [];
  const report = source.report;
  const state = source.status;
  const quote = (where: string, q: { paragraph: string; quote: string }) => {
    const placed = placeQuote(text.html, q.paragraph, q.quote);
    const origin = `editorial/${report}.yaml ${where} (${state})`;
    if (placed.ok) return out.push(verdict("editorial", report, origin, q.paragraph, q.quote, { status: "ok" }));
    const paragraphLive = extractParagraph(text.html, q.paragraph) !== null;
    const elsewhere = findElsewhere(text, { prefix: "", exact: q.quote.trim(), suffix: "" }, paragraphLive ? q.paragraph : undefined);
    const alias = text.paragraphAliases ? followAlias(text.paragraphAliases, q.paragraph, (x) => Object.hasOwn(text.paragraphToSection, x)) : null;
    const now = elsewhere ?? (!paragraphLive ? alias : null) ?? undefined;
    const status: Status = elsewhere ? "elsewhere" : paragraphLive ? "text-gone" : alias ? "aliased" : "paragraph-gone";
    out.push(verdict("editorial", report, origin, q.paragraph, q.quote, { status, ...(now ? { now } : {}) }));
  };
  const cite = (where: string, id: string) => {
    const origin = `editorial/${report}.yaml ${where} (${state})`;
    if (extractParagraph(text.html, id) !== null) return out.push(verdict("editorial", report, origin, id, "(citation)", { status: "ok" }));
    const alias = text.paragraphAliases ? followAlias(text.paragraphAliases, id, (x) => Object.hasOwn(text.paragraphToSection, x)) : null;
    out.push(verdict("editorial", report, origin, id, "(citation)", alias ? { status: "aliased", now: alias } : { status: "paragraph-gone" }));
  };

  (source.findings ?? []).forEach((f, i) => {
    (f.cites ?? []).forEach((id, j) => cite(`findings[${i}].cites[${j}]`, id));
    if (f.excerpt) quote(`findings[${i}].excerpt`, f.excerpt);
  });
  (source.reading_guide ?? []).forEach((g, i) => {
    const sections = text.sections ?? [];
    if (sections.length && !sections.some((s) => s.slug === g.section)) {
      const renamed = text.sectionAliases?.[g.section];
      out.push(verdict("editorial", report, `editorial/${report}.yaml reading_guide[${i}] (${state})`, g.section, "(section)", { status: renamed ? "aliased" : "paragraph-gone", ...(renamed ? { now: renamed } : {}) }));
    }
    if (g.excerpt) quote(`reading_guide[${i}].excerpt`, g.excerpt);
  });
  (source.highlights ?? []).forEach((h, i) => quote(`highlights[${i}]`, h));
  return out;
}

/** Regressions: references that anchored on the baseline text and no longer do on the candidate. */
export function regressions(baseline: Verdict[], candidate: Verdict[]): Verdict[] {
  const was = new Map(baseline.map((v) => [`${v.kind}\0${v.report}\0${v.origin}`, v]));
  return candidate.filter((v) => {
    if (!v.fail) return false;
    const before = was.get(`${v.kind}\0${v.report}\0${v.origin}`);
    return before !== undefined && !before.fail;
  });
}
