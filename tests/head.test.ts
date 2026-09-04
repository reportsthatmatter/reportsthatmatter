import { describe, expect, it } from "vitest";
import { renderHead, renderLayout } from "../src/templates/layout";
import { app } from "../src/index";

describe("renderHead", () => {
  it("produces the same head renderLayout does", () => {
    const options = { description: "A description", image: "/assets/cards/x.png" };
    const page = renderLayout("A title", "<main>body</main>", options);
    const head = renderHead("A title", options);

    expect(page.startsWith(head)).toBe(true);
  });

  it("escapes a description that would otherwise close the attribute", () => {
    const head = renderHead("T", { description: 'a " quote' });
    expect(head).toContain('content="a &quot; quote"');
  });
});

/**
 * The property the `?p=` path rests on: a shared link differs from the plain
 * page *only* in its head. Pages are assembled from a layout-free fragment
 * now (content-publishing plan §2), so this is what pins the body as
 * independent of the query string.
 */
describe("a shared link serves the pre-rendered body", () => {
  const bodyOf = (html: string) => html.slice(html.indexOf("<body>"));

  it("on /full", async () => {
    const staticPage = await (
      await app.request("http://localhost/reports/jack-smith-vol1/full")
    ).text();
    const id = staticPage.match(/<p id="([a-z0-9-]+)"/)?.[1];
    expect(id).toBeTruthy();

    const shared = await (
      await app.request(`http://localhost/reports/jack-smith-vol1/full?p=${id}`)
    ).text();

    expect(bodyOf(shared)).toBe(bodyOf(staticPage));
    expect(shared).not.toBe(staticPage);
  });

  it("on a section page", async () => {
    const meta = await import("../assets/generated/reports/jack-smith-vol1/meta.json");
    const slug = (meta.default ?? meta).sections[0].slug;

    const staticPage = await (
      await app.request(`http://localhost/reports/jack-smith-vol1/${slug}`)
    ).text();
    const id = staticPage.match(/<p id="([a-z0-9-]+)"/)?.[1];
    expect(id).toBeTruthy();

    const shared = await (
      await app.request(`http://localhost/reports/jack-smith-vol1/${slug}?p=${id}`)
    ).text();

    expect(bodyOf(shared)).toBe(bodyOf(staticPage));
    expect(shared).not.toBe(staticPage);
  });
});
