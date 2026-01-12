import { describe, expect, it } from "vitest";
import { loadRegistry } from "../src/lib/registry";

describe("registry", () => {
  it("loads reports from YAML", async () => {
    const registry = await loadRegistry();
    expect(registry.reports.length).toBeGreaterThan(0);
    expect(registry.reports[0].id).toBe("us-senate-wall-street-and-financial-crisis");
  });
});
