import { escapeHtml } from "./layout";

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

/** Social platforms will not follow a relative og:image. */
export const SITE_ORIGIN = "https://reportsthatmatter.org";

/** Cards are keyed by report and paragraph, mirroring the share URL. */
export function cardPath(reportId: string, paragraphId: string): string {
  return `${SITE_ORIGIN}/assets/cards/${reportId}/${paragraphId}.png`;
}
