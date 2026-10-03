import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { app } from "../src/index";
import { parsePost, parsePosts, visiblePosts } from "../src/lib/blog";
import { unlinkUnpublishedPosts } from "../src/templates/blog";
import { buildBundle } from "../scripts/blog.mjs";

const post = (extra = "") =>
  `---\ntitle: "T"\ndate: "2026-01-02"\nauthor: A\nsummary: S\nstatus: draft\n${extra}---\n\nBody.\n`;

describe("parsePost", () => {
  it("reads frontmatter and body", () => {
    const parsed = parsePost("a-post", post("review:\n  - decide\n"));
    expect(parsed).toMatchObject({ slug: "a-post", title: "T", date: "2026-01-02", status: "draft", review: ["decide"] });
    expect(parsed.body).toBe("Body.");
  });

  it.each([
    ["no frontmatter", "Body only"],
    ["bad status", post().replace("draft", "live")],
    ["unquoted-looking bad date", post().replace('"2026-01-02"', '"Jan 2"')],
    ["missing title", post().replace('title: "T"\n', "")],
  ])("rejects %s, naming the file", (_why, raw) => {
    expect(() => parsePost("a-post", raw)).toThrow(/content\/posts\/a-post\.md/);
  });

  it("rejects a file name that is not a slug", () => {
    expect(() => parsePost("Bad Name", post())).toThrow(/slug/);
  });
});

describe("visibility", () => {
  const posts = parsePosts({
    old: post().replace("draft", "published").replace("2026-01-02", "2025-01-01"),
    new: post().replace("draft", "published"),
    wip: post(),
  });

  it("sorts newest first", () => {
    expect(posts.map((p) => p.slug)).toEqual(["new", "wip", "old"]);
  });

  it("hides drafts unless previewing", () => {
    expect(visiblePosts(posts, false).map((p) => p.slug)).toEqual(["new", "old"]);
    expect(visiblePosts(posts, true)).toHaveLength(3);
  });
});

describe("the posts in the repo", () => {
  it("all parse", () => {
    const files = Object.fromEntries(
      readdirSync("content/posts")
        .filter((name) => name.endsWith(".md"))
        .map((name) => [name.slice(0, -3), readFileSync(`content/posts/${name}`, "utf8")])
    );
    expect(parsePosts(files).length).toBeGreaterThan(0);
  });

  it("are bundled for the Worker (run: pnpm blog)", () => {
    expect(readFileSync("src/generated/posts-bundle.ts", "utf8")).toBe(buildBundle());
  });
});

describe("changelog links to posts", () => {
  const html = '<p><a href="/blog/x">Read it</a> and <a href="/about">about</a></p>';
  it("keeps a link to a published post", () => {
    expect(unlinkUnpublishedPosts(html, new Set(["x"]))).toBe(html);
  });
  it("renders a link to an unpublished post as plain text", () => {
    expect(unlinkUnpublishedPosts(html, new Set())).toBe('<p>Read it and <a href="/about">about</a></p>');
  });
});

// The posts committed today are all drafts, so these routes are the "safe in
// the repo" guarantee. Published behaviour is in blog-published.test.ts.
describe("blog routes with only drafts", () => {
  const slug = "getting-the-text-right";

  it("lists nothing and links no draft", async () => {
    const body = await (await app.request("http://localhost/blog")).text();
    expect(body).toContain("No posts yet");
    expect(body).not.toContain(slug);
  });

  it("does not serve a draft without ?draft", async () => {
    expect((await app.request(`http://localhost/blog/${slug}`)).status).toBe(404);
  });

  it("previews a draft with ?draft: banner, noindex, review notes", async () => {
    const res = await app.request(`http://localhost/blog/${slug}?draft`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("draft-banner");
    expect(body).toContain('<meta name="robots" content="noindex" />');
    expect(body).toContain("AI coding agents");
    // The flagged sentence stays in the post and is flagged in the preview's decision list.
    expect(body).toContain("DECISION: the sentence beginning");
    expect(body).toContain("For the editor to decide");
  });

  it("lists drafts, marked, with ?draft", async () => {
    const body = await (await app.request("http://localhost/blog?draft")).text();
    expect(body).toContain(`/blog/${slug}?draft`);
    expect(body).toContain("Draft");
  });

  it("keeps drafts out of the feed and the sitemap", async () => {
    const feed = await (await app.request("http://localhost/blog/feed.xml")).text();
    expect(feed).not.toContain("<entry>");
    const sitemap = await (await app.request("http://localhost/sitemap.xml")).text();
    expect(sitemap).toContain("/blog</loc>");
    expect(sitemap).not.toContain(slug);
  });

  it("leaves the draft's changelog mention unlinked", async () => {
    const body = await (await app.request("http://localhost/changelog")).text();
    expect(body).toContain("Getting the text right");
    expect(body).not.toContain(`href="/blog/${slug}"`);
  });

  it("links the blog from the footer and the changelog", async () => {
    expect(await (await app.request("http://localhost/")).text()).toContain('href="/blog"');
    expect(await (await app.request("http://localhost/changelog")).text()).toContain('href="/blog"');
  });
});
