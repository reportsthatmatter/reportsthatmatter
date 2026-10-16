import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { affectedCommunityIds, describeTierC, tierCFindings, tierCMatch, TIER_C_WORDS } from "../src/lib/tier-c";
import { AFFECTED_COMMUNITY_REPORTS } from "../src/lib/feed-policy";

const root = join(import.meta.dirname, "..");
const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));

describe("tier rule (zh1w)", () => {
  it("has one source of truth: the registry flag, which src/generated/affected.ts (the feed's list) copies", () => {
    expect([...AFFECTED_COMMUNITY_REPORTS].sort()).toEqual(affectedCommunityIds(registry).sort());
    expect(AFFECTED_COMMUNITY_REPORTS).toContain("uk-grenfell-tower-inquiry");
    expect(AFFECTED_COMMUNITY_REPORTS).not.toContain("jack-smith-vol1");
  });

  it("matches strategy section 8's Tier C words as whole words, not inside others", () => {
    for (const w of ["died", "death", "dead", "killed", "lives", "suicide", "survived", "crush", "bodies", "victims", "traumatised"]) expect(TIER_C_WORDS).toContain(w);
    expect(tierCMatch("The deaths of the 96 victims")?.matched).toBe("deaths");
    expect(tierCMatch("A DEATH trap")?.matched).toBe("death");
    expect(tierCMatch("The deadline passed and the shuttle lived up to its name")).toBeNull();
    expect(tierCMatch("NASA did not act on the O-ring erosion it knew about.")).toBeNull();
  });

  it("matches a private person from the file's list, case-insensitively", () => {
    expect(tierCMatch("Mr Smith told the inquiry", ["mr smith"])).toEqual({ matched: "mr smith", kind: "person" });
    expect(tierCMatch("Mr Jones told the inquiry", ["Mr Smith", ""])).toBeNull();
  });

  const source = (quote: string, extra = {}) => ({
    report: "uk-hillsborough-panel",
    highlights: [{ paragraph: "p1", quote, card: true }, { paragraph: "p2", quote: "deaths", card: false }],
    ...extra,
  });

  it("passes a Tier A card and fails a Tier C one, naming file paragraph and word", () => {
    expect(tierCFindings(source("South Yorkshire Police failed to close the tunnel."), AFFECTED_COMMUNITY_REPORTS)).toEqual([]);
    const found = tierCFindings(source("the deaths of the 96 victims"), AFFECTED_COMMUNITY_REPORTS);
    expect(found).toEqual([{ report: "uk-hillsborough-panel", paragraph: "p1", matched: "deaths", kind: "word" }]);
    expect(describeTierC(found[0])).toContain("uk-hillsborough-panel/p1");
    expect(describeTierC(found[0])).toContain('"deaths"');
  });

  it("ignores reports outside the affected list and highlights without card: true", () => {
    expect(tierCFindings({ ...source("the deaths of the 96 victims"), report: "jack-smith-vol1" }, AFFECTED_COMMUNITY_REPORTS)).toEqual([]);
    expect(tierCFindings(source("fine words"), AFFECTED_COMMUNITY_REPORTS)).toEqual([]);
  });

  it("flags a private person listed in the editorial file", () => {
    const found = tierCFindings(source("Peter Lutz wrote to the board.", { private_people: ["Peter Lutz"] }), AFFECTED_COMMUNITY_REPORTS);
    expect(found.map((f) => f.kind)).toEqual(["person"]);
  });

  it("no card: true highlight in the real editorial files is Tier C today (the reviewer removed the ten)", () => {
    for (const name of readdirSync(join(root, "editorial")).filter((n: string) => n.endsWith(".yaml"))) {
      const found = tierCFindings(parse(readFileSync(join(root, "editorial", name), "utf8")), AFFECTED_COMMUNITY_REPORTS);
      expect(found.map(describeTierC)).toEqual([]);
    }
  });
});
