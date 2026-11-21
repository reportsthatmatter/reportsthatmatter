/** Each live report links its full text as Markdown on GitHub, from its own repo as the registry names it (reportsthatmatter-9b3n). */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { markdownUrl, markdownLink, MARKDOWN_LINK_TEXT } from "../src/templates/report";
import { liveReports } from "../scripts/lib/dataset";
import { renderSection, renderReportOverview } from "../src/templates/section";

const root = join(import.meta.dirname, "..");
const live = liveReports(root) as any[];

describe("full text as Markdown on GitHub", () => {
  it("every live report names a repo and gets a github.com blob URL for its full.md", () => {
    expect(live.length).toBeGreaterThan(0);
    for (const r of live) {
      expect(r.repo, `${r.id} has no repo in the registry`).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(markdownUrl(r), r.id).toBe(`https://github.com/reportsthatmatter/${r.repo}/blob/HEAD/full.md`);
    }
  });

  it("uses the registry's repo, not the site id (they differ)", () => {
    const lit = live.find((r) => r.id === "litvinenko-inquiry")!;
    expect(markdownUrl(lit)).toContain("/uk-litvinenko-inquiry/");
    expect(live.some((r) => r.repo !== r.id)).toBe(true);
  });

  it("is the page view, not raw.githubusercontent", () => {
    for (const r of live) expect(markdownUrl(r)).not.toContain("raw.githubusercontent");
  });

  it("has no link for a report without a repo", () => {
    expect(markdownUrl({})).toBeNull();
    expect(markdownLink({})).toBe("");
  });

  it("the report's contents page carries the link", () => {
    const r = live[0];
    const html = renderSection({ ...(r as any) } as any, [{ slug: "a", title: "A" }] as any, 0, "<p>x</p>");
    expect(html).toContain(MARKDOWN_LINK_TEXT);
    expect(html).toContain(markdownUrl(r)!);
  });

  it("the landing page carries the link, beside the original document", () => {
    for (const r of live) {
      const html = renderReportOverview(r as any, [{ slug: "a", title: "A", level: 2, page: "1" }] as any, { words: 10 });
      expect(html, r.id).toContain(`href="${markdownUrl(r)}"`);
      expect(html, r.id).toContain(MARKDOWN_LINK_TEXT);
    }
  });

  it("each report's full.md exists in the site's copy", () => {
    for (const r of live) expect(existsSync(join(root, r.source_path)), r.id).toBe(true);
  });
});
