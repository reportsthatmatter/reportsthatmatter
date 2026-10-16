import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { PLATELESS_CARD_REPORTS } from "../src/lib/card-plates";

describe("plateless cards (ay85)", () => {
  it("covers the Post Office wordmark and the Hillsborough plan, and only registered reports", () => {
    expect(PLATELESS_CARD_REPORTS).toContain("uk-post-office-horizon-inquiry");
    expect(PLATELESS_CARD_REPORTS).toContain("uk-hillsborough-panel");
    const ids = parse(readFileSync("reports/registry.yaml", "utf8")).reports.map((r: { id: string }) => r.id);
    for (const id of PLATELESS_CARD_REPORTS) expect(ids).toContain(id);
  });

  it("scripts/cards.mjs asks the list before inlining a plate", () => {
    expect(readFileSync("scripts/cards.mjs", "utf8")).toMatch(/PLATELESS_CARD_REPORTS\.includes\(reportId\)/);
  });
});
