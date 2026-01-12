import { describe, expect, it, vi } from "vitest";
import { loadRegistry } from "../src/lib/registry";

vi.mock("../src/lib/bundled", () => ({
  registryText: [
    "reports:",
    "  - id: us-senate-wall-street-and-financial-crisis",
    "    title: \"Wall Street and the Financial Crisis: Anatomy of a Financial Collapse\"",
    "    source_path: reports/samples/us-senate-wall-street-and-financial-crisis/full.md",
  ].join("\n"),
}));

describe("registry", () => {
  it("loads reports from bundled registry when configured", async () => {
    const original = process.env.REPORTS_SOURCE;
    process.env.REPORTS_SOURCE = "bundled";

    const registry = await loadRegistry("bundled");
    expect(registry.reports[0].id).toBe("us-senate-wall-street-and-financial-crisis");

    process.env.REPORTS_SOURCE = original;
  });

  it("loads reports from YAML", async () => {
    const registry = await loadRegistry("local");
    expect(registry.reports.length).toBeGreaterThan(0);
    expect(registry.reports[0].id).toBe("us-senate-wall-street-and-financial-crisis");
  });
});
