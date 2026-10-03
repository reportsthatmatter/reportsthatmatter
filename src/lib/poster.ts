/**
 * The scheduled poster's logic (reportsthatmatter-y2t.4): which queue item is
 * due, whether it was already posted, and what to do about it. Pure and
 * network-free: the Bluesky calls sit behind `PosterClient`, implemented in
 * `scripts/post-next.mjs` with @atproto/api and faked in tests/poster.test.ts.
 *
 * The three promises, and where each is kept:
 *
 * - never double-posts: an item with `posted_url` is never selected; at most
 *   one item is posted per UTC day (`posted_at`); and before posting, the
 *   account's recent posts are searched for the item's deep link (or exact
 *   text). A post that went out but whose commit was lost is found there and
 *   its URL written back instead of posting a second time.
 * - fails loud: every problem throws (the script exits 1, the workflow goes
 *   red and GitHub emails the committer); nothing is swallowed or retried.
 * - dry-run: the default. Live needs `POSTER_LIVE=true` and both credentials.
 */
import { BLUESKY_GRAPHEME_LIMIT, graphemeLength, type QueueItem } from "./posts";

/** A queue row as the poster sees it: `posted_at` is added by the poster. */
export type PosterItem = QueueItem & { posted_at?: string | null };

/** What the poster reads back from the account's recent posts. */
export type FeedPost = {
  uri: string;
  /** The `https://bsky.app/profile/.../post/...` page for it. */
  url: string;
  text: string;
  /** The `app.bsky.embed.external` uri (link card), if any. */
  embedUri: string | null;
  createdAt: string;
};

export type PosterClient = {
  /** The account's own recent posts (replies and reposts excluded), newest first. */
  recentPosts(): Promise<FeedPost[]>;
  /** Posts the item with its link card and returns the new post. */
  publish(item: PosterItem): Promise<FeedPost>;
};

export type Mode = { live: boolean; hasCredentials: boolean; why: string };

/**
 * Live only when POSTER_LIVE is exactly "true" AND both credentials are
 * present. No credentials is never a failure: it is a dry run that makes no
 * network request at all. Asking for live without credentials is a
 * misconfiguration and throws (loudly, once a day, until fixed).
 */
export function decideMode(env: Record<string, string | undefined>): Mode {
  const hasCredentials = Boolean(env.BLUESKY_HANDLE?.trim() && env.BLUESKY_APP_PASSWORD?.trim());
  const wantsLive = (env.POSTER_LIVE ?? "").trim().toLowerCase() === "true";
  if (wantsLive && !hasCredentials) {
    throw new Error(
      "POSTER_LIVE is true but BLUESKY_HANDLE and/or BLUESKY_APP_PASSWORD are not set. " +
        "Add both repository secrets, or set the POSTER_LIVE variable back to false."
    );
  }
  if (wantsLive) return { live: true, hasCredentials, why: "POSTER_LIVE=true" };
  if (hasCredentials) {
    return { live: false, hasCredentials, why: "dry run (POSTER_LIVE is not true); credentials are used only to check the account's recent posts, read-only" };
  }
  return { live: false, hasCredentials, why: "dry run (no Bluesky credentials set): no network request is made" };
}

export type Selection =
  | { kind: "item"; item: PosterItem }
  | { kind: "none"; reason: string }
  | { kind: "already-today"; item: PosterItem };

/**
 * The next item: the first unposted one in `scheduled` order (queue order
 * breaks ties) whose date has arrived. Past-due items are not skipped, so a
 * missed day is made up one post at a time, never in a burst. At most one
 * item is posted per UTC day.
 */
export function selectNext(items: readonly PosterItem[], today: string): Selection {
  const postedToday = items.find((i) => i.posted_url && (i.posted_at ?? "").slice(0, 10) === today);
  if (postedToday) return { kind: "already-today", item: postedToday };

  const due = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.posted_url && item.scheduled <= today)
    .sort((a, b) => (a.item.scheduled < b.item.scheduled ? -1 : a.item.scheduled > b.item.scheduled ? 1 : a.index - b.index));
  if (due.length) return { kind: "item", item: due[0].item };

  const waiting = items.filter((i) => !i.posted_url).map((i) => i.scheduled).sort()[0];
  return { kind: "none", reason: waiting ? `nothing due until ${waiting}` : "the queue is empty or fully posted" };
}

/** Which of the account's recent posts is this item, if any: same deep link in its card, or the exact same text. */
export function findPosted(item: Pick<PosterItem, "link" | "text">, recent: readonly FeedPost[]): FeedPost | null {
  return recent.find((p) => p.embedUri === item.link || p.text.trim() === item.text.trim()) ?? null;
}

/** Checks everything about an item that would make Bluesky reject it or the post wrong, before any network call. */
export function validateItem(item: PosterItem, siteOrigin: string): void {
  const problems: string[] = [];
  const length = graphemeLength(item.text);
  if (length > BLUESKY_GRAPHEME_LIMIT) problems.push(`text is ${length} graphemes, over Bluesky's ${BLUESKY_GRAPHEME_LIMIT}`);
  if (!item.link.startsWith(`${siteOrigin}/`)) problems.push(`link is not on ${siteOrigin}: ${item.link}`);
  if (!/[?&]src=bsky(&|$)/.test(item.link)) problems.push("link has no src=bsky");
  if (!item.card) problems.push("no card image");
  if (problems.length) throw new Error(`Queue item ${item.id} is not postable: ${problems.join("; ")}`);
}

/** Title and description for the link card: the report's title and page from the source line, never any commentary. */
export function cardMeta(item: Pick<PosterItem, "text">): { title: string; description: string } {
  const source = item.text.split("\n").filter(Boolean).pop() ?? "";
  const m = /^—\s*(.+?),\s*p\.\s*(\d+)\s*$/.exec(source);
  return m
    ? { title: m[1], description: `Page ${m[2]}. Read the passage in context.` }
    : { title: "Reports that Matter", description: "Read the passage in context." };
}

export type Outcome =
  | { outcome: "nothing-due"; reason: string }
  | { outcome: "already-posted-today"; item: PosterItem }
  | { outcome: "dry-run"; item: PosterItem; wouldReconcile: FeedPost | null }
  | { outcome: "reconciled"; item: PosterItem; post: FeedPost }
  | { outcome: "posted"; item: PosterItem; post: FeedPost };

export type RunResult = { queue: PosterItem[]; changed: boolean } & Outcome;

/**
 * One run of the poster. Never mutates its input: returns the queue to write
 * back (changed only for `posted` and `reconciled`). `client` may be null only
 * for a dry run without credentials.
 */
export async function runPoster(params: {
  queue: readonly PosterItem[];
  today: string;
  mode: Mode;
  client: PosterClient | null;
  siteOrigin: string;
  now?: () => Date;
}): Promise<RunResult> {
  const { queue, today, mode, client, siteOrigin } = params;
  const now = params.now ?? (() => new Date());
  const unchanged = { queue: queue.map((i) => ({ ...i })), changed: false };

  if (mode.live && !client) throw new Error("Live mode needs a Bluesky client.");

  const picked = selectNext(queue, today);
  if (picked.kind === "none") return { ...unchanged, outcome: "nothing-due", reason: picked.reason };
  if (picked.kind === "already-today") return { ...unchanged, outcome: "already-posted-today", item: picked.item };

  const item = picked.item;
  validateItem(item, siteOrigin);

  const write = (post: FeedPost) => {
    const next = queue.map((i) => (i.id === item.id ? { ...i, posted_url: post.url, posted_at: post.createdAt || now().toISOString() } : { ...i }));
    return { queue: next, changed: true, item: next.find((i) => i.id === item.id)! };
  };

  // Idempotency, second layer: ask the account itself. Done in dry runs too
  // when credentials exist, so a dry run also proves the secrets work.
  const existing = client ? findPosted(item, await client.recentPosts()) : null;

  if (existing) {
    if (!mode.live) return { ...unchanged, outcome: "dry-run", item, wouldReconcile: existing };
    return { ...write(existing), outcome: "reconciled", post: existing };
  }
  if (!mode.live) return { ...unchanged, outcome: "dry-run", item, wouldReconcile: null };

  const post = await client!.publish(item);
  return { ...write(post), outcome: "posted", post };
}
