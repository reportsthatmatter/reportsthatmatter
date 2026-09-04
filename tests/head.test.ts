import { describe, expect, it } from "vitest";
import { renderHead, replaceHead, renderLayout } from "../src/templates/layout";
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

describe("replaceHead", () => {
  it("swaps the head and leaves the body byte-identical", () => {
    const page = renderLayout("Old", "<main>the body</main>", { description: "Old" });
    const swapped = replaceHead(page, renderHead("New", { description: "New" }));

    expect(swapped).toContain('<meta name="description" content="New"');
    expect(swapped).not.toContain('content="Old"');
    expect(swapped.slice(swapped.indexOf("<body>"))).toBe(
      page.slice(page.indexOf("<body>"))
    );
  });

  it("leaves a page with no head alone rather than truncating it", () => {
    expect(replaceHead("<p>not one of ours</p>", "<head></head>")).toBe(
      "<p>not one of ours</p>"
    );
  });
});

/**
 * The property the whole `?p=` path rests on: the shared-link page differs
 * from the pre-rendered one *only* in its head. If a template change ever
 * makes the body depend on `?p=`/`?h=` again, this fails — which is the
 * point, because the dynamic path would then be serving a stale body.
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
