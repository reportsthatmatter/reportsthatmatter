/**
 * Constants that have to agree across modules which otherwise shouldn't
 * import from each other — `card.ts` needs `escapeHtml` from `layout.ts`, so
 * `layout.ts` can't import back from `card.ts` without a cycle. This is the
 * shared leaf both sides import instead.
 */

/** Social platforms (and JSON-LD consumers) will not follow a relative URL. */
export const SITE_ORIGIN = "https://reportsthatmatter.org";

/**
 * Root-relative path to the site-wide default share image — what
 * `renderHead` falls back to when a page has nothing more specific. See
 * `reportsthatmatter-obw`: before this, most pages had no og:image at all.
 */
export const SITE_CARD_PATH = "/assets/cards/site.png";

/**
 * The homepage's own headline and standfirst (`index.ts`), reused verbatim
 * by `scripts/cards.mjs` for the site's default share card — one wording,
 * not two that can drift apart.
 */
export const SITE_HEADLINE = "Reports that shaped history are still trapped in PDFs.";
export const SITE_STANDFIRST =
  "Official inquiries publish the evidence that anchors public understanding — then bury it in scanned documents on decaying websites. We rebuild them as web pages you can read, search, and cite by passage.";
