import { describe, expect, it, vi } from "vitest";
import { loadRegistry } from "../src/lib/registry";

vi.mock("../src/lib/bundled", () => ({
  registryText: [
    "reports:",
    "  - id: us-psi-financial-crisis",
    "    title: \"Wall Street and the Financial Crisis: Anatomy of a Financial Collapse\"",
    "    source_path: reports/us-psi-financial-crisis/full.md",
  ].join("\n"),
}));

describe("registry", () => {
  it("loads reports from bundled registry when configured", async () => {
    const original = process.env.REPORTS_SOURCE;
    process.env.REPORTS_SOURCE = "bundled";

    const registry = await loadRegistry("bundled");
    expect(registry.reports[0].id).toBe("us-psi-financial-crisis");

    process.env.REPORTS_SOURCE = original;
  });

  it("loads reports from YAML", async () => {
    const registry = await loadRegistry("local");
    expect(registry.reports.length).toBeGreaterThan(0);
    // Order is editorial and changes as reports are published; assert on the
    // contents rather than the position.
    const ids = registry.reports.map((report) => report.id);
    expect(ids).toContain("us-psi-financial-crisis");
    expect(ids).toContain("jack-smith-vol1");
  });

  it("gives every report a source path", async () => {
    const registry = await loadRegistry("local");
    for (const report of registry.reports) {
      expect(report.source_path, `${report.id} has no source_path`).toBeTruthy();
      expect(report.title, `${report.id} has no title`).toBeTruthy();
    }
  });
});
