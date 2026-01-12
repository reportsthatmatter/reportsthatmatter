import { Hono } from "hono";
import { loadRegistry } from "./lib/registry";
import { renderMarkdown } from "./lib/markdown";
import { loadReportMarkdown } from "./lib/source";
import { renderIndex } from "./templates/index";
import { renderReport } from "./templates/report";

export const app = new Hono();

app.get("/health", (c) => c.text("ok"));

app.get("/reports", async (c) => {
  const registry = await loadRegistry();
  return c.html(renderIndex(registry));
});

app.get("/reports/:id", async (c) => {
  const reportId = c.req.param("id");
  const registry = await loadRegistry();
  const report = registry.reports.find((entry) => entry.id === reportId);

  if (!report) {
    return c.text("Report not found", 404);
  }

  const markdown = await loadReportMarkdown(report.source_path);
  const html = renderMarkdown(markdown);

  return c.html(renderReport(report.title, html));
});

export default app;
