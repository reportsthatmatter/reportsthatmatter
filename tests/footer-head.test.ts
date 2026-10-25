import { describe, expect, it } from "vitest";
import { renderLayout } from "../src/templates/layout";

describe("every page built on renderLayout", () => {
  const html = renderLayout("t", "<main></main>");

  it("advertises the blog's Atom feed in the head", () => {
    expect(html).toContain('<link rel="alternate" type="application/atom+xml" href="/blog/feed.xml"');
  });

  it("advertises the feed once when a page passes its own", () => {
    const own = renderLayout("t", "", { feed: { href: "/blog/feed.xml", title: "x" } });
    expect(own.match(/application\/atom\+xml/g)).toHaveLength(1);
  });
});
