import { Hono } from "hono";
import { loadRegistry } from "./lib/registry";
import { renderMarkdown } from "./lib/markdown";
import { loadReportMarkdown } from "./lib/source";
import { renderIndex, renderReportsIndex } from "./templates/index";
import { renderReport } from "./templates/report";
import { renderAbout } from "./templates/about";
import { renderNotFound } from "./templates/not-found";

export type Bindings = {
  /** Cloudflare static-assets binding; absent under local Node/vitest. */
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  /** "bundled" reads reports from the worker bundle, otherwise from disk. */
  REPORTS_SOURCE?: string;
  /** Where the pre-V2 site now lives, e.g. "old.reportsthatmatter.org". */
  LEGACY_HOST?: string;
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

export function isLegacyPath(pathname: string): boolean {
  return LEGACY_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.text("ok"));

// Send the old site's URLs to wherever the old site now lives, before any
// route can claim them.
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);

  // One canonical host, so links and analytics do not split in two.
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
    return c.redirect(url.toString(), 301);
  }

  const legacyHost = c.env?.LEGACY_HOST;
  if (legacyHost && isLegacyPath(url.pathname)) {
    url.host = legacyHost;
    url.protocol = "https:";
    url.port = "";
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

app.get("/reports/:id", async (c) => {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  const reportId = c.req.param("id");
  const registry = await loadRegistry(sourceMode);
  const report = registry.reports.find((entry) => entry.id === reportId);

  if (!report) {
    return c.html(renderNotFound(false), 404);
  }

  const markdown = await loadReportMarkdown(report.source_path, sourceMode);
  const html = renderMarkdown(markdown);

  // `?p=` mirrors the fragment. A fragment never reaches the server, so it is
  // the query string that lets a shared link preview the passage it points at.
  return c.html(renderReport(report, html, c.req.query("p")));
});

app.notFound((c) =>
  c.html(renderNotFound(isLegacyPath(new URL(c.req.url).pathname)), 404)
);

export default app;
