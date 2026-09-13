import { describe, expect, it } from "vitest";
import { renderReportList } from "../src/templates/index";
import { frontispiece } from "../src/templates/report";
import { renderReportOverview } from "../src/templates/section";
import { renderCard, renderDefaultCard } from "../src/templates/card";
import { renderLayout } from "../src/templates/layout";
import { MARKS } from "../src/generated/marks";

// Report plates (#99): one treated image per report, in the archive row, the
// report header, and the share card.

const report = (id: string) => ({ id, title: `Title of ${id}`, source_path: "x.md" });

describe("report plates", () => {
  it("has a plate for every published report", async () => {
    const { readFileSync } = await import("node:fs");
    const { parse } = await import("yaml");
    const registry = parse(readFileSync("reports/registry.yaml", "utf8"));
    const missing = registry.reports.map((r: { id: string }) => r.id).filter((id: string) => !MARKS[id]);
    expect(missing, `No plate for ${missing.join(", ")} — every published report needs one. Recipe: docs/plates.md`).toEqual([]);
  });

  it("sets each archive row's plate inside the 92px slot, at its own proportions", () => {
    const html = renderReportList({ reports: [report("us-deepwater-horizon")] });
    const { width, height } = MARKS["us-deepwater-horizon"];
    const img = html.match(/<img src="\/assets\/marks\/us-deepwater-horizon-row\.webp"[^>]*width="(\d+)" height="(\d+)"/);
    expect(img).not.toBeNull();
    expect(Math.max(+img![1], +img![2])).toBe(92);
    expect(+img![1] / +img![2]).toBeCloseTo(width / height, 1);
    expect(html).toContain('class="report-list report-list-marked"');
  });

  it("keeps the slot for a report without a plate, so titles still align", () => {
    const html = renderReportList({ reports: [report("no-such-report")] });
    expect(html).toContain('<span class="report-mark" aria-hidden="true"></span>');
    expect(html).not.toContain("<img");
  });

  it("gives a report header a frontispiece only when there is a plate", () => {
    expect(frontispiece("columbia-accident")).toContain('src="/assets/marks/columbia-accident.webp"');
    expect(frontispiece("no-such-report")).toBe("");
    expect(frontispiece(undefined)).toBe("");
  });

  it("does not put plates on a report's own contents list", () => {
    const html = renderReportOverview(
      { id: "columbia-accident", title: "Columbia" },
      [{ slug: "one", title: "One", level: 2, page: undefined }],
      { words: 10 }
    );
    expect(html).toContain('class="frontispiece"');
    expect(html).toContain('<ul class="report-list">');
    expect(html).not.toContain("report-mark");
  });

  it("sets the plate opposite the wordmark on share cards, and omits the slot without one", () => {
    const withMark = renderCard({ quote: "q", reportTitle: "T", markDataUri: "data:image/webp;base64,AA" });
    expect(withMark).toContain('<div class="imprint"><img src="data:image/webp;base64,AA"');
    expect(renderCard({ quote: "q", reportTitle: "T" })).not.toContain('class="imprint"');
    expect(renderDefaultCard({ title: "T", markDataUri: "data:x" })).toContain('class="imprint"');
  });
});

describe("brand mark", () => {
  it("drops the seal from the navbar and serves the pilcrow as the favicon", () => {
    const html = renderLayout("t", "<main></main>");
    const header = html.slice(html.indexOf('<header class="site-header'), html.indexOf("</header>"));
    expect(header).not.toContain("<img");
    expect(header).toContain("Reports that Matter");
    expect(html).toContain('rel="icon" href="/assets/brand/pilcrow-32.png"');
    expect(html).toContain('rel="apple-touch-icon" href="/assets/brand/pilcrow-180.png"');
  });
});
