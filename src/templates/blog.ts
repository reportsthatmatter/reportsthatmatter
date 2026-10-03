import { renderMarkdown } from "@rtm/ingest";
import { renderLayout, escapeHtml } from "./layout";
import { SITE_ORIGIN } from "./site";
import type { Post } from "../lib/blog";

const FEED_PATH = "/blog/feed.xml";
const FEED = { href: FEED_PATH, title: "Reports that Matter — Blog" };

/** "2026-10-02" → "2 October 2026". */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${day} ${months[month - 1]} ${year}`;
}

const postHref = (post: Post, preview: boolean) =>
  `/blog/${post.slug}${preview && post.status === "draft" ? "?draft" : ""}`;

/** /blog. With `preview`, drafts are listed too and marked. */
export function renderBlogIndex(posts: Post[], preview: boolean): string {
  const items = posts
    .map(
      (post) => `
    <li class="post-item">
      <p class="post-meta mono">${formatDate(post.date)}${post.status === "draft" ? ' · <span class="post-draft">Draft</span>' : ""}</p>
      <h2><a href="${postHref(post, preview)}">${escapeHtml(post.title)}</a></h2>
      <p class="post-summary">${escapeHtml(post.summary)}</p>
    </li>`
    )
    .join("");

  const body = `
<main>
  <section class="report-header wrap">
    <div class="measure">
      <p class="kicker mono">Blog</p>
      <h1>Notes on the work.</h1>
      <p class="byline mono">Methods, sourcing and data wrangling · <a href="${FEED_PATH}">Atom feed</a> · <a href="/changelog">Changelog</a></p>
    </div>
  </section>
  <div class="prose wrap measure">
    ${
      posts.length
        ? `<ul class="post-list">${items}</ul>`
        : "<p>No posts yet. What has changed, in brief, is in the <a href=\"/changelog\">changelog</a>.</p>"
    }
  </div>
</main>`;

  return renderLayout("Blog — Reports that Matter", body, {
    description:
      "Long-form notes from Reports that Matter on methods, sourcing and the data wrangling behind readable, citable public reports.",
    feed: FEED,
    url: `${SITE_ORIGIN}/blog`,
    noindex: preview && posts.some((post) => post.status === "draft"),
  });
}

/** /blog/<slug>. A draft renders with a banner and `noindex`. */
export function renderPostPage(post: Post): string {
  const draft = post.status === "draft";
  const banner = draft
    ? `<aside class="draft-banner mono">
    <p><strong>Draft.</strong> Not listed, linked or in the feed. Set <code>status: published</code> in <code>content/posts/${escapeHtml(post.slug)}.md</code> to publish.</p>
    ${
      post.review.length
        ? `<p>For the editor to decide:</p><ul>${post.review.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : ""
    }
  </aside>`
    : "";

  const body = `
<main>
  <article>
  <section class="report-header wrap">
    <div class="measure">
      <p class="kicker mono"><a href="/blog">Blog</a></p>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="byline mono">${escapeHtml(post.author)} · <time datetime="${post.date}">${formatDate(post.date)}</time></p>
    </div>
  </section>
  <div class="prose wrap measure">
    ${banner}
    ${renderMarkdown(post.body)}
  </div>
  </article>
</main>`;

  return renderLayout(`${post.title} — Reports that Matter`, body, {
    description: post.summary,
    ogType: "article",
    url: `${SITE_ORIGIN}/blog/${post.slug}`,
    publishedTime: post.date,
    feed: FEED,
    noindex: draft,
  });
}

const xml = escapeHtml;

/** Atom 1.0 feed of the given (published) posts, newest first. */
export function renderAtomFeed(posts: Post[]): string {
  const updated = posts[0]?.date ?? "2026-01-01";
  const entries = posts
    .map((post) => {
      const url = `${SITE_ORIGIN}/blog/${post.slug}`;
      return `  <entry>
    <id>${url}</id>
    <title>${xml(post.title)}</title>
    <link rel="alternate" type="text/html" href="${url}" />
    <published>${post.date}T00:00:00Z</published>
    <updated>${post.date}T00:00:00Z</updated>
    <author><name>${xml(post.author)}</name></author>
    <summary>${xml(post.summary)}</summary>
    <content type="html">${xml(renderMarkdown(post.body))}</content>
  </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${SITE_ORIGIN}/blog</id>
  <title>${xml(FEED.title)}</title>
  <subtitle>Methods, sourcing and data wrangling</subtitle>
  <link rel="self" type="application/atom+xml" href="${SITE_ORIGIN}${FEED_PATH}" />
  <link rel="alternate" type="text/html" href="${SITE_ORIGIN}/blog" />
  <updated>${updated}T00:00:00Z</updated>
${entries}
</feed>
`;
}

/**
 * The changelog links to long-reads that live on the blog. A link to a post
 * that is not published would be a dead link, so it renders as plain text
 * until the post is published; nothing to edit at publish time.
 */
export function unlinkUnpublishedPosts(html: string, published: Set<string>): string {
  return html.replace(
    /<a href="\/blog\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g,
    (whole, slug: string, text: string) => (published.has(slug) ? whole : text)
  );
}
