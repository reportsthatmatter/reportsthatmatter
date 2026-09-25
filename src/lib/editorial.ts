/**
 * Our own layer on a report (reportsthatmatter-g0w): why it matters, what it
 * found, and passages worth reading — written by us, shown labelled as ours.
 *
 * Source is `editorial/<report-id>.yaml`. `scripts/editorial.mjs` checks every
 * quote against the pre-rendered report and writes the resolved result to
 * `src/generated/editorial.ts`, which is all the Worker ever reads. The check
 * is the point: a quote we attribute to a report that is not in it is the one
 * mistake this project cannot afford, so it fails the build rather than
 * shipping.
 */
import { extractParagraph } from "../templates/report";
import { encodeAnchor, normalise, selectorFor } from "../../assets/anchor.js";

/** As written in `editorial/<report-id>.yaml`. */
export type EditorialSource = {
  report: string;
  status: "draft" | "approved";
  why_it_matters: string;
  findings: Array<{ text: string; cites: string[] }>;
  excerpts: Array<{
    paragraph: string;
    quote: string;
    context?: string;
    card?: boolean;
    pick?: boolean;
  }>;
};

/** A paragraph a finding or passage links to, resolved at build time. */
export type Citation = { id: string; page: number | null; href: string };

/** What the Worker renders: the source, with every reference checked and resolved. */
export type Editorial = {
  status: "draft" | "approved";
  whyItMatters: string;
  findings: Array<{ text: string; cites: Citation[] }>;
  excerpts: Array<{
    quote: string;
    context?: string;
    card: boolean;
    pick: boolean;
    cite: Citation;
  }>;
};

/**
 * The comparison form of a quote or a paragraph. Whitespace and soft hyphens
 * are the only differences forgiven: a PDF breaks lines where the page ended,
 * not where the words did. Anything else — a corrected OCR slip, a smartened
 * quote mark — is a different quote and must fail.
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
  if (comparable(paragraph).includes(wanted)) return { ok: true, inParagraph: true, paragraph };
  if (comparable(followingUnlabelled(html, id)).includes(wanted)) {
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
    const start = text.indexOf(comparable(quote));
    if (start !== -1) anchor = encodeAnchor(selectorFor(text, start, start + comparable(quote).length));
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
  html: string
): { editorial: Editorial; problems: string[] } {
  const problems: string[] = [];
  const at = (where: string, reason: string) => problems.push(`${source.report}: ${where}: ${reason}`);

  if (source.status !== "draft" && source.status !== "approved") at("status", `must be draft or approved, not "${source.status}"`);
  if (!source.why_it_matters?.trim()) at("why_it_matters", "missing");

  const cite = (id: string): Citation => ({ id, page: pageOf(html, id), href: citationHref(source.report, id) });

  const findings = (source.findings ?? []).map((finding, i) => {
    if (!finding.cites?.length) at(`findings[${i}]`, "cites nothing; every finding must point into the report");
    for (const id of finding.cites ?? []) {
      if (extractParagraph(html, id) === null) at(`findings[${i}]`, `no paragraph "${id}"`);
    }
    return { text: finding.text, cites: (finding.cites ?? []).map(cite) };
  });

  const excerpts = (source.excerpts ?? []).map((excerpt, i) => {
    const placed = placeQuote(html, excerpt.paragraph, excerpt.quote);
    if (!placed.ok) at(`excerpts[${i}]`, placed.reason);
    const href =
      placed.ok && placed.inParagraph
        ? citationHref(source.report, excerpt.paragraph, placed.paragraph, excerpt.quote)
        : citationHref(source.report, excerpt.paragraph);
    return {
      quote: excerpt.quote,
      ...(excerpt.context ? { context: excerpt.context } : {}),
      card: Boolean(excerpt.card),
      pick: Boolean(excerpt.pick),
      cite: { id: excerpt.paragraph, page: pageOf(html, excerpt.paragraph), href },
    };
  });

  return {
    editorial: { status: source.status, whyItMatters: source.why_it_matters?.trim() ?? "", findings, excerpts },
    problems,
  };
}
