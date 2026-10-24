import { escapeHtml } from "./layout";
import { SITE_ORIGIN } from "./site";

export type CardInput = {
  quote: string;
  reportTitle: string;
  /** The report's short name (the registry's `common_name`), for the footer; falls back to `reportTitle`. */
  sourceName?: string;
  attribution?: string;
  /** Printed page in the source document, if known. */
  page?: string;
  /** The report's plate (#99), inlined — the renderer has no server to
   * fetch it from. It fills the card's left panel. */
  markDataUri?: string;
};

/**
 * Type size for a quote of this many characters in the text panel: a card has one screenful and no more, and a feed
 * shows it about 500px wide, so the floor is as high as the longest card quote allows (Fable review, share-cards-1024).
 */
export function quoteSize(length: number): number {
  return length > 300 ? 34 : length > 230 ? 38 : length > 175 ? 42 : length > 120 ? 48 : length > 70 ? 56 : 64;
}

/** A report's name as a card footer prints it: the short name without its parenthetical ("Challenger Accident Report"). */
export function cardSourceName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name.trim();
}

/**
 * The share card: the report's plate in the left panel, the quote in the right
 * (share-cards-1024; Rufus: "posts with images in them are really crucial", and
 * a standard image per report taking half the preview with the words in the
 * other half).
 *
 * The image is the plate, not the hero photograph: a plate is drawn from the
 * report's own evidence, so it travels with the report's own rights and needs
 * no credit line, and it is an exhibit rather than the event, which keeps every
 * card inside the strategy's rule for reports about deaths (no images of the
 * place). Reports in PLATELESS_CARD_REPORTS get a typographic panel instead:
 * the pilcrow and the page.
 *
 * Same design language as the site — off-white, mid-grey ink, serif for the
 * words and mono for everything structural. Rendered to PNG at build time by
 * scripts/cards.mjs. Feeds will not display SVG.
 */
export function renderCard(input: CardInput): string {
  const quote = input.quote.trim();
  const source = cardSourceName(input.sourceName ?? input.reportTitle);
  return splitCard({
    markDataUri: input.markDataUri,
    page: input.page,
    body: `<blockquote style="font-size: ${quoteSize(quote.length)}px">${escapeHtml(wrapInQuotes(quote))}</blockquote>`,
    footer: `${input.page ? `p. ${escapeHtml(input.page)} · ` : ""}${escapeHtml(source)}`,
  });
}

/** The two-panel frame every card shares: plate (or pilcrow) left, wordmark, body and footer right. */
function splitCard(parts: { markDataUri?: string; page?: string; body: string; footer: string }): string {
  const panel = parts.markDataUri
    ? `<div class="imprint"><img src="${parts.markDataUri}" alt="" /></div>`
    : `<div class="imprint bare"><span class="pilcrow">¶</span>${parts.page ? `<span class="pg">p. ${escapeHtml(parts.page)}</span>` : ""}</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body { display: flex; background: #f7f7f7; color: #252525; font-family: "IBM Plex Mono", monospace; border: 2px solid #d4d4d2; }
  .imprint { width: 520px; flex: none; background: #e6e6e4; border-right: 1px solid #d4d4d2; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; }
  .imprint img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .imprint.bare { gap: 36px; }
  .imprint .pilcrow { font-family: "EB Garamond", serif; font-size: 220px; line-height: 1.15; color: #b9b9b7; }
  .imprint .pg { font-size: 30px; letter-spacing: 0.08em; text-transform: uppercase; color: #8a8a8c; }
  .top { display: flex; justify-content: space-between; align-items: baseline; gap: 20px; }
  .top .site { font-size: 15px; letter-spacing: 0.07em; text-transform: uppercase; color: #8a8a8c; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 44px 52px 38px 48px; }
  .mark { font-family: "EB Garamond", serif; font-size: 29px; letter-spacing: 0.01em; }
  blockquote, .titleblock {
    font-family: "EB Garamond", serif;
    line-height: 1.17;
    letter-spacing: -0.01em;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 14px 0;
    text-wrap: pretty;
  }
  .titleblock { gap: 22px; }
  h1 { font-weight: 500; line-height: 1.1; }
  .subtitle { font-family: "IBM Plex Mono", monospace; font-size: 18px; line-height: 1.55; color: #575657; letter-spacing: 0; }
  footer {
    font-size: 16px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #575657;
    border-top: 1px solid #d9d9d9;
    padding-top: 16px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
</head>
<body>
  ${panel}
  <div class="text">
    <div class="top"><span class="mark">Reports that Matter</span><span class="site">reportsthatmatter.org</span></div>
    ${parts.body}
    ${parts.footer ? `<footer>${parts.footer}</footer>` : ""}
  </div>
</body>
</html>`;
}

/**
 * Adds quotation marks unless the passage already ends in one — a verbatim
 * excerpt that closes on a quoted phrase would otherwise render `?"”`.
 */
export function wrapInQuotes(text: string): string {
  if (/["“”']$/.test(text)) return text;
  return `“${text}”`;
}

export type DefaultCardInput = {
  /** The headline — a report's own title, or the site's. */
  title: string;
  /** A line under the title — a report's byline, or the site's tagline. */
  subtitle?: string;
  /** A report's plate, or the brand mark for the site's own card. */
  markDataUri?: string;
  /** Left of the footer rule, e.g. the report's short name. */
  footer?: string;
};

/**
 * The default share card: a title and a subtitle, no quote. What a page gets
 * when it has nothing more specific to show — a report's contents page, an
 * uncurated paragraph, the homepage itself (reportsthatmatter-obw: before
 * this, those pages had no og:image at all).
 *
 * The same two-panel frame as `renderCard` (plate left, wordmark, footer rule)
 * with the report's title where the quote would be, so a default card reads as
 * the same object as a quote card, just without a passage to show yet.
 *
 * Rendered to PNG at build time by scripts/cards.mjs, same as renderCard.
 */
export function renderDefaultCard(input: DefaultCardInput): string {
  const title = input.title.trim();
  const size = title.length > 90 ? 40 : title.length > 55 ? 48 : 58;
  return splitCard({
    markDataUri: input.markDataUri,
    body: `<div class="titleblock"><h1 style="font-size: ${size}px">${escapeHtml(title)}</h1>${input.subtitle ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>` : ""}</div>`,
    footer: input.footer ? escapeHtml(input.footer) : "",
  });
}

/** Cards are keyed by report and paragraph, mirroring the share URL. */
export function cardPath(reportId: string, paragraphId: string): string {
  return `${SITE_ORIGIN}/assets/cards/${reportId}/${paragraphId}.png`;
}

/** A report's own default card — used whenever it has no curated quote for
 * the paragraph a link points at. */
export function defaultCardPath(reportId: string): string {
  return `${SITE_ORIGIN}/assets/cards/${reportId}/default.png`;
}

export { SITE_ORIGIN };
