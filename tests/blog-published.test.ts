import { describe, expect, it, vi } from "vitest";

const file = (title: string, date: string, status: string) =>
  `---\ntitle: "${title}"\ndate: "${date}"\nauthor: Ann Author\nsummary: "A summary & more"\nstatus: ${status}\n---\n\nHello **world**.\n`;

vi.mock("../src/lib/source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/source")>()),
  loadPostFiles: async () => ({
    "first-post": file("First <post>", "2026-03-01", "published"),
    "second-post": file("Second post", "2026-04-01", "published"),
    "secret-draft": file("Secret draft", "2026-05-01", "draft"),
  }),
  loadChangelog: async () =>
    "# Changelog\n\nnote\n\n---\n\n## 2026-04-02 — Entry\n\n[live](/blog/second-post) and [dead](/blog/secret-draft).\n",
}));

import { app } from "../src/index";

describe("blog routes with published posts", () => {
  it("lists published posts newest first, without the draft", async () => {
    const body = await (await app.request("http://localhost/blog")).text();
    expect(body.indexOf("Second post")).toBeLessThan(body.indexOf("First &lt;post&gt;"));
    expect(body).toContain('href="/blog/first-post"');
    expect(body).not.toContain("Secret draft");
    expect(body).toContain('rel="alternate" type="application/atom+xml"');
  });

  it("renders a post with OG and article meta", async () => {
    const res = await app.request("http://localhost/blog/first-post");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<title>First &lt;post&gt; — Reports that Matter</title>");
    expect(body).toContain('<meta property="og:type" content="article" />');
    expect(body).toContain('<meta property="og:description" content="A summary &amp; more" />');
    expect(body).toContain('<meta property="og:url" content="https://reportsthatmatter.org/blog/first-post" />');
    expect(body).toContain('<link rel="canonical" href="https://reportsthatmatter.org/blog/first-post" />');
    expect(body).toContain('<meta property="article:published_time" content="2026-03-01" />');
    expect(body).toContain("<strong>world</strong>");
    expect(body).toContain("Ann Author");
    expect(body).not.toContain("noindex");
    expect(body).not.toContain("draft-banner");
  });

  it("404s an unknown slug and an unflagged draft", async () => {
    expect((await app.request("http://localhost/blog/nope")).status).toBe(404);
    expect((await app.request("http://localhost/blog/secret-draft")).status).toBe(404);
  });

  it("serves a valid Atom feed of published posts only", async () => {
    const res = await app.request("http://localhost/blog/feed.xml");
    expect(res.headers.get("content-type")).toContain("application/atom+xml");
    const body = await res.text();
    expect(body).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(body.match(/<entry>/g)).toHaveLength(2);
    expect(body).toContain("<id>https://reportsthatmatter.org/blog/second-post</id>");
    expect(body).toContain("<updated>2026-04-01T00:00:00Z</updated>");
    expect(body).toContain("<title>First &lt;post&gt;</title>");
    expect(body).not.toContain("Secret draft");
  });

  it("puts published posts, not drafts, in the sitemap", async () => {
    const body = await (await app.request("http://localhost/sitemap.xml")).text();
    expect(body).toContain("/blog/first-post</loc>");
    expect(body).not.toContain("secret-draft");
  });

  it("links a published post from the changelog and unlinks a draft", async () => {
    const body = await (await app.request("http://localhost/changelog")).text();
    expect(body).toContain('href="/blog/second-post"');
    expect(body).not.toContain('href="/blog/secret-draft"');
    expect(body).toContain("dead");
  });
});
