/**
 * The public highlights feed (decision 0023; design docs/design/2026-10-16-public-highlights-feed.md as amended by
 * its validation review; reportsthatmatter-bght.10.1 and .3).
 *
 * Write side, `publishMark`: after `POST /api/mark` has recorded a reader's mark in `marks`, the Worker checks the
 * words against the published report (in `waitUntil`, so the reader's 204 never waits for it) and, if they are
 * there, writes one row to `public_marks`. Every field of that row comes from the report, not from the client.
 *
 * Read side, `readRecent`: /highlights reads the newest rows of that one small table by rowid, a bounded read,
 * and groups them into passages in memory. The page is edge-cached for 5 minutes (src/index.ts).
 */
import { encodeAnchor, locate, selectorFor } from "../../assets/anchor.js";
import { extractParagraph } from "../templates/report";
import { resolveParagraph } from "./aliases";
import { contentFor, type ContentEnv, type ContentSource } from "./content";
import { delayMs, feedEnabled, isExcludedReport, verdictFor, type FeedEnv } from "./feed-policy";
import { isEditorActor, type MarkEvent, type MarksDB } from "./marks";
import { loadFragment, loadReportMeta } from "./prerendered";

/** A passage as `public_marks` stores it: everything taken from the report itself. */
export type VerifiedPassage = {
  paragraph: string;
  slug: string;
  sectionTitle: string;
  words: string;
  anchor: string;
  page: number | null;
};

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

/** The first heading of a section fragment, as plain text: fragments open with the section's own heading. */
export function fragmentTitle(fragment: string): string | null {
  const match = fragment.match(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/);
  if (!match) return null;
  const text = decodeEntities(match[2].replace(/<[^>]+>/g, ""))
    .replace(/¶/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** The printed page a paragraph starts on, from the renderer's `data-page` (as `pageOf` in ./editorial). */
function pageOf(fragment: string, id: string): number | null {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fragment.match(new RegExp(`<p id="${escaped}"[^>]*data-page="(\\d+)"`));
  return match ? Number(match[1]) : null;
}

/**
 * Find a mark's words in the published report and describe them in the report's own terms, or null when they are
 * not there.
 *
 * The common path reads one fragment, the section the client named, and never parses `meta.json`: a mark costs
 * about what a `?h=` quote link costs today. Only a mark from /full (section "") or one whose paragraph is no
 * longer in that section (an id that moved) reads meta to find the paragraph through the aliases.
 *
 * The client's `prefix`, `suffix` and `page` are used to find the words and then thrown away: the stored anchor
 * is rebuilt from the paragraph's own text either side, and the page is the paragraph's `data-page`.
 */
export async function verifyMark(
  content: ContentSource,
  event: Pick<MarkEvent, "section" | "paragraph" | "exact" | "prefix" | "suffix">
): Promise<VerifiedPassage | null> {
  let paragraph = event.paragraph;
  let slug = event.section;
  let fragment: string | null = null;

  if (slug && SLUG.test(slug)) {
    fragment = await loadFragment(content, slug);
    if (fragment && !fragment.includes(`<p id="${paragraph}"`)) fragment = null;
  }
  if (!fragment) {
    const meta = await loadReportMeta(content);
    if (!meta) return null;
    const target = resolveParagraph(meta, paragraph);
    if (!target) return null;
    paragraph = target.id;
    slug = target.slug;
    fragment = await loadFragment(content, slug);
    if (!fragment) return null;
  }

  const text = extractParagraph(fragment, paragraph);
  if (!text) return null;

  const found = locate(text, { prefix: event.prefix, exact: event.exact, suffix: event.suffix });
  if (!found || found.end <= found.start) return null;

  const words = text.slice(found.start, found.end);
  const anchor = encodeAnchor(selectorFor(text, found.start, found.end));
  if (!anchor) return null;

  return {
    paragraph,
    slug,
    sectionTitle: fragmentTitle(fragment) ?? slug,
    words,
    anchor,
    page: pageOf(fragment, paragraph),
  };
}

export type PublishEnv = ContentEnv & FeedEnv & { REPORTS_SOURCE?: string };

export type PublishOutcome =
  | "published"
  | "held"
  | "off"
  | "editor"
  | "excluded"
  | "unknown-report"
  | "duplicate"
  | "unverified"
  | "short"
  | "error";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Put a recorded mark into the public feed, if it may go there. Called only after `recordMark` returned "ok".
 *
 * Never throws: every failure (no table yet, D1 down, a fragment missing) is an outcome, so the `marks` insert
 * and the reader's 204 are untouched whatever happens here. `actorMarksBefore` is the count `recordMark`'s rate
 * limit already read (this actor's marks in this report in the last 24 hours, before this one).
 *
 * D1 cost when it publishes: one indexed read of this actor's marks in this report (the duplicate check, at most
 * the rate limit's 40 rows), the `report_versions` pointer when the content bucket is bound, and one row write.
 */
export async function publishMark(
  env: PublishEnv,
  db: MarksDB,
  event: MarkEvent,
  actor: string,
  actorMarksBefore: number,
  now: number,
  knownReports?: ReadonlySet<string>
): Promise<PublishOutcome> {
  try {
    if (!feedEnabled(env)) return "off";
    if (isEditorActor(actor)) return "editor";
    if (isExcludedReport(env, event.report)) return "excluded";
    const known = knownReports ?? (await registryIds(env));
    if (!known.has(event.report)) return "unknown-report";

    // The same reader marking the same words again today (a save, then a share) is one reader-day, not two.
    // `actor` already rotates daily; the day bound keeps the read on the (report, actor, created_at) index.
    const dayStart = now - (now % DAY_MS);
    const prior = await db
      .prepare(
        "SELECT 1 AS hit FROM marks WHERE report = ? AND actor = ? AND created_at >= ? AND created_at < ? AND paragraph = ? AND exact = ? LIMIT 1"
      )
      .bind(event.report, actor, dayStart, now, event.paragraph, event.exact)
      .first<{ hit: number }>();
    if (prior) return "duplicate";

    const passage = await verifyMark(await contentFor(env, event.report), event);
    if (!passage) return "unverified";

    const verdict = verdictFor(passage.words, actorMarksBefore);
    if (!verdict) return "short";

    await db
      .prepare(
        `INSERT INTO public_marks (report, paragraph, slug, section_title, words, anchor, page, created_at, status, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        event.report,
        passage.paragraph,
        passage.slug,
        passage.sectionTitle,
        passage.words,
        passage.anchor,
        passage.page,
        now,
        verdict.status,
        verdict.reason
      )
      .run();
    return verdict.status === "visible" ? "published" : "held";
  } catch {
    return "error";
  }
}

async function registryIds(env: PublishEnv): Promise<Set<string>> {
  const { loadRegistry } = await import("./registry");
  const sourceMode = env.REPORTS_SOURCE ?? (typeof process !== "undefined" ? process.env.REPORTS_SOURCE : undefined);
  const registry = await loadRegistry(sourceMode);
  return new Set(registry.reports.map((report) => report.id));
}

// ---------------------------------------------------------------------------------------------------------------
// Read side

/** One of the Editor's picks on /highlights, resolved at build time into src/generated/picks.ts (scripts/editorial.mjs). */
export type EditorPick = {
  report: string;
  slug: string;
  sectionTitle: string;
  paragraph: string;
  words: string;
  anchor: string | null;
  page: number | null;
};

/** A stored row, as /highlights reads it. */
export type PublicMarkRow = {
  id: number;
  report: string;
  paragraph: string;
  slug: string;
  section_title: string;
  words: string;
  anchor: string;
  page: number | null;
  created_at: number;
  status: string;
};

/** A passage on /highlights: one or more rows with the same report, paragraph and words. */
export type FeedPassage = {
  report: string;
  paragraph: string;
  slug: string;
  sectionTitle: string;
  words: string;
  anchor: string;
  page: number | null;
  /** Rows, which are reader-days (one reader marking the same words twice in a day is one row). */
  times: number;
  /** The latest mark, rounded down to the hour, so the page never ties a row to the minute someone pressed Save. */
  lastSeenHour: number;
};

/**
 * Rows read per /highlights cache miss: always exactly this many (or the table, while it is smaller). The filter
 * on status, delay and window is applied in memory, not in SQL, because `public_marks` has no index on them: a
 * `WHERE status = 'visible'` scan would read on past every hidden row (after `pnpm feed hide --all`, the whole
 * table) looking for enough visible ones.
 */
export const FEED_SCAN = 250;

export const FEED_LIMIT = 20;
export const FEED_PER_REPORT = 4;
export const FEED_WINDOW_DAYS = 30;
const HOUR_MS = 60 * 60 * 1000;

/** The newest rows of `public_marks`. Throws when the table is missing or D1 fails; the caller renders picks. */
export async function readRecentRows(db: MarksDB): Promise<PublicMarkRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, report, paragraph, slug, section_title, words, anchor, page, created_at, status
       FROM public_marks ORDER BY id DESC LIMIT ?`
    )
    .bind(FEED_SCAN)
    .all<PublicMarkRow>();
  return results;
}

/**
 * Rows into the passages /highlights shows, newest first: visible rows only, older than the delay and inside the
 * 30-day window, from reports still in the feed (so adding a report to FEED_EXCLUDE also hides its old rows);
 * one passage per paragraph (the most recent) and at most 4 of the 20 from any one report.
 */
export function feedPassages(rows: PublicMarkRow[], env: FeedEnv | undefined, now: number): FeedPassage[] {
  const latest = now - delayMs(env);
  const earliest = now - FEED_WINDOW_DAYS * DAY_MS;

  const groups = new Map<string, FeedPassage & { lastSeen: number }>();
  for (const row of rows) {
    if (row.status !== "visible") continue;
    if (row.created_at > latest || row.created_at < earliest) continue;
    if (isExcludedReport(env, row.report)) continue;
    const key = `${row.report}\u0000${row.paragraph}\u0000${row.words}`;
    const have = groups.get(key);
    if (have) {
      have.times += 1;
      have.lastSeen = Math.max(have.lastSeen, row.created_at);
      continue;
    }
    groups.set(key, {
      report: row.report,
      paragraph: row.paragraph,
      slug: row.slug,
      sectionTitle: row.section_title,
      words: row.words,
      anchor: row.anchor,
      page: row.page,
      times: 1,
      lastSeen: row.created_at,
      lastSeenHour: 0,
    });
  }

  const ordered = [...groups.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  const paragraphs = new Set<string>();
  const perReport = new Map<string, number>();
  const out: FeedPassage[] = [];
  for (const passage of ordered) {
    if (out.length >= FEED_LIMIT) break;
    const where = `${passage.report}\u0000${passage.paragraph}`;
    if (paragraphs.has(where)) continue;
    const n = perReport.get(passage.report) ?? 0;
    if (n >= FEED_PER_REPORT) continue;
    paragraphs.add(where);
    perReport.set(passage.report, n + 1);
    const { lastSeen, ...rest } = passage;
    out.push({ ...rest, lastSeenHour: lastSeen - (lastSeen % HOUR_MS) });
  }
  return out;
}

/** What /highlights shows of the readers' feed, or null when it is off or cannot be read (render picks only). */
export async function readFeed(db: MarksDB | undefined, env: FeedEnv | undefined, now: number): Promise<FeedPassage[] | null> {
  if (!db || !feedEnabled(env)) return null;
  try {
    return feedPassages(await readRecentRows(db), env, now);
  } catch {
    return null;
  }
}

/**
 * When, coarsely: "within the hour", "3 hours ago", "yesterday", "4 days ago", then the date ("12 Oct"). Computed
 * at request time from the stored hour, so a cached page's wording is at most the cache's age out of date.
 */
export function coarseTime(hour: number, now: number): string {
  const ago = Math.max(0, now - hour);
  if (ago < HOUR_MS) return "within the hour";
  const hours = Math.floor(ago / HOUR_MS);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.floor(ago / DAY_MS);
  if (days < 2) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const date = new Date(hour);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()];
  return `${date.getUTCDate()} ${month}`;
}
