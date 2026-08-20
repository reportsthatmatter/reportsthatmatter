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
      "http://localhost/reports/us-psi-financial-crisis/full"
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
    const first = await app.request("http://localhost/reports/jack-smith-vol1/full");
    const id = (await first.text()).match(/<p id="([a-z0-9-]+)"/)?.[1];
    expect(id).toBeTruthy();

    const res = await app.request(
      `http://localhost/reports/jack-smith-vol1/full?p=${id}`
    );
    const body = await res.text();
    const description = body.match(/<meta name="description" content="([^"]*)"/)?.[1];
    expect(description).toMatch(/^“.+” — Report of Special Counsel/);
    expect(description).not.toContain("Read the full text with linkable");
  });

  it("previews the quoted words when the link names them, not the whole paragraph", async () => {
    const first = await app.request("http://localhost/reports/jack-smith-vol1/full");
    const html = await first.text();
    const { extractParagraph } = await import("../src/templates/report");

    // A paragraph long enough that quoting part of it is visibly different
    // from quoting the whole thing.
    const ids = [...html.matchAll(/<p id="([a-z0-9-]+)"/g)].map((m) => m[1]);
    const id = ids.find((candidate) => (extractParagraph(html, candidate) ?? "").length > 400);
    expect(id).toBeTruthy();
    const paragraph = extractParagraph(html, id!)!;

    // Quote a phrase from the middle of the paragraph, the way a reader would.
    const start = Math.floor(paragraph.length / 4);
    const exact = paragraph.slice(start, start + 40);
    const { encodeAnchor, selectorFor } = await import("../assets/anchor.js");
    const anchor = encodeAnchor(selectorFor(paragraph, start, start + 40))!;

    const res = await app.request(
      `http://localhost/reports/jack-smith-vol1/full?p=${id}&h=${encodeURIComponent(anchor)}`
    );
    const description = (await res.text()).match(
      /<meta name="description" content="([^"]*)"/
    )?.[1];

    // The preview is the quote itself — not the paragraph that contains it,
    // which is the whole reason ?h= travels in the query string.
    expect(description).toContain(exact);
    expect(description!.startsWith(`“${exact.slice(0, 30)}`)).toBe(true);
  });

  it("previews the paragraph when the quoted words are no longer in it", async () => {
    const first = await app.request("http://localhost/reports/jack-smith-vol1/full");
    const id = (await first.text()).match(/<p id="([a-z0-9-]+)"/)?.[1];
    const anchor = encodeURIComponent("|words that were never in this report|");

    const res = await app.request(
      `http://localhost/reports/jack-smith-vol1/full?p=${id}&h=${anchor}`
    );
    const description = (await res.text()).match(
      /<meta name="description" content="([^"]*)"/
    )?.[1];

    expect(description).toMatch(/^“.+” — Report of Special Counsel/);
    expect(description).not.toContain("words that were never in this report");
  });

  it("falls back to the report description without a paragraph", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1/full");
    const body = await res.text();
    expect(body).toContain("Read the full text with linkable paragraphs");
  });

  it("ignores a paragraph id that does not exist", async () => {
    const res = await app.request(
      "http://localhost/reports/jack-smith-vol1/full?p=not-a-real-paragraph"
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

  it("sends a legacy path to the archive subdomain", async () => {
    const res = await app.request("https://reportsthatmatter.org/iraq-inquiry/");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://old.reportsthatmatter.org/iraq-inquiry/"
    );
  });

  it("keeps the query string when sending to the archive", async () => {
    const res = await app.request("https://reportsthatmatter.org/search/?q=enron");
    expect(res.headers.get("location")).toBe(
      "https://old.reportsthatmatter.org/search/?q=enron"
    );
  });

  it("does not touch current paths", async () => {
    const res = await app.request("https://reportsthatmatter.org/reports");
    expect(res.status).toBe(200);
  });

  it("refuses to serve the archive host with no upstream configured", async () => {
    const res = await app.request("https://old.reportsthatmatter.org/iraq-inquiry/");
    expect(res.status).toBe(503);
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

describe("changelog", () => {
  it("renders the changelog page", async () => {
    const res = await app.request("http://localhost/changelog");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("What has changed");
    expect(body).toContain("2026-08-02");
  });

  it("drops the file's internal note to maintainers", async () => {
    const { entriesOnly } = await import("../src/templates/changelog");
    const trimmed = entriesOnly(
      "# Changelog\n\nSource for `/changelog`. Hand-written.\n\n---\n\n## 2026-08-02 — Something\n\nBody."
    );
    expect(trimmed).not.toContain("Hand-written");
    expect(trimmed.startsWith("## 2026-08-02")).toBe(true);
  });

  it("is linked from the footer", async () => {
    const res = await app.request("http://localhost/");
    expect(await res.text()).toContain('href="/changelog"');
  });
});

describe("share cards", () => {
  const CARD_PARAGRAPH = "trump-has-something-else-left";

  it("advertises a card when one exists for the passage", async () => {
    const res = await app.request(
      `http://localhost/reports/jack-smith-vol1/full?p=${CARD_PARAGRAPH}`
    );
    const body = await res.text();
    expect(body).toContain(
      `https://reportsthatmatter.org/assets/cards/jack-smith-vol1/${CARD_PARAGRAPH}.png`
    );
    expect(body).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("does not advertise a card that has not been generated", async () => {
    const res = await app.request(
      "http://localhost/reports/jack-smith-vol1/full?p=rioters-capitol-had-been-motivated-999"
    );
    const body = await res.text();
    expect(body).not.toContain("og:image");
    expect(body).toContain('name="twitter:card" content="summary"');
  });

  it("does not advertise a card without a named passage", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1/full");
    expect(await res.text()).not.toContain("og:image");
  });

  it("serves the generated card image", async () => {
    const res = await app.request(
      `http://localhost/assets/cards/jack-smith-vol1/${CARD_PARAGRAPH}.png`
    );
    expect(res.status).toBe(200);
  });
});

describe("card rendering", () => {
  it("does not double the closing quotation mark", async () => {
    const { wrapInQuotes } = await import("../src/templates/card");
    expect(wrapInQuotes('he replied: "So what?"')).toBe('he replied: "So what?"');
    expect(wrapInQuotes("a plain sentence")).toBe("“a plain sentence”");
  });

  it("escapes markup in the quote", async () => {
    const { renderCard } = await import("../src/templates/card");
    const html = renderCard({ quote: "<script>x</script>", reportTitle: "T" });
    expect(html).not.toContain("<script>x</script>");
  });
});

describe("split reports", () => {
  it("serves a contents page at the report root", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Contents");
    expect(body).toContain("/reports/jack-smith-vol1/the-law");
    expect(body).toContain("/reports/jack-smith-vol1/full");
  });

  it("serves an individual section", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1/the-law");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("THE LAW");
    expect(body).toContain('id="share-pop"');
  });

  it("keeps a section far smaller than the whole report", async () => {
    const section = await app.request("http://localhost/reports/jack-smith-vol1/the-law");
    const full = await app.request("http://localhost/reports/jack-smith-vol1/full");
    const sectionSize = (await section.text()).length;
    const fullSize = (await full.text()).length;
    expect(sectionSize).toBeLessThan(fullSize / 3);
  });

  it("routes a shared passage link to the section that holds it", async () => {
    const res = await app.request(
      "http://localhost/reports/jack-smith-vol1?p=rioters-capitol-had-been-motivated"
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/reports/jack-smith-vol1/");
    expect(location).toContain("#rioters-capitol-had-been-motivated");
    expect(location).not.toMatch(/^\/reports\/jack-smith-vol1\?/);
  });

  it("shows the contents when the passage is unknown", async () => {
    const res = await app.request(
      "http://localhost/reports/jack-smith-vol1?p=no-such-passage"
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Contents");
  });

  it("404s an unknown section", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1/not-a-section");
    expect(res.status).toBe(404);
  });
});

describe("crawlability", () => {
  it("lists every section in the sitemap", async () => {
    const res = await app.request("https://reportsthatmatter.org/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("xml");
    const body = await res.text();
    expect(body).toContain("<loc>https://reportsthatmatter.org/</loc>");
    expect(body).toContain("/reports/jack-smith-vol1</loc>");
    expect(body).toContain("/reports/jack-smith-vol1/the-law</loc>");
    // A crawler will not find dozens of sections from a homepage listing two
    // reports, which is the whole point of the file.
    expect((body.match(/<loc>/g) ?? []).length).toBeGreaterThan(20);
  });

  it("points robots.txt at the sitemap", async () => {
    const res = await app.request("https://reportsthatmatter.org/robots.txt");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(
      "Sitemap: https://reportsthatmatter.org/sitemap.xml"
    );
  });
});

describe("structured data", () => {
  it("describes a report as a Report", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1");
    const body = await res.text();
    const json = body.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    )?.[1];
    expect(json).toBeTruthy();
    const data = JSON.parse(json!);
    expect(data["@type"]).toBe("Report");
    expect(data.name).toContain("Jack Smith");
    // Provenance is the whole claim; it must point at the original.
    expect(data.isBasedOn).toContain("justice.gov");
  });

  it("gives a section breadcrumbs back to its report", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1/the-law");
    const json = (await res.text()).match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    )?.[1];
    const data = JSON.parse(json!);
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toHaveLength(3);
    expect(data.itemListElement[2].item).toContain("/the-law");
  });

  it("emits valid JSON that cannot break out of the script tag", async () => {
    const res = await app.request("http://localhost/reports/us-psi-financial-crisis");
    const json = (await res.text()).match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    )?.[1];
    expect(() => JSON.parse(json!)).not.toThrow();
    expect(json).not.toContain("</script");
  });
});
