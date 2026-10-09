import { describe, expect, it } from "vitest";
import { findStale } from "../scripts/lib/search-staleness";

const pub = [{ report: "a", content_hash: "P1", published_at: 2000 }];
const local = (contentVersion: string, publishHash = "P1") => () => ({ contentVersion, publishHash });
describe("findStale", () => {
  it("republishing unchanged text is current", () => {
    expect(findStale(pub, [{ report: "a", content_version: "h1", indexed_at: 1000 }], local("h1"))).toEqual([]);
  });
  it("changed text is stale even if indexed after publish", () => {
    const s = findStale(pub, [{ report: "a", content_version: "h1", indexed_at: 3000 }], local("h2"));
    expect(s).toHaveLength(1);
  });
  it("never indexed is stale", () => {
    expect(findStale(pub, [], local("h1"))).toEqual([{ report: "a", reason: "never indexed" }]);
  });
  it("falls back to timestamps with no prerender", () => {
    expect(findStale(pub, [{ report: "a", content_version: "h1", indexed_at: 1000 }], () => null)).toHaveLength(1);
    expect(findStale(pub, [{ report: "a", content_version: "h1", indexed_at: 2500 }], () => null)).toEqual([]);
  });
  it("rtm-publish of text this checkout never rendered (9j2): the local copy matching the index proves nothing", () => {
    // index and local prerender both at the old text h1; R2 serves P2, published after the index was built
    const published = [{ report: "a", content_hash: "P2", published_at: 2000 }];
    const s = findStale(published, [{ report: "a", content_version: "h1", indexed_at: 1000 }], local("h1", "P1"));
    expect(s).toHaveLength(1);
    expect(s[0].reason).toMatch(/not the published text/);
  });
});
