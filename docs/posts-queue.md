# The posting queue — `pnpm posts`

Builds `marketing/queue.yaml`: the Bluesky posting queue for the excerpt account (reportsthatmatter-y2t.3). Bluesky only — X was dropped 2026-09-25 (API pricing; Rufus posts to X by hand). Makes no network request of any kind; it only reads the repo and writes local files.

```bash
pnpm prerender   # required first, same as pnpm editorial
pnpm posts
open build/posts-preview.html   # a static local preview, not committed
```

Flags, all explicit (a plain run does none of this): `--check` writes nothing and exits 1 if a not-yet-posted item no longer resolves (the poster's workflow runs it before every post); `--drop-stale` removes such items; `--report <id>` (repeatable) makes only the named reports' skipped candidates and stale items fail the run, so a report's PR is not blocked by other reports' items on main (the queue is still built from every report; 5qmm); `--start YYYY-MM-DD` re-dates every not-yet-posted item one per day from that date, in its current order, under the scheduling rules below (posted items never move). The poster that consumes the queue is described in [poster.md](poster.md).

## Sources

Two, both read directly, never re-verified a second way:

- **`editorial/<id>.yaml`, `status: approved` only** — every `highlights:` entry with `card: true`. This is the primary source: `card: true` is the flag that marks a highlight as post-worthy (`docs/report-introductions.md` / [`docs/plans/2026-09-25-reader-layer-and-launch.md`](plans/2026-09-25-reader-layer-and-launch.md)).
- **`docs/share-quotes.yaml`** — the older curated list, kept alongside until it is folded into the editorial files (tracked in that same plan, track A6). Only entries with an explicit `quote:` are used; the "start of the paragraph" fallback `cards.mjs` uses isn't specific enough for a quoted post.

## Checking

Every candidate is checked with the exact same functions `scripts/editorial.mjs` uses — `placeQuote`, `citationHref`, `pageOf` from `src/lib/editorial.ts` — against the same pre-rendered body in `assets/generated/`. Nothing here re-implements or second-guesses that check. A candidate that fails is **skipped and reported**, not a build failure: a highlight chosen for on-page reading is not necessarily short enough to post, and the queue should hold what does work rather than block on what doesn't. Skipped for one of:

- the quote isn't verbatim in that paragraph (or the block quotation after it) — from `docs/share-quotes.yaml` this usually means the report's text moved since the entry was written; from an *approved editorial file* it means `pnpm editorial` should be failing too, so look there first;
- the paragraph has no page number (rare — an epigraph or similar with no page marker at all) — Appendix C requires one, always;
- the post text (quote + source line + context line) is over Bluesky's 300-grapheme limit **and** it cannot be queued as a hooked post (next section). **The quote is never trimmed to fit** — verbatim only;
- no card image exists for it at all (see below) — run `pnpm cards`.

## Long quotes: queued as "needs hook"

A hooked post omits the quote (the card carries it), so a highlight whose quote form is over 300 graphemes can still be queued, provided the card shows the whole quote legibly: a quote card was rendered for exactly these words (not the report's plain default card) and the quote is at most `CARD_QUOTE_LIMIT` (420) characters, the length `scripts/cards.mjs` cuts at (the card's type is already at its 34px floor there, and `assertFits` fails a card that overflows 630px). Such an item is appended like any other but carries `needs_hook: true` (set and cleared by `pnpm posts`, never by hand) and its `text` stays the over-length quote form, which the poster refuses to post. A person writes its `hook:` (the `post-writing` skill), and the next `pnpm posts` rebuilds `text` from it and clears the flag. `pnpm posts` lists items waiting for a hook; `--check` fails one whose `scheduled` date has arrived with no hook (and a hook that takes the post over 300, as ever). A quote over 420 characters, or one with only the default card, is still skipped. The quote is never trimmed.

## The card image

`scripts/cards.mjs` renders one curated card per `docs/share-quotes.yaml` entry, keyed by `report/paragraph`, plus one plain default card per report (title and byline, no quote). It does not yet render a card per editorial `card: true` highlight — that is a gap worth closing (a natural extension of `scripts/cards.mjs`, not built here to keep this change scoped to the queue itself). Until it does:

- a `docs/share-quotes.yaml` candidate uses its own curated card;
- an `editorial/<id>.yaml` candidate always uses the report's plain default card, **even where a curated card happens to exist for that paragraph** — a paragraph can carry two different excerpts from the two sources, and reusing a card rendered for the other one's words would caption an image with a quote it doesn't show.

`pnpm posts` reports how many items ended up on a default card, so it's visible how much of the queue is waiting on that extension.

## The format

Appendix C of [`docs/plans/2026-08-02-launch-and-seo.md`](plans/2026-08-02-launch-and-seo.md): verbatim quote, blank line, a neutral source line with the page number, never any commentary. `text` in the queue is exactly this:

```
"[verbatim quote]"

— [Report title], p. [n]
```

**With a hook** (Rufus, 24 Oct 2026: the first post repeated the quote already on its card and was "not at all compelling"). A person, following the `post-writing` skill, writes the item's `hook:` field in `marketing/queue.yaml`: one to three sentences of context ending on the gap the card fills. `pnpm posts` then builds `text` as

```
[hook]

— [Report common name], p. [n]

[context line, where the registry has one]
```

The quote is not repeated in the text: it is on the card image, which travels as the link card's thumbnail. The source line uses the registry's `common_name` (shorter than the title, so the hook has room) and stays in the `— Name, p. N` form the poster reads the link card's title and page from (`cardMeta`), so the deployed poster needs no change. `pnpm posts` never writes or clears a `hook`; it rebuilds `text` from it on every run. `--check` fails a hooked item whose post is over 300 graphemes or whose `text` was not rebuilt after the hook was edited (the poster posts `text`). A posted item's text is never rewritten. An item with no hook posts in the quote form above.

`link` is the `?p=` deep link to the paragraph (with `?h=` to the exact words, where they're in the paragraph itself) plus `&src=bsky`, so Cloudflare analytics and Search Console can be read by channel later.

## Scheduling and idempotency

Append-only. Re-running `pnpm posts`:

- **never moves** an existing item's `scheduled` date, and never touches a `posted_url` or `posted_at` the scheduled poster (reportsthatmatter-y2t.4) has written back — that's what lets the poster's commit and a fresh `pnpm posts` coexist without racing each other;
- **appends** any newly-approved excerpt, one per calendar day, starting the day after whatever was last scheduled;
- new items are ordered **round-robin across reports** — a themed calendar keyed to news hooks is reportsthatmatter-y2t.5, which has no calendar data yet; when it does, that plugs in ahead of the round-robin in `buildQueue` (`src/lib/posts.ts`), not here;
- a **not-yet-posted** item whose quote or paragraph no longer resolves is reported loudly (fix it before its scheduled date, or the poster would ship a broken link); an **already-posted** one in the same state is only a warning — it already happened, and can't be un-posted.

Matching across runs is by a stable id (`report:paragraph:hash-of-the-quote`), not file position, so reordering an editorial file's highlights never reschedules anything.

## Scheduling rules

Kept in code (`scheduleItems`, `queueViolations` in `src/lib/posts.ts`, with tests), applied whenever items are dated (`--start`, or new items appended) and checked by `pnpm posts --check` and `--verify`, so a later run cannot undo them (reportsthatmatter-ay85):

- the first item is a Challenger excerpt, dated the queue's start date (whatever `--start` is; only while nothing has been posted); Jack Smith, the January 6th report and Chilcot are never first;
- no two Post Office items, and no two Grenfell items, within 14 days of each other (a day with only such items left stays empty);
- nothing is scheduled from 18 December to 2 January, or on 23 October, 23 November, 6, 28 or 30 January, every year.

Three more rules, decided by Rufus on 2026-10-16 (63cd, 80qf) and read from the registry (`reports/registry.yaml`), applied before a candidate is resolved and again by `--check`:

- **Affected-community reports** (`affected_community: true`): only a Tier A highlight is queued (strategy section 8). Tier C (the word list, the file's `private_people:`) is refused and `pnpm editorial` fails on it (`TIER_C_IS_FAILURE` in `src/lib/tier-c.ts` is `true`). Tier A is a person's judgement (an institution is the subject, the verb says what it did, knew or failed to do, the sentence stands alone), recorded as `tier: A` on the highlight in `editorial/<id>.yaml`. An unmarked highlight is Tier B: it stays on the page, is listed by `pnpm posts` as kept out, and is for a person to post with a context line. It is not a failure.
- **Context line** (`context_line:` in the registry; the strategy names Post Office, Grenfell and Hillsborough): appended after the source line of every post from that report, so it counts against the 300 graphemes; an item that no longer fits is skipped and listed like any over-length one.
- **News-day-only reports** (`news_day_only: true`: Jack Smith, the January 6th report, Chilcot): never scheduled; not-yet-posted items of theirs leave the queue. `pnpm posts --report <id>` lists the held items with their text and link, for a person to post on the report's news day.

Marking another highlight Tier A, or adding a report to either list, is a registry or editorial edit followed by `pnpm editorial && pnpm posts --drop-stale`.

The single kept-clear dates (23 Oct, 23 Nov, 6 Jan, 28 Jan, 30 Jan; `KEPT_CLEAR_DAYS`) are skipped like 18 Dec to 2 Jan, and `--check` fails an item scheduled on one. Still by hand: the Post Office and Hillsborough cards render without a plate (`src/lib/card-plates.ts`): the Inquiry's wordmark and the Leppings Lane plan must not travel on a post.
