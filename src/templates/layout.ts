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
};

type LayoutOptions = HeadOptions & {
  navLinks?: NavLink[];
  scripts?: string[];
};

/** Marks the end of what `renderHead` produces — see `replaceHead`. */
export const HEAD_END = "</head>";

/**
 * A page's `<!doctype>` through `</head>`.
 *
 * Split out from `renderLayout` because a `?p=`/`?h=` request serves the
 * *pre-rendered* page with only its preview metadata changed (#115, and the
 * content-publishing plan §8 step 1): the body is byte-identical to the
 * static file, so the dynamic path swaps this prefix rather than re-rendering
 * a multi-megabyte report. Keeping one implementation is what stops the
 * shared-link head and the static head drifting apart.
 */
export function renderHead(title: string, options: HeadOptions = {}): string {
  const { description = DEFAULT_DESCRIPTION, image, structuredData } = options;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
${image ? `<meta property="og:image" content="${escapeHtml(image)}" />\n<meta name="twitter:image" content="${escapeHtml(image)}" />` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=IBM+Plex+Mono:wght@400&family=Inter:wght@400;500&display=swap" rel="stylesheet" />
<link rel="icon" href="/assets/brand/logo-32.png" sizes="32x32" type="image/png" />
<link rel="icon" href="/assets/brand/logo-64.png" sizes="64x64" type="image/png" />
<link rel="apple-touch-icon" href="/assets/brand/logo-180.png" />
<link rel="stylesheet" href="/assets/styles.css" />
${structuredData ? `<script type="application/ld+json">${structuredData}</script>` : ""}
${HEAD_END}`;
}

/**
 * Swaps a pre-rendered page's head for one carrying a shared passage's
 * preview, leaving the body untouched.
 *
 * Returns the page unchanged if it has no `</head>` — a page that is not
 * shaped like one of ours is better served as-is than truncated.
 */
export function replaceHead(page: string, head: string): string {
  const end = page.indexOf(HEAD_END);
  return end === -1 ? page : head + page.slice(end + HEAD_END.length);
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
    <img src="/assets/brand/logo-64.png" alt="" width="30" height="30" />
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
