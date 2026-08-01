import { Hono } from "hono";
import { loadRegistry } from "./lib/registry";
import { renderMarkdown } from "./lib/markdown";
import { loadReportMarkdown } from "./lib/source";
import { renderIndex, renderReportsIndex } from "./templates/index";
import { renderReport } from "./templates/report";
import { renderAbout } from "./templates/about";

export type Bindings = {
  /** Cloudflare static-assets binding; absent under local Node/vitest. */
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  /** "bundled" reads reports from the worker bundle, otherwise from disk. */
  REPORTS_SOURCE?: string;
};

export const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.text("ok"));

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
    return c.text("Report not found", 404);
  }

  const markdown = await loadReportMarkdown(report.source_path, sourceMode);
  const html = renderMarkdown(markdown);

  // `?p=` mirrors the fragment. A fragment never reaches the server, so it is
  // the query string that lets a shared link preview the passage it points at.
  return c.html(renderReport(report, html, c.req.query("p")));
});

export default app;
