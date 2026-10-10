# The posting queue — `pnpm posts`

Builds `marketing/queue.yaml`: the Bluesky posting queue for the excerpt account (reportsthatmatter-y2t.3). Bluesky only — X was dropped 2026-09-25 (API pricing; Rufus posts to X by hand). Makes no network request of any kind; it only reads the repo and writes local files.

```bash
pnpm prerender   # required first, same as pnpm editorial
pnpm posts
open build/posts-preview.html   # a static local preview, not committed
```

Flags, all explicit (a plain run does none of this): `--check` writes nothing and exits 1 if a not-yet-posted item no longer resolves (the poster's workflow runs it before every post); `--drop-stale` removes such items; `--report <id>` (repeatable) makes only the named reports' skipped candidates and stale items fail the run, so a report's PR is not blocked by other reports' items on main (the queue is still built from every report; 5qmm); `--start YYYY-MM-DD` re-dates every not-yet-posted item one per day from that date, in its current order (posted items never move). The poster that consumes the queue is described in [poster.md](poster.md).

## Sources

Two, both read directly, never re-verified a second way:

- **`editorial/<id>.yaml`, `status: approved` only** — every `highlights:` entry with `card: true`. This is the primary source: `card: true` is the flag that marks a highlight as post-worthy (`docs/report-introductions.md` / [`docs/plans/2026-09-25-reader-layer-and-launch.md`](plans/2026-09-25-reader-layer-and-launch.md)).
- **`docs/share-quotes.yaml`** — the older curated list, kept alongside until it is folded into the editorial files (tracked in that same plan, track A6). Only entries with an explicit `quote:` are used; the "start of the paragraph" fallback `cards.mjs` uses isn't specific enough for a quoted post.

## Checking

Every candidate is checked with the exact same functions `scripts/editorial.mjs` uses — `placeQuote`, `citationHref`, `pageOf` from `src/lib/editorial.ts` — against the same pre-rendered body in `assets/generated/`. Nothing here re-implements or second-guesses that check. A candidate that fails is **skipped and reported**, not a build failure: a highlight chosen for on-page reading is not necessarily short enough to post, and the queue should hold what does work rather than block on what doesn't. Skipped for one of:

- the quote isn't verbatim in that paragraph (or the block quotation after it) — from `docs/share-quotes.yaml` this usually means the report's text moved since the entry was written; from an *approved editorial file* it means `pnpm editorial` should be failing too, so look there first;
- the paragraph has no page number (rare — an epigraph or similar with no page marker at all) — Appendix C requires one, always;
- the post text (quote + source line) is over Bluesky's 300-grapheme limit. **The quote is never trimmed to fit** — verbatim only, so an over-length highlight is excluded, not shortened;
- no card image exists for it at all (see below) — run `pnpm cards`.

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

`link` is the `?p=` deep link to the paragraph (with `?h=` to the exact words, where they're in the paragraph itself) plus `&src=bsky`, so Cloudflare analytics and Search Console can be read by channel later.

## Scheduling and idempotency

Append-only. Re-running `pnpm posts`:

- **never moves** an existing item's `scheduled` date, and never touches a `posted_url` or `posted_at` the scheduled poster (reportsthatmatter-y2t.4) has written back — that's what lets the poster's commit and a fresh `pnpm posts` coexist without racing each other;
- **appends** any newly-approved excerpt, one per calendar day, starting the day after whatever was last scheduled;
- new items are ordered **round-robin across reports** — a themed calendar keyed to news hooks is reportsthatmatter-y2t.5, which has no calendar data yet; when it does, that plugs in ahead of the round-robin in `buildQueue` (`src/lib/posts.ts`), not here;
- a **not-yet-posted** item whose quote or paragraph no longer resolves is reported loudly (fix it before its scheduled date, or the poster would ship a broken link); an **already-posted** one in the same state is only a warning — it already happened, and can't be un-posted.

Matching across runs is by a stable id (`report:paragraph:hash-of-the-quote`), not file position, so reordering an editorial file's highlights never reschedules anything.
