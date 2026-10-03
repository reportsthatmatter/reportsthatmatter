import { SITE_ORIGIN, SITE_CARD_PATH } from "./site";

export type NavLink = { label: string; href: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEFAULT_NAV: NavLink[] = [
  { label: "Reports", href: "/reports" },
  { label: "Search", href: "/search" },
  { label: "Highlights", href: "/highlights" },
  { label: "About", href: "/about" },
  { label: "Press", href: "/press" },
  { label: "Changelog", href: "/changelog" },
];

export const DEFAULT_DESCRIPTION =
  "Reports that Matter turns hard-to-access public reports into searchable, readable, linkable web pages.";

/** Everything in a page's `<head>` that varies between pages. */
export type HeadOptions = {
  description?: string;
  /** Absolute or root-relative share image. */
  image?: string;
  /** JSON-LD, already serialised. */
  structuredData?: string;
  /** Keep the page out of search results — a preview of unapproved content. */
  noindex?: boolean;
  /** `og:type`; defaults to "website". Blog posts pass "article". */
  ogType?: string;
  /** Absolute URL: emitted as `og:url`, and as `<link rel="canonical">` unless `canonical` is given. */
  url?: string;
  /** Absolute canonical URL when it differs from `og:url`: a shared `?p=`/`?h=` link previews as itself but ranks as its page. */
  canonical?: string;
  /** Words for the share image (`og:image:alt`, `twitter:image:alt`). */
  imageAlt?: string;
  /** ISO date: emitted as `article:published_time`. */
  publishedTime?: string;
  /** An Atom feed to advertise in the head: `{ href, title }`. */
  feed?: { href: string; title: string };
  /** Further `<meta name content>` tags, such as the Highwire `citation_*` set. */
  extraMeta?: Array<{ name: string; content: string }>;
};

type LayoutOptions = HeadOptions & {
  navLinks?: NavLink[];
  scripts?: string[];
};

/**
 * A page's `<!doctype>` through `</head>`.
 *
 * Split out from `renderLayout` so that a page's head has exactly one
 * implementation, whoever assembles the page around it.
 */
export function renderHead(title: string, options: HeadOptions = {}): string {
  // Every page gets a real og:image, not just the ones that pass one in —
  // reportsthatmatter-obw. A page with something more specific (a report's
  // own card, a curated quote) passes it; this is the floor everything else
  // lands on, rather than a bare-text preview.
  const { description = DEFAULT_DESCRIPTION, image = `${SITE_ORIGIN}${SITE_CARD_PATH}`, imageAlt, structuredData, noindex, ogType = "website", url, publishedTime, feed } = options;
  const canonical = options.canonical ?? url;

  const extraMeta = (options.extraMeta ?? [])
    .map((tag) => `<meta name="${escapeHtml(tag.name)}" content="${escapeHtml(tag.content)}" />\n`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
${noindex ? `<meta name="robots" content="noindex" />\n` : ""}<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:type" content="${escapeHtml(ogType)}" />
<meta property="og:site_name" content="Reports that Matter" />
${url ? `<meta property="og:url" content="${escapeHtml(url)}" />\n` : ""}${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />\n` : ""}${publishedTime ? `<meta property="article:published_time" content="${escapeHtml(publishedTime)}" />\n` : ""}${feed ? `<link rel="alternate" type="application/atom+xml" href="${escapeHtml(feed.href)}" title="${escapeHtml(feed.title)}" />\n` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
${image ? `<meta property="og:image" content="${escapeHtml(image)}" />\n<meta name="twitter:image" content="${escapeHtml(image)}" />\n` : ""}${
    // Every card is rendered at 2400×1260 (scripts/cards.mjs): stating it lets
    // Facebook and LinkedIn show the image on the very first share, before they
    // have fetched it.
    image?.includes("/assets/cards/") ? `<meta property="og:image:width" content="2400" />\n<meta property="og:image:height" content="1260" />\n` : ""
  }${image && imageAlt ? `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />\n<meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />` : ""}
${extraMeta}<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=IBM+Plex+Mono:wght@400&family=Inter:wght@400;500&display=swap" rel="stylesheet" />
<link rel="icon" href="/assets/brand/pilcrow-32.png" sizes="32x32" type="image/png" />
<link rel="icon" href="/assets/brand/pilcrow-64.png" sizes="64x64" type="image/png" />
<link rel="apple-touch-icon" href="/assets/brand/pilcrow-180.png" />
<link rel="stylesheet" href="/assets/styles.css" />
${structuredData ? `<script type="application/ld+json">${structuredData}</script>` : ""}
</head>`;
}

export function renderLayout(
  title: string,
  body: string,
  options: LayoutOptions = {}
): string {
  const { navLinks = DEFAULT_NAV, scripts = [], ...head } = options;

  const nav = navLinks.length
    ? `<nav class="site-nav mono">${navLinks
        .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
        .join("")}</nav>`
    : "";

  return `${renderHead(title, head)}
<body>
<header class="site-header wrap">
  <a class="wordmark" href="/">
    <svg class="wordmark-icon" viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="47" stroke="currentColor" stroke-width="4.5" />
      <circle cx="50" cy="50" r="39" stroke="currentColor" stroke-width="2.5" />
      <text x="49.65" y="60.41" fill="currentColor" font-family="EB Garamond, Times New Roman, serif" font-size="58" text-anchor="middle">&#182;</text>
    </svg>
    <span>Reports that Matter</span>
  </a>
  ${nav}
</header>
${body}
<footer class="site-footer wrap mono">
  <div class="site-footer-top">
    <p>A public-interest project making official reports readable, linkable, and citable on the web.</p>
    <nav>
      <a href="/reports">Reports</a>
      <a href="/search">Search</a>
      <a href="/highlights">Highlights</a>
      <a href="/about">About</a>
      <a href="/press">Press</a>
      <a href="/blog">Blog</a>
      <a href="/changelog">Changelog</a>
    </nav>
  </div>
  <p class="site-footer-credit">A sensemaking project built with ❤️ by <a href="https://rufuspollock.com">Rufus Pollock</a> and <a href="https://datopian.com">Datopian</a> since 2015.</p>
</footer>
${scripts
  // Modules, so that the browser and the Worker can import one shared anchor
  // implementation instead of keeping two in step by hand. `type="module"`
  // defers by itself.
  .map((src) => `<script type="module" src="${escapeHtml(src)}"></script>`)
  .join("\n")}
</body>
</html>`;
}
