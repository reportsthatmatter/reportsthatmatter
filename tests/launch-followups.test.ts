/**
 * Decision 0028 follow-ups (reportsthatmatter-xq4i): the introduction is labelled as ours, the footer
 * credit no longer reads as the site's age, and the redirect from a passage link keeps src=.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

const metaOf = (id: string) => JSON.parse(readFileSync(join(import.meta.dirname, `../assets/generated/reports/${id}/meta.json`), "utf8"));

describe("the introduction is labelled as ours", () => {
  it("an approved landing page labels the standfirst and says the introduction is not the report", async () => {
    const html = await (await app.request("http://localhost/reports/jack-smith-vol1")).text();
    const label = html.indexOf("Our introduction</p>");
    expect(label).toBeGreaterThan(-1);
    expect(label).toBeLessThan(html.indexOf('class="landing-standfirst'));
    expect(html).toContain("Introduction by Reports that Matter, not part of the report.");
  });
});

describe("footer credit", () => {
  it("credits the builders without implying the site is since 2015", async () => {
    const html = await (await app.request("http://localhost/about")).text();
    expect(html).toContain("Datopian</a>, who have worked on open data since 2015.");
    expect(html).not.toMatch(/Datopian<\/a> since 2015/);
  });
});

describe("a passage link's 302", () => {
  const id = "jack-smith-vol1";
  const paragraph = Object.keys(metaOf(id).paragraphToSection)[0];

  it("keeps src= (and other parameters) alongside p= and h=", async () => {
    const res = await app.request(`http://localhost/reports/${id}?p=${paragraph}&h=abc&src=bsky&utm_campaign=launch`);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "", "http://localhost");
    expect(location.searchParams.get("p")).toBe(paragraph);
    expect(location.searchParams.get("h")).toBe("abc");
    expect(location.searchParams.get("src")).toBe("bsky");
    expect(location.searchParams.get("utm_campaign")).toBe("launch");
    expect(location.hash).toBe(`#${paragraph}`);
  });

  it("adds nothing when there are no other parameters", async () => {
    const res = await app.request(`http://localhost/reports/${id}?p=${paragraph}`);
    expect(res.headers.get("location")).toMatch(new RegExp(`\\?p=${paragraph}#${paragraph}$`));
  });
});
