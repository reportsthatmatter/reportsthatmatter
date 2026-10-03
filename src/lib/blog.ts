import { parse } from "yaml";

/**
 * The blog's data layer (reportsthatmatter-jedz). A post is a markdown file in
 * `content/posts/<slug>.md` with YAML frontmatter; the slug is the file name.
 *
 * Drafts are built like any other post but are never listed, linked, put in
 * the feed or the sitemap. A draft's page is served only with `?draft`
 * (noindex), the same preview flag the editorial landing pages use.
 */

export type PostStatus = "draft" | "published";

export type Post = {
  slug: string;
  title: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  author: string;
  summary: string;
  status: PostStatus;
  /** Open questions for the editor; shown only on a draft's preview page. */
  review: string[];
  /** Markdown, frontmatter removed. */
  body: string;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses one post file. Throws, naming the file, on anything malformed. */
export function parsePost(slug: string, raw: string): Post {
  const fail = (why: string): never => {
    throw new Error(`content/posts/${slug}.md: ${why}`);
  };
  if (!SLUG.test(slug)) fail("the file name must be a lower-case slug");

  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return fail("missing --- frontmatter ---");
  const data = parse(match[1]) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return fail("frontmatter is not a mapping");

  const text = (key: string): string => {
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) fail(`frontmatter needs a "${key}"`);
    return (value as string).trim();
  };
  const date = text("date");
  if (!DATE.test(date)) fail('"date" must be YYYY-MM-DD (quote it)');
  const status = text("status");
  if (status !== "draft" && status !== "published") {
    fail('"status" must be "draft" or "published"');
  }
  const review = data.review ?? [];
  if (!Array.isArray(review) || review.some((item) => typeof item !== "string")) {
    fail('"review" must be a list of strings');
  }

  return {
    slug,
    title: text("title"),
    date,
    author: text("author"),
    summary: text("summary"),
    status: status as PostStatus,
    review: review as string[],
    body: match[2].trim(),
  };
}

/** Every post file parsed, newest first (ties broken by slug). */
export function parsePosts(files: Record<string, string>): Post[] {
  return Object.entries(files)
    .map(([slug, raw]) => parsePost(slug, raw))
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export const isPublished = (post: Post): boolean => post.status === "published";

/** What a reader may see: published posts, plus drafts when previewing. */
export function visiblePosts(posts: Post[], preview: boolean): Post[] {
  return preview ? posts : posts.filter(isPublished);
}

export function findPost(posts: Post[], slug: string, preview: boolean): Post | undefined {
  return visiblePosts(posts, preview).find((post) => post.slug === slug);
}
