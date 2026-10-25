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
 * - not early: a live run before `notBefore` (13:00 UTC by default) posts
 *   nothing, so the several scheduled runs a day and an early manual run
 *   cannot post ahead of the intended hour.
 * - fails loud: every problem throws (the script exits 1, the workflow goes
 *   red and GitHub emails the committer); nothing is swallowed or retried.
 * - dry-run: the default. Live needs `POSTER_LIVE=true` and both credentials.
 */
import { BLUESKY_GRAPHEME_LIMIT, graphemeLength, isBlackout, type QueueItem } from "./posts";

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
        "Add both credentials, or set marketing/poster-live.yaml back to `live: false`."
    );
  }
  if (wantsLive) return { live: true, hasCredentials, why: "POSTER_LIVE=true" };
  if (hasCredentials) {
    return { live: false, hasCredentials, why: "dry run (POSTER_LIVE is not true); credentials are used only to check the account's recent posts, read-only" };
  }
  return { live: false, hasCredentials, why: "dry run (no Bluesky credentials set): no network request is made" };
}

/** The UTC day (YYYY-MM-DD) of a timestamp, whatever offset it was written with; "" if absent or unparseable. */
function utcDay(ts: string | null | undefined): string {
  const t = ts ? Date.parse(ts) : NaN;
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

export type Selection =
  | { kind: "item"; item: PosterItem }
  | { kind: "none"; reason: string }
  | { kind: "already-today"; item: PosterItem };

/**
 * The next item: the first unposted one in `scheduled` order (queue order
 * breaks ties) whose date has arrived. Past-due items are not skipped, so a
 * missed day is made up one post at a time, never in a burst. At most one
 * item is posted per UTC day. An item still waiting for its hook
 * (`needs_hook`, no `hook`) is skipped, not posted and not a stop: its text
 * is the over-length quote form, which `validateItem` refuses, and one such
 * item must not halt every later post (reportsthatmatter-irro). Once its hook
 * is written it is the oldest due item again and posts next.
 */
export function selectNext(items: readonly PosterItem[], today: string): Selection {
  const postedToday = items.find((i) => i.posted_url && utcDay(i.posted_at) === today);
  if (postedToday) return { kind: "already-today", item: postedToday };
  // A kept-clear day (posts.ts isBlackout) posts nothing, not even an item overdue from a missed day before it.
  if (isBlackout(today)) return { kind: "none", reason: `${today} is a kept-clear date: nothing is posted` };

  const due = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.posted_url && item.scheduled <= today && !awaitsHook(item))
    .sort((a, b) => (a.item.scheduled < b.item.scheduled ? -1 : a.item.scheduled > b.item.scheduled ? 1 : a.index - b.index));
  if (due.length) return { kind: "item", item: due[0].item };

  const skipped = items.filter((i) => !i.posted_url && i.scheduled <= today && awaitsHook(i)).map((i) => i.id);
  const waiting = items.filter((i) => !i.posted_url && !awaitsHook(i)).map((i) => i.scheduled).sort()[0];
  const why = waiting ? `nothing due until ${waiting}` : "the queue is empty or fully posted";
  return { kind: "none", reason: skipped.length ? `${why} (skipped, waiting for a hook: ${skipped.join(", ")})` : why };
}

/** Queued only to carry a hook (its quote form is over the limit) and none is written yet: not postable (f9we, irro). */
export function awaitsHook(item: Pick<PosterItem, "needs_hook" | "hook">): boolean {
  return item.needs_hook === true && !item.hook?.trim();
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

/** The earliest UTC time of day (HH:MM) a live run may post. Scheduled runs fire after it; a run before it waits. */
export const DEFAULT_NOT_BEFORE = "13:00";

/** True when `now` (UTC) is earlier in its day than `notBefore` ("HH:MM"). A malformed `notBefore` throws. */
export function isTooEarly(now: Date, notBefore: string): boolean {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(notBefore.trim());
  if (!m) throw new Error(`POSTER_NOT_BEFORE must be HH:MM in UTC, got "${notBefore}"`);
  return now.getUTCHours() * 60 + now.getUTCMinutes() < Number(m[1]) * 60 + Number(m[2]);
}

export type Outcome =
  | { outcome: "too-early"; item: PosterItem; notBefore: string }
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
  /** Live runs earlier than this UTC time of day (HH:MM) post nothing. Unset: no gate (the script passes DEFAULT_NOT_BEFORE). Dry runs are never gated, so a rehearsal at any hour shows the post. */
  notBefore?: string;
}): Promise<RunResult> {
  const { queue, today, mode, client, siteOrigin } = params;
  const now = params.now ?? (() => new Date());
  const unchanged = { queue: queue.map((i) => ({ ...i })), changed: false };

  if (mode.live && !client) throw new Error("Live mode needs a Bluesky client.");

  const picked = selectNext(queue, today);
  if (picked.kind === "none") return { ...unchanged, outcome: "nothing-due", reason: picked.reason };
  if (picked.kind === "already-today") return { ...unchanged, outcome: "already-posted-today", item: picked.item };

  const item = picked.item;
  // With no client (a dry run without credentials) this is the item; otherwise only the item chosen after the account
  // check is validated, so a post already made is recorded even if its queue row would no longer pass.
  if (!client) validateItem(item, siteOrigin);

  // The schedule fires several times a day (GitHub starts runs late, so one cron is not enough); this keeps any
  // of them from posting before the intended hour, e.g. a run on launch morning before the post is due.
  if (mode.live && params.notBefore && isTooEarly(now(), params.notBefore)) {
    return { ...unchanged, outcome: "too-early", item, notBefore: params.notBefore };
  }

  if (!client) return { ...unchanged, outcome: "dry-run", item, wouldReconcile: null };

  // Idempotency, second layer: ask the account itself (in dry runs too, so a dry run also proves the secrets work).
  // Every queue item found among the account's recent posts counts as posted at that post's time (overlayAccount),
  // so the decision is the same whichever poster makes it: the Worker, which never writes the queue, or a GitHub
  // run whose queue is behind (a lost commit, a missed day, or a queue edit that hid an item from the Worker).
  const recent = await client.recentPosts();
  const overlaid = overlayAccount(queue, recent, now().toISOString());
  const found = overlaid.filter((i, n) => i.posted_url && !queue[n].posted_url);
  const again = selectNext(overlaid, today);
  const reconciledToday = again.kind === "already-today" && found.some((i) => i.id === again.item.id) ? again.item : null;

  if (!mode.live) {
    if (reconciledToday) return { ...unchanged, outcome: "dry-run", item: reconciledToday, wouldReconcile: recent.find((p) => p.url === reconciledToday.posted_url)! };
    if (again.kind === "item") return { ...unchanged, outcome: "dry-run", item: again.item, wouldReconcile: null };
    return { ...unchanged, outcome: "nothing-due", reason: again.kind === "none" ? again.reason : "already posted today" };
  }

  const recorded = { queue: overlaid, changed: found.length > 0 };
  if (again.kind === "already-today") {
    const post = recent.find((p) => p.url === again.item.posted_url);
    return post ? { ...recorded, outcome: "reconciled", item: again.item, post } : { ...recorded, outcome: "already-posted-today", item: again.item };
  }
  if (again.kind === "none") {
    // Only earlier days' posts were found: recorded; nothing more is due today.
    return { ...recorded, outcome: "nothing-due", reason: again.reason };
  }
  validateItem(again.item, siteOrigin);
  const post = await client.publish(again.item);
  const next = overlaid.map((i) => (i.id === again.item.id ? { ...i, posted_url: post.url, posted_at: post.createdAt || now().toISOString() } : i));
  return { queue: next, changed: true, outcome: "posted", item: next.find((i) => i.id === again.item.id)!, post };
}

/**
 * The queue as the account says it is: every unposted item found among the account's recent posts gets that post's
 * `posted_url` and `posted_at`. The Worker poster (workers/poster/) cannot write the queue back, and the GitHub run
 * that records its posts may be hours or days late, so the Worker decides from this view: an item it posted
 * yesterday is not selected again, and today's post counts as today's. Never mutates its input.
 */
export function overlayAccount(queue: readonly PosterItem[], recent: readonly FeedPost[], fallbackTime = new Date().toISOString()): PosterItem[] {
  return queue.map((i) => {
    if (i.posted_url) return { ...i };
    const p = findPosted(i, recent);
    // A post with no readable time counts as now: the safe direction (it holds back today's post, never doubles one).
    return p ? { ...i, posted_url: p.url, posted_at: p.createdAt || fallbackTime } : { ...i };
  });
}

/** Where the one on/off switch lives, read by both posters: the workflow from its checkout, the Worker from GitHub. */
export const SWITCH_PATH = "marketing/poster-live.yaml";

/**
 * Parses the switch file. Live only for `live: true` exactly; anything else, including a file that will not parse,
 * is off (the caller fails loudly on a fetch error rather than reading that as off, so a GitHub outage is visible).
 */
export function readSwitch(yamlText: string): boolean {
  const m = /^live:\s*(\S+)\s*(#.*)?$/m.exec(yamlText);
  return m?.[1] === "true";
}
