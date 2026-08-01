import { describe, expect, it, vi } from "vitest";
import { loadReportMarkdown } from "../src/lib/source";

vi.mock("../src/lib/bundled", () => ({
  bundledReports: {
    "reports/us-psi-financial-crisis/full.md":
      "# Bundled Report",
  },
}));

describe("source", () => {
  it("loads markdown from bundled reports when configured", async () => {
    const original = process.env.REPORTS_SOURCE;
    process.env.REPORTS_SOURCE = "bundled";

    const markdown = await loadReportMarkdown(
      "reports/us-psi-financial-crisis/full.md"
    , "bundled");
    expect(markdown).toContain("Bundled Report");

    process.env.REPORTS_SOURCE = original;
  });

  it("loads markdown from source_path", async () => {
    const markdown = await loadReportMarkdown(
      "reports/us-psi-financial-crisis/full.md"
    , "local");
    expect(markdown).toContain("#");
  });
});
