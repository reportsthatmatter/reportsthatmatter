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
  /** The newsletter issue this post is (decision 0033): each monthly email is also a post. Absent for other posts. */
  issue?: number;
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

  const issue = data.issue;
  if (issue !== undefined && (!Number.isInteger(issue) || (issue as number) < 1)) {
    fail('"issue" must be a whole number from 1 (the newsletter issue)');
  }

  return {
    slug,
    title: text("title"),
    date,
    author: text("author"),
    summary: text("summary"),
    status: status as PostStatus,
    review: review as string[],
    ...(issue !== undefined ? { issue: issue as number } : {}),
    body: match[2].trim(),
  };
}

/** Every post file parsed, newest first (ties broken by slug). */
export function parsePosts(files: Record<string, string>): Post[] {
  return Object.entries(files)
    .map(([slug, raw]) => parsePost(slug, raw))
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/**
 * Published and not scheduled for later: `status: published` with a `date` still ahead (UTC) stays unlisted until that
 * day, so a post can be deployed in advance and appear on its date with no second deploy.
 */
export const isPublished = (post: Post, now: Date = new Date()): boolean =>
  post.status === "published" && post.date <= now.toISOString().slice(0, 10);

/** What a reader may see: published posts, plus drafts when previewing. */
export function visiblePosts(posts: Post[], preview: boolean, now: Date = new Date()): Post[] {
  return preview ? posts : posts.filter((post) => isPublished(post, now));
}

export function findPost(posts: Post[], slug: string, preview: boolean, now: Date = new Date()): Post | undefined {
  return visiblePosts(posts, preview, now).find((post) => post.slug === slug);
}

/** Published newsletter issues, newest first. */
export function publishedIssues(posts: Post[], now: Date = new Date()): Post[] {
  return posts.filter((post) => isPublished(post, now) && post.issue !== undefined);
}

/**
 * The words a post's share card carries: the title up to its first colon, so a long title still fits a card. A
 * newsletter issue ("From the archives, No. 1: the warnings were on the record") takes the part after the colon
 * instead: the card's subtitle already names the issue.
 */
export function cardTitle(post: Post): string {
  const colon = post.title.indexOf(": ");
  if (colon <= 12) return post.title;
  if (post.issue === undefined) return post.title.slice(0, colon);
  const rest = post.title.slice(colon + 2);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
