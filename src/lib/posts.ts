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
import { findText, selectorFor } from "../../assets/anchor.js";
import { quoteCardId } from "./card-key";

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
};

/**
 * The quote wrapped in outer double quotes collides with any straight double
 * quote already inside it (a quotation within the quotation — Trump's own
 * words, say) — `"...he replied "So what?""` reads as three quotes, not one.
 * Standard nesting fixes it: typographic outer quotes, and every inner
 * straight double quote alternates to an opening or closing single quote.
 * Only the *display* text changes — the quote used for the verbatim check
 * and the `?h=` anchor is untouched, so this never risks misquoting.
 */
function nestQuotes(quote: string): string {
  let opening = true;
  const inner = quote.replace(/"/g, () => {
    const mark = opening ? "‘" : "’";
    opening = !opening;
    return mark;
  });
  return `“${inner}”`;
}

/**
 * Appendix C's excerpt format (`docs/plans/2026-08-02-launch-and-seo.md`):
 * the verbatim quote, then a neutral, always-page-numbered source line. No
 * commentary, ever — that rule is enforced by never taking a "why this
 * matters" field here, only the quote and the citation.
 */
export function formatPost(quote: string, reportTitle: string, page: number): string {
  return `${nestQuotes(quote.trim())}\n\n— ${reportTitle}, p. ${page}`;
}

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
  const cardIsDefault = specific === null;
  if (cardIsDefault && !cards.has(`${candidate.report}/default`)) {
    return { ok: false, problem: `${where}: no card image at all — run pnpm cards` };
  }
  const card = `assets/cards/${candidate.report}/${specific ?? "default"}.png`;

  const text = formatPost(candidate.quote, candidate.reportTitle, page);
  const length = graphemeLength(text);
  if (length > BLUESKY_GRAPHEME_LIMIT) {
    return {
      ok: false,
      problem: `${where}: ${length} graphemes, over Bluesky's ${BLUESKY_GRAPHEME_LIMIT} limit (quote can't be trimmed — verbatim only)`,
    };
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
};

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
   * this date (explicit `--start`, e.g. launch day). Posted items never move.
   */
  restartFrom?: string;
}): { queue: QueueItem[]; added: number; staleUnposted: string[]; stalePosted: string[] } {
  const { resolved, reportOrder } = params;
  let existing = params.existing;
  const today = params.today;
  const resolvedById = new Map(resolved.map((r) => [r.id, r]));

  const staleUnposted = existing.filter((item) => !item.posted_url && !resolvedById.has(item.id)).map((i) => i.id);
  const stalePosted = existing.filter((item) => item.posted_url && !resolvedById.has(item.id)).map((i) => i.id);

  if (params.dropStale) existing = existing.filter((i) => i.posted_url || resolvedById.has(i.id));
  if (params.restartFrom) {
    const from = params.restartFrom;
    const order = existing.filter((i) => !i.posted_url);
    const dates = new Map(order.map((i, n) => [i.id, addDays(from, n)]));
    existing = existing.map((i) => (dates.has(i.id) ? { ...i, scheduled: dates.get(i.id)! } : i));
  }

  // A not-yet-posted item takes its current card: the card is a build
  // artefact, not a decision, and a quote card rendered since (f2e) should be
  // what it posts with. Posted items keep the record of what was posted.
  existing = existing.map((i) => {
    const now = resolvedById.get(i.id);
    return !i.posted_url && now && now.card !== i.card ? { ...i, card: now.card } : i;
  });

  const existingIds = new Set(existing.map((i) => i.id));
  const newItems = resolved.filter((r) => !existingIds.has(r.id));
  const ordered = roundRobin(newItems, reportOrder);

  const lastScheduled = existing.reduce((max, item) => (item.scheduled > max ? item.scheduled : max), "");
  const start = lastScheduled ? addDays(lastScheduled, 1) : params.restartFrom ?? addDays(today, 1);

  const added: QueueItem[] = ordered.map((item, i) => ({
    id: item.id,
    report: item.report,
    paragraph: item.paragraph,
    quote: item.quote,
    text: item.text,
    link: item.link,
    card: item.card,
    scheduled: addDays(start, i),
    posted_url: null,
  }));

  return { queue: [...existing, ...added], added: added.length, staleUnposted, stalePosted };
}
