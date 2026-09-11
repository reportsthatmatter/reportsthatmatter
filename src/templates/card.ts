import { escapeHtml } from "./layout";
import { SITE_ORIGIN } from "./site";

export type CardInput = {
  quote: string;
  reportTitle: string;
  attribution?: string;
  /** Printed page in the source document, if known. */
  page?: string;
  /** The seal, inlined — the renderer has no server to fetch it from. */
  logoDataUri?: string;
};

/**
 * The share card: a quote, set to be read at thumbnail size in a feed.
 *
 * Same design language as the site — off-white, mid-grey ink, serif for the
 * words and mono for everything structural — so a card and the page it links to
 * are recognisably the same object.
 *
 * Rendered to PNG at build time by scripts/cards.mjs. Feeds will not display
 * SVG, and a runtime rasteriser would cost more bundle than the whole site.
 */
export function renderCard(input: CardInput): string {
  const quote = input.quote.trim();

  // One card, one measure: long quotes get smaller type rather than a
  // scrollbar, because a card has exactly one screenful and no more.
  const size =
    quote.length > 320 ? 34 : quote.length > 220 ? 40 : quote.length > 130 ? 48 : 56;

  // Page first: a long report title would otherwise push the citation out of
  // the line, and the page is the more useful half of it.
  const footer = [input.page ? `p. ${input.page}` : "", input.reportTitle]
    .filter(Boolean)
    .join("  ·  ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: #f7f7f7;
    color: #252525;
    padding: 64px 72px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-family: "IBM Plex Mono", monospace;
  }
  .mark {
    font-family: "EB Garamond", serif;
    font-size: 25px;
    letter-spacing: 0.01em;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .mark img { width: 34px; height: 34px; }
  blockquote {
    font-family: "EB Garamond", serif;
    font-size: ${size}px;
    line-height: 1.24;
    letter-spacing: -0.01em;
    max-width: 22ch;
    flex: 1;
    display: flex;
    align-items: center;
    max-width: 100%;
  }
  footer {
    font-size: 17px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #8a8a8c;
    border-top: 1px solid #e0e0e0;
    padding-top: 22px;
    display: flex;
    justify-content: space-between;
    gap: 32px;
  }
  footer .src { color: #575657; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  footer .site { flex: none; }
</style>
</head>
<body>
  <div class="mark"><img src="${input.logoDataUri ?? ""}" alt="" />Reports that Matter</div>
  <blockquote>${escapeHtml(wrapInQuotes(quote))}</blockquote>
  <footer>
    <span class="src">${escapeHtml(footer)}</span>
    <span class="site">reportsthatmatter.org</span>
  </footer>
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
  logoDataUri?: string;
};

/**
 * The default share card: a title and a subtitle, no quote. What a page gets
 * when it has nothing more specific to show — a report's contents page, an
 * uncurated paragraph, the homepage itself (reportsthatmatter-obw: before
 * this, those pages had no og:image at all).
 *
 * Same design language and layout skeleton as `renderCard` — the mark top
 * left, a footer rule at the bottom — with a headline in the middle instead
 * of a blockquote, so a default card still reads as the same object as a
 * quote card, just without a passage to show yet.
 *
 * Rendered to PNG at build time by scripts/cards.mjs, same as renderCard.
 */
export function renderDefaultCard(input: DefaultCardInput): string {
  const title = input.title.trim();

  // Same three-tier scale as renderCard, tuned for a headline rather than a
  // quote: report titles run short ("Reports Split into Sections" territory
  // isn't the concern here so much as things like Leveson's full title).
  const size = title.length > 90 ? 44 : title.length > 55 ? 52 : 64;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: #f7f7f7;
    color: #252525;
    padding: 64px 72px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-family: "IBM Plex Mono", monospace;
  }
  .mark {
    font-family: "EB Garamond", serif;
    font-size: 25px;
    letter-spacing: 0.01em;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .mark img { width: 34px; height: 34px; }
  .titleblock {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 24px;
  }
  h1 {
    font-family: "EB Garamond", serif;
    font-weight: 500;
    font-size: ${size}px;
    line-height: 1.12;
    letter-spacing: -0.01em;
    max-width: 30ch;
  }
  .subtitle {
    font-size: 22px;
    line-height: 1.55;
    color: #575657;
    max-width: 40ch;
  }
  footer {
    font-size: 17px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #8a8a8c;
    border-top: 1px solid #e0e0e0;
    padding-top: 22px;
    text-align: right;
  }
</style>
</head>
<body>
  <div class="mark"><img src="${input.logoDataUri ?? ""}" alt="" />Reports that Matter</div>
  <div class="titleblock">
    <h1>${escapeHtml(title)}</h1>
    ${input.subtitle ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>` : ""}
  </div>
  <footer>reportsthatmatter.org</footer>
</body>
</html>`;
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
