import { Hono } from "hono";
import { loadRegistry } from "./lib/registry";
import { renderMarkdown } from "./lib/markdown";
import { loadReportMarkdown, loadChangelog } from "./lib/source";
import { renderIndex, renderReportsIndex } from "./templates/index";
import { renderReport } from "./templates/report";
import { renderAbout } from "./templates/about";
import { renderNotFound } from "./templates/not-found";
import { renderChangelog } from "./templates/changelog";
import { renderReportOverview, renderSection } from "./templates/section";
import { splitSections, sectionFor } from "./lib/sections";

export type Bindings = {
  /** Cloudflare static-assets binding; absent under local Node/vitest. */
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  /** "bundled" reads reports from the worker bundle, otherwise from disk. */
  REPORTS_SOURCE?: string;
  /**
   * Where the pre-V2 site now lives — a full base URL, which may carry a path
   * prefix (GitHub Pages serves project sites under /<repo>/).
   */
  LEGACY_BASE?: string;
};

/**
 * Sections of the previous site. The domain has real traffic and years of
 * inbound links, so these must not become dead ends just because we replaced
 * what sits at the root.
 */
export const LEGACY_PATHS = [
  "/iraq-inquiry",
  "/enron-report",
  "/psi-financial-crisis",
  "/climate-action-us-senate-2014",
  "/new-inquiries",
  "/pages",
  "/search",
  "/feed.xml",
];

/**
 * Report ids that have changed. A citable URL is the product, so a renamed
 * report redirects rather than 404s — including within our own short history.
 */
export const RENAMED_REPORTS: Record<string, string> = {
  "us-senate-wall-street-and-financial-crisis": "us-psi-financial-crisis",
};

/** Joins the legacy base to a path, tolerating a trailing slash on the base. */
export function legacyUrl(base: string, pathAndQuery: string): string {
  return `${base.replace(/\/$/, "")}${pathAndQuery}`;
}

export function isLegacyPath(pathname: string): boolean {
  return LEGACY_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.text("ok"));

// Send the old site's URLs to wherever the old site now lives, before any
// route can claim them.
/**
 * Serves the archived pre-V2 site on old.reportsthatmatter.org.
 *
 * The record is proxied through Cloudflare, so GitHub cannot issue a
 * certificate for the host and its own custom-domain support is unusable.
 * A Workers route can claim a proxied hostname, though, so the Worker fetches
 * the archive from GitHub Pages and serves it under our own certificate. The
 * archive lives under /<repo>/ there, which the path prefix supplies.
 */
async function serveArchive(url: URL, request: Request, base: string): Promise<Response> {
  const upstream = new URL(legacyUrl(base, url.pathname + url.search));
  const response = await fetch(upstream, {
    method: "GET",
    headers: { accept: request.headers.get("accept") ?? "*/*" },
    redirect: "follow",
  });

  const headers = new Headers(response.headers);
  headers.delete("content-security-policy");
  // It is an archive; let it cache, but not so long that a fix cannot land.
  headers.set("cache-control", "public, max-age=3600");
  headers.set("x-rtm-archive", "pre-v2");

  return new Response(response.body, { status: response.status, headers });
}

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);

  if (url.hostname.startsWith("old.")) {
    const base = c.env?.LEGACY_BASE;
    if (!base) return c.text("Archive not configured", 503);
    return serveArchive(url, c.req.raw, base);
  }

  // One canonical host, so links and analytics do not split in two.
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
    return c.redirect(url.toString(), 301);
  }

  // The old site's URLs now live on their own subdomain.
  if (isLegacyPath(url.pathname)) {
    url.hostname = `old.${url.hostname}`;
    return c.redirect(url.toString(), 301);
  }

  await next();
});

app.get("/assets/*", async (c) => {
  if (c.env?.ASSETS) {
    const url = new URL(c.req.url);
    url.pathname = url.pathname.replace(/^\/assets/, "");
    return c.env.ASSETS.fetch(new Request(url, c.req.raw));
  }

  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const assetPath = c.req.path.replace(/^\/assets\//, "");
  const filePath = path.join(process.cwd(), "assets", assetPath);
  const contents = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const contentType = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  }[extension];

  return c.body(contents, 200, {
    "content-type": contentType ?? "application/octet-stream",
  });
});

app.get("/", async (c) => {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  const registry = await loadRegistry(sourceMode);
  return c.html(renderIndex(registry));
});

app.get("/reports", async (c) => {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  const registry = await loadRegistry(sourceMode);
  return c.html(renderReportsIndex(registry));
});

app.get("/about", (c) => c.html(renderAbout()));

/**
 * A sitemap listing every section of every report.
 *
 * These documents should be *the* search result for phrases they contain, and
 * a crawler will not find 80 section pages from a homepage that links two
 * reports. Sections rather than /full: a 300 KB page ranks worse than the
 * section that actually answers the query.
 */
app.get("/sitemap.xml", async (c) => {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  const registry = await loadRegistry(sourceMode);
  const origin = new URL(c.req.url).origin;

  const urls: Array<{ loc: string; priority: string }> = [
    { loc: "/", priority: "1.0" },
    { loc: "/reports", priority: "0.9" },
    { loc: "/about", priority: "0.7" },
    { loc: "/changelog", priority: "0.4" },
  ];

  for (const report of registry.reports) {
    urls.push({ loc: `/reports/${report.id}`, priority: "0.9" });
    const markdown = await loadReportMarkdown(report.source_path, sourceMode);
    for (const section of splitSections(renderMarkdown(markdown))) {
      urls.push({ loc: `/reports/${report.id}/${section.slug}`, priority: "0.8" });
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (entry) =>
      `  <url><loc>${origin}${entry.loc}</loc><priority>${entry.priority}</priority></url>`
  )
  .join("\n")}
</urlset>`;

  return c.body(body, 200, {
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, max-age=3600",
  });
});

app.get("/robots.txt", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.text(
    `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
    200,
    { "content-type": "text/plain; charset=utf-8" }
  );
});

app.get("/changelog", async (c) => {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  return c.html(renderChangelog(await loadChangelog(sourceMode)));
});

/** Loads a report and its rendered sections, or null if there is no such report. */
async function loadReport(c: any, reportId: string) {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  const registry = await loadRegistry(sourceMode);
  const report = registry.reports.find((entry: { id: string }) => entry.id === reportId);
  if (!report) return null;

  const markdown = await loadReportMarkdown(report.source_path, sourceMode);
  const html = renderMarkdown(markdown);
  return { report, html, sections: splitSections(html) };
}

app.get("/reports/:id", async (c) => {
  const reportId = c.req.param("id");
  const renamed = RENAMED_REPORTS[reportId];
  if (renamed) {
    const url = new URL(c.req.url);
    url.pathname = `/reports/${renamed}`;
    return c.redirect(url.toString(), 301);
  }

  const loaded = await loadReport(c, reportId);
  if (!loaded) return c.html(renderNotFound(false), 404);

  // A link naming a passage goes straight to the section holding it. This is
  // why share links carry ?p= as well as the fragment: the fragment never
  // reaches us, so without it a shared link could not be routed at all.
  const paragraph = c.req.query("p");
  if (paragraph) {
    const section = sectionFor(loaded.sections, paragraph);
    if (section) {
      // ?h= names the words within that paragraph and has to survive the hop,
      // or a shared quote arrives as a plain paragraph link.
      const quote = c.req.query("h");
      const anchor = quote ? `&h=${encodeURIComponent(quote)}` : "";
      return c.redirect(
        `/reports/${reportId}/${section.slug}?p=${encodeURIComponent(paragraph)}${anchor}#${paragraph}`,
        302
      );
    }
  }

  const words = loaded.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return c.html(
    renderReportOverview(loaded.report, loaded.sections, { words })
  );
});

app.get("/reports/:id/full", async (c) => {
  const loaded = await loadReport(c, c.req.param("id"));
  if (!loaded) return c.html(renderNotFound(false), 404);
  return c.html(
    renderReport(loaded.report, loaded.html, c.req.query("p"), c.req.query("h"))
  );
});

app.get("/reports/:id/:section", async (c) => {
  const loaded = await loadReport(c, c.req.param("id"));
  if (!loaded) return c.html(renderNotFound(false), 404);

  const slug = c.req.param("section");
  const index = loaded.sections.findIndex((section) => section.slug === slug);
  if (index === -1) return c.html(renderNotFound(false), 404);

  return c.html(
    renderSection(
      loaded.report,
      loaded.sections,
      index,
      c.req.query("p"),
      c.req.query("h")
    )
  );
});

app.notFound((c) =>
  c.html(renderNotFound(isLegacyPath(new URL(c.req.url).pathname)), 404)
);

export default app;
