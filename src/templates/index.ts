import type { ReportRegistry } from "../lib/registry";
import { renderLayout } from "./layout";

export function renderIndex(registry: ReportRegistry): string {
  const items = registry.reports
    .map((report) => `<li><a href="/reports/${report.id}">${report.title}</a></li>`)
    .join("\n");

  return renderLayout("Reports", `<h1>Reports</h1><ul>${items}</ul>`);
}
