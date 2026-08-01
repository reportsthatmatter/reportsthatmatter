import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("routes", () => {
  it("serves static assets", async () => {
    const res = await app.request(
      "http://localhost/assets/images/senate-screenshot-2.png"
    );
    expect(res.status).toBe(200);
  });

  it("serves static assets via ASSETS binding", async () => {
    const res = await app.request(
      "http://localhost/assets/images/senate-screenshot-2.png",
      {},
      {
        ASSETS: {
          fetch: async (req: Request) => {
            const url = new URL(req.url);
            return url.pathname === "/images/senate-screenshot-2.png"
              ? new Response("ok")
              : new Response("not found", { status: 404 });
          },
        },
      }
    );
    expect(res.status).toBe(200);
  });

  it("renders home page with report link", async () => {
    const res = await app.request("http://localhost/");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Reports that Matter");
    expect(body).toContain('href="/reports"');
    expect(body).toContain("Wall Street and the Financial Crisis");
  });

  it("serves the design system stylesheet, not a CDN framework", async () => {
    const res = await app.request("http://localhost/");
    const body = await res.text();
    expect(body).toContain('href="/assets/styles.css"');
    expect(body).not.toContain("cdn.tailwindcss.com");
  });

  it("renders report index", async () => {
    const res = await app.request("http://localhost/reports");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Reports");
    expect(body).toContain("Wall Street and the Financial Crisis");
  });

  it("renders the about page", async () => {
    const res = await app.request("http://localhost/about");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("made accessible");
  });

  it("renders report detail with paragraph anchors and share affordance", async () => {
    const res = await app.request(
      "http://localhost/reports/us-psi-financial-crisis"
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Wall Street and the Financial Crisis");
    expect(body).toMatch(/<p id="[a-z0-9-]+"/);
    expect(body).toContain('class="permalink"');
    expect(body).toContain('id="share-pop"');
    // ids must not be positional — that is what makes citations rot
    expect(body).not.toMatch(/<p id="p-\d+"/);
    expect(body).toContain("/assets/share.js");
  });

  it("returns 404 for an unknown report", async () => {
    const res = await app.request("http://localhost/reports/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("escapes markup in report titles", async () => {
    const { renderReport } = await import("../src/templates/report");
    const html = renderReport({ title: "<script>alert(1)</script>" }, "<p>body</p>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("share previews", () => {
  it("previews the quoted passage when a paragraph is named", async () => {
    const first = await app.request("http://localhost/reports/jack-smith-vol1");
    const id = (await first.text()).match(/<p id="([a-z0-9-]+)"/)?.[1];
    expect(id).toBeTruthy();

    const res = await app.request(
      `http://localhost/reports/jack-smith-vol1?p=${id}`
    );
    const body = await res.text();
    const description = body.match(/<meta name="description" content="([^"]*)"/)?.[1];
    expect(description).toMatch(/^“.+” — Report of Special Counsel/);
    expect(description).not.toContain("Read the full text with linkable");
  });

  it("falls back to the report description without a paragraph", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1");
    const body = await res.text();
    expect(body).toContain("Read the full text with linkable paragraphs");
  });

  it("ignores a paragraph id that does not exist", async () => {
    const res = await app.request(
      "http://localhost/reports/jack-smith-vol1?p=not-a-real-paragraph"
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Read the full text with linkable paragraphs");
  });
});

describe("extractParagraph", () => {
  it("strips the sidenote and its marker from the quoted passage", async () => {
    const { extractParagraph } = await import("../src/templates/report");
    const html =
      '<p id="x"><a class="permalink" href="#x">¶</a>He replied ' +
      '<label class="sidenote-toggle" for="sn-1-1"><sup>1</sup></label>' +
      '<input class="sidenote-checkbox" id="sn-1-1" type="checkbox" />' +
      '<span class="sidenote"><sup>1</sup> Interview transcript at 12.</span>' +
      " so what?</p>";
    expect(extractParagraph(html, "x")).toBe("He replied so what?");
  });

  it("returns null for an unknown id", async () => {
    const { extractParagraph } = await import("../src/templates/report");
    expect(extractParagraph("<p id=\"a\">text</p>", "b")).toBeNull();
  });
});

describe("legacy site handling", () => {
  it("recognises the previous site's sections", async () => {
    const { isLegacyPath } = await import("../src/index");
    expect(isLegacyPath("/iraq-inquiry")).toBe(true);
    expect(isLegacyPath("/iraq-inquiry/")).toBe(true);
    expect(isLegacyPath("/enron-report/whatever")).toBe(true);
    expect(isLegacyPath("/reports/jack-smith-vol1")).toBe(false);
    expect(isLegacyPath("/")).toBe(false);
  });

  it("redirects a legacy path once the old site has a home", async () => {
    const res = await app.request(
      "https://reportsthatmatter.org/iraq-inquiry/",
      {},
      { LEGACY_HOST: "old.reportsthatmatter.org" }
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://old.reportsthatmatter.org/iraq-inquiry/"
    );
  });

  it("explains itself instead of 404ing blankly when there is nowhere to send them", async () => {
    const res = await app.request("https://reportsthatmatter.org/iraq-inquiry/");
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("That page has moved");
    expect(body).toContain("gh-pages");
  });

  it("does not touch current paths", async () => {
    const res = await app.request(
      "https://reportsthatmatter.org/reports",
      {},
      { LEGACY_HOST: "old.reportsthatmatter.org" }
    );
    expect(res.status).toBe(200);
  });

  it("redirects www to the apex", async () => {
    const res = await app.request("https://www.reportsthatmatter.org/reports");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://reportsthatmatter.org/reports");
  });
});

describe("renamed reports", () => {
  it("redirects the old report id rather than 404ing", async () => {
    const res = await app.request(
      "https://reportsthatmatter.org/reports/us-senate-wall-street-and-financial-crisis"
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://reportsthatmatter.org/reports/us-psi-financial-crisis"
    );
  });

  it("keeps the paragraph anchor across the rename", async () => {
    const res = await app.request(
      "https://reportsthatmatter.org/reports/us-senate-wall-street-and-financial-crisis?p=some-passage"
    );
    expect(res.headers.get("location")).toContain("?p=some-passage");
  });
});
