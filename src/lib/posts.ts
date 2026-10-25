/**
 * Builds the Bluesky posting queue from approved excerpts
 * (reportsthatmatter-y2t.3): `marketing/queue.yaml`, one item per excerpt,
 * with the Appendix C text, a card image, a `?p=` deep link, a scheduled
 * date and a `posted_url` a scheduled poster (y2t.4) writes back.
 *
 * `scripts/posts.mjs` is the CLI: it collects candidates from every approved
 * `editorial/<id>.yaml`'s `card: true` highlights, plus the legacy curated
 * quotes in `docs/share-quotes.yaml`, then calls the functions here. All the
 * quote-verbatim and paragraph-id checking is the same `placeQuote` /
 * `citationHref` / `pageOf` machinery `src/lib/editorial.ts` uses — nothing
 * here re-implements that check, only reuses it.
 */
import { createHash } from "node:crypto";
import { comparable, placeQuote, citationHref, pageOf } from "./editorial";
import { findText, selectorFor, decodeAnchor } from "../../assets/anchor.js";
import { quoteCardId, CARD_QUOTE_LIMIT } from "./card-key";
import { tierCMatch } from "./tier-c";

/** Bluesky posts are rejected past this many graphemes. */
export const BLUESKY_GRAPHEME_LIMIT = 300;

/** Correct length for the 300-grapheme limit: code points can over-count (flags, combining marks); UTF-16 units worse. */
export function graphemeLength(text: string): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...segmenter.segment(text)].length;
}

/** `YYYY-MM-DD` for a JS Date, in UTC — the queue's dates are calendar days, not instants. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/**
 * Stable across reruns regardless of file order: two candidates are the same
 * post iff they quote the same paragraph of the same report with the same
 * words (`comparable`, so rewrapping a line in the yaml doesn't change the
 * id). A different quote from the same paragraph is a different post.
 */
export function candidateId(report: string, paragraph: string, quote: string): string {
  const hash = createHash("sha1").update(comparable(quote)).digest("hex").slice(0, 8);
  return `${report}:${paragraph}:${hash}`;
}

/** A quote worth posting, before it has been checked against the report. */
export type PostCandidate = {
  report: string;
  reportTitle: string;
  /** The registry's `common_name`: the short name a hooked post's source line uses (falls back to the title). */
  sourceTitle?: string;
  paragraph: string;
  quote: string;
  /**
   * `scripts/cards.mjs` renders one curated card per `docs/share-quotes.yaml`
   * entry, keyed only by `report/paragraph` — not by the exact wording. A
   * paragraph can carry a different, newer excerpt in `editorial/<id>.yaml`
   * (this project's authoritative layer), and reusing that older card would
   * caption a card with words it doesn't show. So only a `share-quotes`
   * candidate — the thing that card was actually rendered from — may claim
   * the specific card; an `editorial` one always gets the report's default.
   */
  origin: "editorial" | "share-quotes";
  /** The report's registry `context_line`, appended to the post (strategy section 8: a context line on every post from an affected-community report). */
  contextLine?: string;
};

/** `report/paragraph` (a curated card) or `report/default` — as `src/generated/cards.ts` records them. */
export type CardLookup = ReadonlySet<string>;

/** A candidate, checked and ready to schedule. */
export type ResolvedPost = {
  id: string;
  report: string;
  paragraph: string;
  quote: string;
  text: string;
  link: string;
  card: string;
  /** True when no card was rendered for this exact quote and the report's plain default card is used instead. */
  cardIsDefault: boolean;
  /** What a hooked post's source line is built from (`formatHooked`). */
  page?: number;
  sourceTitle?: string;
  contextLine?: string;
  /**
   * The quote form of the post is over Bluesky's limit, but a quote card carries the whole quote legibly, so the item can
   * still be queued: only as a hooked post (the hook in place of the quote). Its `text` stays the quote form and cannot post
   * (reportsthatmatter-f9we).
   */
  needsHook?: boolean;
};

/**
 * The quote wrapped in outer double quotes collides with any straight double
 * quote already inside it (a quotation within the quotation — Trump's own
 * words, say) — `"...he replied "So what?""` reads as three quotes, not one.
 * Standard nesting fixes it: typographic outer quotes, and every inner
 * straight double quote alternates to an opening or closing single quote
 * (typographic “ ” inside become ‘ ’).
 * Only the *display* text changes — the quote used for the verbatim check
 * and the `?h=` anchor is untouched, so this never risks misquoting.
 */
function nestQuotes(quote: string): string {
  let opening = true;
  const inner = quote
    .replace(/"/g, () => {
      const mark = opening ? "‘" : "’";
      opening = !opening;
      return mark;
    })
    // A report set in curly quotes (January 6th) nests the same way: “ ” inside become ‘ ’.
    .replace(/“/g, "‘")
    .replace(/”/g, "’");
  return `“${inner}”`;
}

/**
 * Appendix C's excerpt format (`docs/plans/2026-08-02-launch-and-seo.md`):
 * the verbatim quote, then a neutral, always-page-numbered source line. No
 * commentary, ever — that rule is enforced by never taking a "why this
 * matters" field here, only the quote and the citation.
 */
export function formatPost(quote: string, reportTitle: string, page: number, contextLine?: string): string {
  const post = `${nestQuotes(quote.trim())}\n\n— ${reportTitle}, p. ${page}`;
  return contextLine?.trim() ? `${post}\n\n${contextLine.trim()}` : post;
}

/**
 * The post when a person has written a `hook` for the item (the post-writing skill): the hook, then the source line
 * with the report's short name and page, then the context line. The quote is not repeated: the card image under the
 * post carries it. The source line keeps the form `cardMeta` (src/lib/poster.ts) reads the link card's title from.
 */
export function formatHooked(hook: string, sourceTitle: string, page: number, contextLine?: string): string {
  const post = `${hook.trim()}\n\n— ${sourceTitle}, p. ${page}`;
  return contextLine?.trim() ? `${post}\n\n${contextLine.trim()}` : post;
}

/** The least room a hooked post must leave for the hook itself (graphemes), or a "needs hook" item could never be written. */
export const MIN_HOOK_ROOM = 80;

/**
 * Checks one candidate against the report's pre-rendered text and resolves
 * it to a postable item, or explains why it can't be posted. Never throws:
 * one bad candidate is a line in a problem list, not a crashed build.
 */
export function resolveCandidate(
  candidate: PostCandidate,
  html: string,
  cards: CardLookup,
  siteOrigin: string
): { ok: true; item: ResolvedPost } | { ok: false; problem: string } {
  const where = `${candidate.report}/${candidate.paragraph}`;

  const placed = placeQuote(html, candidate.paragraph, candidate.quote);
  if (!placed.ok) return { ok: false, problem: `${where}: ${placed.reason}` };

  const page = pageOf(html, candidate.paragraph);
  if (page === null) {
    return { ok: false, problem: `${where}: no page number on that paragraph — Appendix C requires one` };
  }

  const href = placed.inParagraph
    ? citationHref(candidate.report, candidate.paragraph, placed.paragraph, candidate.quote)
    : citationHref(candidate.report, candidate.paragraph);

  // The card for exactly these words, when `pnpm cards` rendered one (an
  // editor's card: true highlight, f2e) — the same card the site advertises
  // for this post's link. Then a share-quotes paragraph card, for the
  // candidate it was made from. Then the report's default.
  let words: string | null = null;
  if (placed.inParagraph) {
    const text = comparable(placed.paragraph);
    const found = findText(text, comparable(candidate.quote));
    if (found) words = selectorFor(text, found.start, found.end).exact;
  }
  const quoteCard = words ? quoteCardId(candidate.paragraph, words) : null;
  const specific =
    quoteCard && cards.has(`${candidate.report}/${quoteCard}`)
      ? quoteCard
      : candidate.origin === "share-quotes" && cards.has(`${candidate.report}/${candidate.paragraph}`)
        ? candidate.paragraph
        : null;
  // The page reads `?h=` back (decoded once by the server, then by decodeAnchor) and looks the card up by those words. A link
  // whose words do not come back the same (a "%" in the quote, a quote over MAX_EXACT named by its ends) previews with the
  // default card instead of the one the post uploads: refuse it rather than queue a post whose link card differs.
  if (specific === quoteCard && quoteCard && placed.inParagraph) {
    const read = decodeAnchor(new URL(href, siteOrigin).searchParams.get("h") ?? "")?.exact;
    if (!read || quoteCardId(candidate.paragraph, read) !== quoteCard) {
      return { ok: false, problem: `${where}: its ?h= link does not read back as the card's words (a "%" or over 300 characters in the quote), so the link would preview with the default card` };
    }
  }
  const cardIsDefault = specific === null;
  if (cardIsDefault && !cards.has(`${candidate.report}/default`)) {
    return { ok: false, problem: `${where}: no card image at all — run pnpm cards` };
  }
  const card = `assets/cards/${candidate.report}/${specific ?? "default"}.png`;

  const text = formatPost(candidate.quote, candidate.reportTitle, page, candidate.contextLine);
  const length = graphemeLength(text);
  // Over the limit in quote form. A hooked post omits the quote, so it can still be queued when the card carries the
  // whole quote: a card rendered for exactly these words (not the plain default) and short enough that cards.mjs does not
  // cut it. Otherwise it is skipped, as ever; the quote is never trimmed.
  const needsHook = length > BLUESKY_GRAPHEME_LIMIT;
  if (needsHook) {
    // The hooked post keeps the source line and the context line; the hook gets what is left.
    const fixed = graphemeLength(formatHooked("", candidate.sourceTitle?.trim() || candidate.reportTitle, page, candidate.contextLine));
    const why = cardIsDefault
      ? `no quote card for these words, and the default card does not carry the quote — run pnpm cards`
      : graphemeLength(candidate.quote.trim()) > CARD_QUOTE_LIMIT
        ? `the quote is over ${CARD_QUOTE_LIMIT} characters, so its card would be cut`
        : BLUESKY_GRAPHEME_LIMIT - fixed < MIN_HOOK_ROOM
          ? `the source and context lines leave under ${MIN_HOOK_ROOM} graphemes for a hook`
          : null;
    if (why) {
      return {
        ok: false,
        problem: `${where}: ${length} graphemes, over Bluesky's ${BLUESKY_GRAPHEME_LIMIT} limit (quote can't be trimmed — verbatim only); not queued as a hooked post: ${why}`,
      };
    }
  }

  const link = `${siteOrigin}${href}${href.includes("?") ? "&" : "?"}src=bsky`;

  return {
    ok: true,
    item: {
      id: candidateId(candidate.report, candidate.paragraph, candidate.quote),
      report: candidate.report,
      paragraph: candidate.paragraph,
      quote: candidate.quote.trim(),
      text,
      link,
      card,
      cardIsDefault,
      page,
      sourceTitle: candidate.sourceTitle?.trim() || candidate.reportTitle,
      contextLine: candidate.contextLine?.trim() || undefined,
      ...(needsHook ? { needsHook: true } : {}),
    },
  };
}

/** The comment block at the top of `marketing/queue.yaml`, written by `pnpm posts` and by the poster. */
export const QUEUE_HEADER = `# Generated by \`pnpm posts\` (reportsthatmatter-y2t.3) — do not hand-edit \`scheduled\`
# or \`posted_url\`. Re-running never moves an existing item's date or clears a
# posted_url the scheduled poster (y2t.4, \`pnpm post-next\`) has written back; it
# only appends new excerpts. The poster also records \`posted_at\`. See
# src/lib/posts.ts (buildQueue) for exactly what that means.
`;

/** A row in `marketing/queue.yaml`. */
export type QueueItem = {
  id: string;
  report: string;
  paragraph: string;
  quote: string;
  text: string;
  link: string;
  card: string;
  scheduled: string;
  posted_url: string | null;
  /**
   * Hand-written by the post-writing skill: the context and hook that post in place of the quote (the card image
   * carries the quote). When set, `text` is built from it (`formatHooked`); `pnpm posts` never writes or clears it.
   */
  hook?: string | null;
  /**
   * Set by `pnpm posts`, never by hand: the quote form of this item is over Bluesky's limit and no `hook` is written yet,
   * so it cannot post. `pnpm posts --check` fails it once its date arrives (`needsHookViolations`). Cleared on the next
   * run after a hook is written.
   */
  needs_hook?: true;
};

/** Items that cannot post until a person writes a hook, with their dates (a notice); the ones due by `today` fail `--check`. */
export function needsHookViolations(queue: readonly QueueItem[], today: string): { waiting: QueueItem[]; due: string[] } {
  const waiting = queue.filter((i) => !i.posted_url && i.needs_hook && !i.hook?.trim());
  return {
    waiting,
    due: waiting
      .filter((i) => i.scheduled <= today)
      .map((i) => `${i.id}: scheduled ${i.scheduled} with no hook; its post in quote form is over Bluesky's ${BLUESKY_GRAPHEME_LIMIT} (write a hook, or re-date it in a PR)`),
  };
}

// ---------- who may reach the queue (reportsthatmatter-63cd, 80qf) ----------
//
// Strategy section 8, decided by Rufus on 2026-10-16. Two registry-driven rules, applied by `scripts/posts.mjs`
// before a candidate is resolved and again by `buildQueue`, so `pnpm posts --check` fails a queue that breaks them.

/** The registry fields the posting rules read, per report. */
export type ReportPolicy = {
  /** `affected_community: true`: only Tier A reaches the queue. */
  affected: boolean;
  /** `news_day_only: true`: never scheduled on an ordinary day; held for a person to post on the report's news day. */
  newsDayOnly: boolean;
  /** `context_line`: appended to every post from the report. */
  contextLine?: string;
};

export function reportPolicies(registry: {
  reports: Array<{ id: string; affected_community?: boolean; news_day_only?: boolean; context_line?: string }>;
}): Map<string, ReportPolicy> {
  return new Map(
    registry.reports.map((r) => [
      r.id,
      { affected: r.affected_community === true, newsDayOnly: r.news_day_only === true, contextLine: r.context_line?.trim() || undefined },
    ])
  );
}

export type Tier = "A" | "B" | "C";

/**
 * Strategy section 8's tiers for a highlight in an affected-community report. C is machine-checked (the word list and the
 * file's `private_people:`); A is a person's judgement, recorded as `tier: A` on the highlight (the grammatical subject is
 * an institution, the verb says what it did, knew or failed to do, and the sentence stands alone); everything else is B.
 * An unmarked highlight is therefore B, never A: the poster refuses anything that is not Tier A.
 */
export function tierOf(quote: string, marked?: string, privatePeople: readonly string[] = []): Tier {
  if (tierCMatch(quote, privatePeople)) return "C";
  return marked === "A" ? "A" : "B";
}

export type Eligibility = { ok: true } | { ok: false; kind: "tier-b" | "news-day"; reason: string };

/**
 * Whether an automated post may be scheduled from this candidate. Tier C is refused earlier (tier-c.ts, a skipped
 * candidate); here: an affected-community report's unmarked or Tier B highlight stays on the page and for a person to post
 * with a context line, and a news-day-only report's items are held. Both are policy, not defects: they are listed, not failures.
 */
export function posterEligibility(
  candidate: { report: string; quote: string; tier?: string; privatePeople?: readonly string[] },
  policies: ReadonlyMap<string, ReportPolicy>
): Eligibility {
  const policy = policies.get(candidate.report);
  if (!policy) return { ok: true };
  if (policy.newsDayOnly) return { ok: false, kind: "news-day", reason: "news-day-only report (80qf): held for a person to post on the report's news day" };
  if (policy.affected && tierOf(candidate.quote, candidate.tier, candidate.privatePeople) !== "A") {
    return { ok: false, kind: "tier-b", reason: "Tier B in an affected-community report (63cd): not marked `tier: A`, so text only, posted by a person with a context line" };
  }
  return { ok: true };
}

// ---------- scheduling rules (reportsthatmatter-ay85) ----------
//
// Rules about *when* an item goes out, kept here so a later `pnpm posts` (new
// excerpts, `--start` re-dating) cannot undo them by accident. They come from
// the marketing strategy (marketing repo, strategy/2026-10-strategy.md section 8)
// and the affected-community review of 9 Oct 2026.
//
// The tier rule (strategy section 8) is checked in src/lib/tier-c.ts: `pnpm editorial` warns on a Tier C card: true
// in an affected_community report and `pnpm posts` lists them. TIER_C_IS_FAILURE there is the one constant 63cd
// (needs-user) flips to make it a failure and have the poster refuse them. Tier B is not checkable by machine.

/** Reports whose items are spaced at least SPACING_DAYS apart: heavy subjects, never two in a fortnight. */
export const SPACED_REPORTS: readonly string[] = ["uk-post-office-horizon-inquiry", "uk-grenfell-tower-inquiry"];
export const SPACING_DAYS = 14;

/** Kept-clear dates, every year, as inclusive `MM-DD` bounds: nothing is scheduled 18 December to 2 January. */
export const BLACKOUT = { from: "12-18", to: "01-02" } as const;

/**
 * Single kept-clear days, every year (`MM-DD`; strategy, "Dates we keep clear": nothing from us on them). 23 Oct: the Soldier F
 * acquittal; 23 Nov: Litvinenko's death; 6 Jan: the Capitol (the strategy allows one plain excerpt at most: the poster posts none);
 * 28 Jan: Challenger, NASA Day of Remembrance; 30 Jan: Bloody Sunday.
 */
export const KEPT_CLEAR_DAYS: readonly string[] = ["10-23", "11-23", "01-06", "01-28", "01-30"];

/** The queue opens with an excerpt from this report, on the queue's start date. */
export const OPENING_REPORT = "challenger-accident";

/** `report/paragraph` already shown an hour earlier in the org launch thread (post 3): the first automated post must be a different passage. */
export const OPENING_AVOID: readonly string[] = ["challenger-accident/committee-found-nasa-s-drive"];

/** Quoted only on their own news days, and never first (strategy section 8, D4). */
export const NEVER_FIRST_REPORTS: readonly string[] = ["jack-smith-vol1", "us-jan6-committee", "uk-chilcot-inquiry"];

export function isBlackout(date: string): boolean {
  const md = date.slice(5);
  return md >= BLACKOUT.from || md <= BLACKOUT.to || KEPT_CLEAR_DAYS.includes(md);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/**
 * Dates `items` (in the order given, which is a preference, not a promise)
 * one per day from `start`, honouring the rules above: no blackout day; no two
 * items of a SPACED_REPORTS report within SPACING_DAYS of each other or of a
 * `fixed` (already dated or posted) one; with `opening`, the first item is an
 * OPENING_REPORT excerpt (or, if the queue has none, at least not a
 * NEVER_FIRST_REPORTS one), dated `start`. A day on which only spaced items
 * remain and none is allowed is left empty rather than breaking the spacing.
 */
export function scheduleItems<T extends { report: string }>(
  items: readonly T[],
  start: string,
  fixed: readonly { report: string; scheduled: string }[] = [],
  opening = false
): (T & { scheduled: string })[] {
  const remaining = [...items];
  if (opening && remaining.length) {
    const fresh = (i: T) => !OPENING_AVOID.includes(`${i.report}/${(i as { paragraph?: string }).paragraph}`);
    const at = remaining.findIndex((i) => i.report === OPENING_REPORT && fresh(i));
    const first = at >= 0 ? at : remaining.findIndex((i) => !NEVER_FIRST_REPORTS.includes(i.report));
    if (first > 0) remaining.unshift(...remaining.splice(first, 1));
  }
  const placed: { report: string; scheduled: string }[] = [...fixed];
  const out: (T & { scheduled: string })[] = [];
  let day = start;
  while (remaining.length) {
    if (isBlackout(day)) {
      day = addDays(day, 1);
      continue;
    }
    const today = day;
    const at = remaining.findIndex(
      (i) =>
        !SPACED_REPORTS.includes(i.report) ||
        placed.every((p) => p.report !== i.report || daysBetween(p.scheduled, today) >= SPACING_DAYS)
    );
    if (at >= 0) {
      const [item] = remaining.splice(at, 1);
      placed.push({ report: item.report, scheduled: today });
      out.push({ ...item, scheduled: today });
    }
    day = addDays(day, 1);
  }
  return out;
}

/**
 * The rule breaks in a queue, as readable lines (empty when it is clean).
 * Only not-yet-posted items can break a rule: a posted one already happened.
 * `pnpm posts --check` fails on any, so a hand-edited date is caught.
 */
export function queueViolations(queue: readonly QueueItem[], newsDayOnly: readonly string[] = []): string[] {
  const problems: string[] = [];
  for (const i of queue.filter((i) => !i.posted_url && newsDayOnly.includes(i.report))) {
    problems.push(`${i.id}: ${i.report} is quoted only on its own news days, never scheduled (${i.scheduled})`);
  }
  for (const i of queue.filter((i) => !i.posted_url)) {
    if (isBlackout(i.scheduled)) problems.push(`${i.id}: scheduled ${i.scheduled}, on a kept-clear date (${BLACKOUT.from} to ${BLACKOUT.to}, or ${KEPT_CLEAR_DAYS.join(", ")})`);
  }
  for (const report of SPACED_REPORTS) {
    const dated = queue.filter((i) => i.report === report).sort((a, b) => a.scheduled.localeCompare(b.scheduled));
    for (let n = 1; n < dated.length; n++) {
      if (dated[n].posted_url) continue;
      const gap = daysBetween(dated[n - 1].scheduled, dated[n].scheduled);
      if (gap < SPACING_DAYS) problems.push(`${dated[n].id}: ${gap} day(s) after ${dated[n - 1].scheduled}, under ${SPACING_DAYS} for ${report}`);
    }
  }
  const first = [...queue].sort((a, b) => a.scheduled.localeCompare(b.scheduled))[0];
  if (first && !queue.some((i) => i.posted_url)) {
    if (queue.some((i) => i.report === OPENING_REPORT) && first.report !== OPENING_REPORT) problems.push(`${first.id}: the queue opens with ${first.report}, not ${OPENING_REPORT}`);
    if (NEVER_FIRST_REPORTS.includes(first.report)) problems.push(`${first.id}: ${first.report} is never the first item`);
  }
  return problems;
}

/**
 * Interleaves candidates across reports in `reportOrder`, taking each
 * report's next candidate in turn (round-robin) rather than exhausting one
 * report before moving to the next. A report with no candidates left is
 * skipped; a candidate for a report not in `reportOrder` is appended after
 * all the named reports, in the order it was seen.
 */
export function roundRobin<T extends { report: string }>(items: T[], reportOrder: readonly string[]): T[] {
  const byReport = new Map<string, T[]>();
  for (const item of items) {
    const bucket = byReport.get(item.report);
    if (bucket) bucket.push(item);
    else byReport.set(item.report, [item]);
  }
  const order = [...reportOrder, ...[...byReport.keys()].filter((r) => !reportOrder.includes(r))];

  const out: T[] = [];
  let remaining = items.length;
  while (remaining > 0) {
    for (const report of order) {
      const bucket = byReport.get(report);
      if (bucket && bucket.length) {
        out.push(bucket.shift()!);
        remaining--;
      }
    }
  }
  return out;
}

/**
 * Builds the queue: append-only and idempotent. Every existing item is kept
 * exactly as written — its `scheduled` date and `posted_url` are never
 * touched by a rerun, which is what lets a scheduled poster's commit and a
 * fresh `pnpm posts` coexist. Only candidates not already in the queue
 * (matched by `id`, which already accounts for a rewrapped line and rejects
 * a genuinely edited quote) are added, one per calendar day starting the day
 * after whatever was last scheduled, round-robin across reports —
 * reportsthatmatter-y2t.5's calendar has no themed-run data yet; when it
 * does, this is where a themed order plugs in ahead of the round-robin.
 *
 * An existing, not-yet-posted item whose id no longer resolves (its source
 * quote or paragraph moved or was withdrawn) is `staleUnposted` — the caller
 * should fail loud, the same way a moved citation fails everywhere else in
 * this project. One already posted is `stalePosted`: it already happened,
 * so it is a warning, not a build failure.
 */
export function buildQueue(params: {
  resolved: ResolvedPost[];
  existing: QueueItem[];
  today: string;
  reportOrder: readonly string[];
  /** Remove not-yet-posted items that no longer resolve (explicit `--drop-stale`; they are reported either way). */
  dropStale?: boolean;
  /**
   * Re-date every not-yet-posted item, in its current order, one per day from
   * this date (explicit `--start`, e.g. launch day), under the scheduling rules
   * (`scheduleItems`: an OPENING_REPORT excerpt first, spacing, kept-clear dates).
   * Posted items never move.
   */
  restartFrom?: string;
  /** Reports whose items are never scheduled (registry `news_day_only`). Not-yet-posted items of theirs leave the queue; posted ones stay. */
  newsDayOnly?: readonly string[];
}): { queue: QueueItem[]; added: number; staleUnposted: string[]; stalePosted: string[]; heldBack: QueueItem[]; overLength: string[] } {
  const { resolved, reportOrder } = params;
  let existing = params.existing;
  const today = params.today;
  const resolvedById = new Map(resolved.map((r) => [r.id, r]));

  const staleUnposted = existing.filter((item) => !item.posted_url && !resolvedById.has(item.id)).map((i) => i.id);
  const stalePosted = existing.filter((item) => item.posted_url && !resolvedById.has(item.id)).map((i) => i.id);

  if (params.dropStale) existing = existing.filter((i) => i.posted_url || resolvedById.has(i.id));
  const newsDayOnly = params.newsDayOnly ?? [];
  const heldBack = existing.filter((i) => !i.posted_url && newsDayOnly.includes(i.report));
  existing = existing.filter((i) => i.posted_url || !newsDayOnly.includes(i.report));
  if (params.restartFrom) {
    const posted = existing.filter((i) => i.posted_url);
    const dated = scheduleItems(
      existing.filter((i) => !i.posted_url),
      params.restartFrom,
      posted,
      posted.length === 0
    );
    const byId = new Map(existing.map((i) => [i.id, i]));
    // In dated order, so the file reads in the order it will post.
    existing = [...posted, ...dated.map((i) => ({ ...byId.get(i.id)!, scheduled: i.scheduled }))];
  }

  // A not-yet-posted item takes its current card and text: both are build
  // artefacts, not decisions. A quote card rendered since (f2e) should be what
  // it posts with, and the text's page number moves when a re-ingest moves a
  // page marker (four items said "p. 2" where the pinned text says 3, and so
  // did not agree with their card or landing panel; p3o8). Posted items keep
  // the record of what was posted.
  // A hooked item's text is its hook plus the source line (formatHooked); one over Bluesky's limit keeps its old text
  // and is reported, so --check fails it before the poster would.
  const overLength: string[] = [];
  existing = existing.map((i) => {
    const now = resolvedById.get(i.id);
    if (i.posted_url || !now) return i;
    let text = now.text;
    if (i.hook?.trim() && now.page !== undefined) {
      const hooked = formatHooked(i.hook, now.sourceTitle ?? "", now.page, now.contextLine);
      if (graphemeLength(hooked) > BLUESKY_GRAPHEME_LIMIT) {
        overLength.push(`${i.id}: hook makes the post ${graphemeLength(hooked)} graphemes, over Bluesky's ${BLUESKY_GRAPHEME_LIMIT}`);
        text = i.text;
      } else text = hooked;
    }
    const needsHook = now.needsHook === true && !i.hook?.trim();
    const { needs_hook: _was, ...rest } = i;
    const next: QueueItem = { ...rest, card: now.card, text, ...(needsHook ? { needs_hook: true as const } : {}) };
    return now.card !== i.card || text !== i.text || needsHook !== (i.needs_hook === true) ? next : i;
  });

  const existingIds = new Set(existing.map((i) => i.id));
  const newItems = resolved.filter((r) => !existingIds.has(r.id) && !newsDayOnly.includes(r.report));
  const ordered = roundRobin(newItems, reportOrder);

  const lastScheduled = existing.reduce((max, item) => (item.scheduled > max ? item.scheduled : max), "");
  const start = lastScheduled ? addDays(lastScheduled, 1) : params.restartFrom ?? addDays(today, 1);

  const added: QueueItem[] = scheduleItems(ordered, start, existing, existing.length === 0).map((item) => ({
    id: item.id,
    report: item.report,
    paragraph: item.paragraph,
    quote: item.quote,
    text: item.text,
    link: item.link,
    card: item.card,
    scheduled: item.scheduled,
    posted_url: null,
    ...(item.needsHook ? { needs_hook: true as const } : {}),
  }));

  return { queue: [...existing, ...added], added: added.length, staleUnposted, stalePosted, heldBack, overLength };
}
