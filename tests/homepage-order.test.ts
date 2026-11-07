import { describe, expect, it } from "vitest";
import { loadRegistry } from "../src/lib/registry";
import { renderReportList } from "../src/templates/index";
import { NEVER_FIRST_REPORTS, OPENING_REPORT } from "../src/lib/posts";

// Decision 0027 (reportsthatmatter-5k36): the homepage lists reports in registry
// order, so the registry leads with the opening report and never with a news-day-only one.
describe("homepage report order", () => {
  it("leads with the opening report, never a never-first one", async () => {
    const registry = await loadRegistry("local");
    expect(registry.reports[0].id).toBe(OPENING_REPORT);
    expect(NEVER_FIRST_REPORTS).not.toContain(registry.reports[0].id);
  });

  it("renders the opening report first in the homepage list", async () => {
    const registry = await loadRegistry("local");
    const links = [...renderReportList(registry).matchAll(/href="\/reports\/([^"/]+)"/g)].map((m) => m[1]);
    expect(links[0]).toBe(OPENING_REPORT);
  });
});
