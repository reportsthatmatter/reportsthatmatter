import { describe, expect, it } from "vitest";
import { findStale } from "../scripts/lib/search-staleness";

const pub = [{ report: "a", published_at: 2000 }];
describe("findStale", () => {
  it("republishing unchanged text is current", () => {
    expect(findStale(pub, [{ report: "a", content_version: "h1", indexed_at: 1000 }], () => "h1")).toEqual([]);
  });
  it("changed text is stale even if indexed after publish", () => {
    const s = findStale(pub, [{ report: "a", content_version: "h1", indexed_at: 3000 }], () => "h2");
    expect(s).toHaveLength(1);
  });
  it("never indexed is stale", () => {
    expect(findStale(pub, [], () => "h1")).toEqual([{ report: "a", reason: "never indexed" }]);
  });
  it("falls back to timestamps with no prerender", () => {
    expect(findStale(pub, [{ report: "a", content_version: "h1", indexed_at: 1000 }], () => null)).toHaveLength(1);
    expect(findStale(pub, [{ report: "a", content_version: "h1", indexed_at: 2500 }], () => null)).toEqual([]);
  });
});
