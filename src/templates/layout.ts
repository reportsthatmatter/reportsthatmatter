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
  { label: "About", href: "/about" },
];

type LayoutOptions = {
  navLinks?: NavLink[];
  description?: string;
  scripts?: string[];
  /** Absolute or root-relative share image. */
  image?: string;
  /** JSON-LD, already serialised. */
  structuredData?: string;
};

export function renderLayout(
  title: string,
  body: string,
  options: LayoutOptions = {}
): string {
  const {
    navLinks = DEFAULT_NAV,
    description = "Reports that Matter turns hard-to-access public reports into searchable, readable, linkable web pages.",
    scripts = [],
    image,
    structuredData,
  } = options;

  const nav = navLinks.length
    ? `<nav class="site-nav mono">${navLinks
        .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
        .join("")}</nav>`
    : "";

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
</head>
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
  <p>A public-interest project making official reports readable, linkable, and citable on the web.</p>
  <nav>
    <a href="/reports">Reports</a>
    <a href="/about">About</a>
    <a href="/changelog">Changelog</a>
  </nav>
</footer>
${scripts.map((src) => `<script src="${escapeHtml(src)}" defer></script>`).join("\n")}
</body>
</html>`;
}
