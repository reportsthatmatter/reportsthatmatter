# Public highlights feed: what readers are highlighting, on /highlights

- **Bead:** reportsthatmatter-bght.10 (epic bght). Decision record: [0021](../decisions/0021-public-highlights-feed.md), decision bead bght.10.8.
- **Status:** design, for validation by a separate reviewer agent before anything is built. No code in this change.
- **Author:** design agent, 2026-10-16. Rufus's request (2026-10-16): https://reportsthatmatter.org/highlights is effectively empty because it shows only the reader's own highlights, kept in their browser. Separate "my highlights" from a record of what is getting highlighted; the highlights section should show running updates of what readers are highlighting, to make the site a bit social. It can be completely anonymous. Personal highlights stay browser-based, on their own page or tab.

## 0. The short version

- `/highlights` becomes a public, server-rendered page with three blocks: **Recently highlighted** (a stream of passages readers saved or shared, newest first), **Most highlighted this week** (once there are enough), and **Editor's picks** (so the page is never empty). The reader's own browser-kept highlights move to `/highlights/yours`, a second tab. The nav label stays "Highlights".
- The data already exists: every Save and every Copy link/Share already posts the selected words to `POST /api/mark`, which stores them in D1 `marks` with a daily-salted hash of IP and user agent. Production holds 224 editor rows and **no reader rows** today (measured below), so the empty state matters more than the stream at first.
- A Cron Trigger every 10 minutes rolls new `marks` rows (read by primary key above a watermark, so it never rescans) into two small tables, **verifies each passage's words against the published report text**, applies the public-display policy, and writes one JSON snapshot row. A view of `/highlights` costs one D1 row read (and is edge-cached for 60 s).
- Defaults for the policy (decision 0021 asks Rufus to confirm): a passage appears **30 minutes after it is first marked, from one reader**; a count is printed only from 2 readers; times are coarse ("within the hour", "3 hours ago", "yesterday"); nothing identifying is shown or newly stored; selections under 4 words or 20 characters never appear; one reader can put at most 5 passages per report per day into the stream; affected-community reports (decision bead 63cd) are left out of the public stream until 63cd is decided.
- Budget at launch scale (10,000 page views and 500 marks a day): about 40,000 D1 rows read a day typically, about 110,000 at worst (0.8% to 2.2% of the 5M free tier), and about 2,600 new row writes a day (2.6% of 100k). Writes, not reads, are what bind as traffic grows: roughly 8 row writes per mark in total, so the free tier tops out near 12,000 marks a day.
- Seven child beads under bght.10, ordered, each handoff-ready; none started.

## 1. What exists today

### 1.1 The /highlights page

- `src/templates/highlights.ts` (`renderHighlights`) is a static shell: kicker "Yours", h1 "Highlights", byline "Kept in this browser · never sent to us", an empty state ("Nothing kept yet…") and export buttons. Route `app.get("/highlights", …)` in `src/index.ts`.
- `assets/highlights-page.js` fills it from `localStorage` key `rtm.highlights.v1` (`assets/highlights-store.js`): each record holds `id, report, reportTitle, section, sectionTitle, paragraph, anchor, quote, page, url, created`. Grouped by report, each with "Read in place" and "Remove", plus "Copy as Markdown/JSON".
- Every first-time visitor sees the empty state. "Highlights" is the third of six header links (`DEFAULT_NAV` in `src/templates/layout.ts`) and is in the footer.

### 1.2 What happens when a reader saves or shares

`assets/share.js`: selecting at least 2 characters inside `#report-body` opens the popover (a dock on touch devices). Its buttons:

| Action | Browser | Server |
| --- | --- | --- |
| Save | adds a record to `localStorage` | `POST /api/mark` with `kind: "save"` |
| Copy link | copies the `?p=…&h=…` URL | `POST /api/mark` with `kind: "share"` |
| Copy quote | copies the words and URL | `POST /api/mark` with `kind: "share"` |
| Share (native sheet) | `navigator.share` | `POST /api/mark` with `kind: "share"`, only if the sheet reports success |

The POST body is `{report, section, paragraph, exact, prefix, suffix, page, kind}` (`keepalive: true`, fire and forget). Landing on a shared `?h=` link records nothing. Removing a highlight on `/highlights` deletes it from `localStorage` only; nothing is sent.

**So the byline "never sent to us" is already inaccurate.** The browser's list is never sent, but the words of every save are, anonymously. The design fixes the copy (§6.3) whether or not the feed ships. The site has no privacy statement anywhere today (`src/templates/about.ts` mentions highlighting only as "copy a link").

### 1.3 The `marks` table (D1 `reportsthatmatter-marks`, migration `0001_marks.sql`)

```sql
CREATE TABLE marks (
  id INTEGER PRIMARY KEY, report TEXT NOT NULL, section TEXT NOT NULL, paragraph TEXT NOT NULL,
  exact TEXT NOT NULL, prefix TEXT NOT NULL DEFAULT '', suffix TEXT NOT NULL DEFAULT '',
  page INTEGER, kind TEXT NOT NULL, actor TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX marks_report_para ON marks (report, paragraph);
CREATE INDEX marks_report_actor ON marks (report, actor, created_at);
```

- `actor` = `sha256(MARK_SALT : YYYY-MM-DD (UTC) : cf-connecting-ip : user-agent)` (`actorHash` in `src/lib/marks.ts`). No IP, user agent, referrer or cookie is stored. The salt folds in the date, so the same reader is a different actor each UTC day: "distinct readers" in this system means **distinct reader-days**. Whoever holds `MARK_SALT` can test whether a known IP and user agent marked something on a given day; nobody else can.
- `exact`, `prefix`, `suffix`, `paragraph`, `section`, `page` are **client-supplied and unverified**. `parseMarkPayload` checks only types and non-emptiness; there is **no length limit** on `exact`. Today this is harmless because `assets/social-proof.js` shows a mark only if it can find those words on the page; a public page that printed `exact` would print whatever a script posted. Verification is therefore a hard requirement of the feed (§4.3).
- Rate limit: 40 marks per actor per report per rolling 24 h (`RATE_LIMIT_PER_DAY`), checked with a `COUNT(*)` on `marks_report_actor`.
- Editor's highlights live in the same table under actor `editorial:rufus-pollock`, written by `pnpm seed-highlights` from `editorial/<id>.yaml` (decision 0014: labelled "Editor's highlight", never counted as readers). A reader's actor is 64 hex characters, so no request can claim the `editorial:` prefix.
- There is no `created_at`-only index, so "recent marks across all reports" cannot be queried without a full scan; but `id` is the rowid and grows monotonically, so `WHERE id > ?` is a cheap range read. The feed uses that and needs no new index on `marks`.

**Measured on production, 2026-10-16** (`GET /reports/<id>/marks` for all 18 reports, `MARK_THRESHOLD` unset so 1): 224 passages, every one an editor's highlight (9 to 15 per report), **0 passages with any reader**. `pnpm d1-usage` for 2026-10-16: 7,530 rows read (0.2%), 0 rows written; the marks query ran 88 times reading 3,379 rows (~38 a call). The site has not launched (the poster is not live).

### 1.4 How marks are read today

- `GET /reports/:id/marks` → `markCounts(db, report, threshold, meta)`: one `GROUP BY paragraph, exact, editor` over the report's rows, then moved paragraph ids mapped through the report's aliases (j53o). Uncached by design; reads every mark row of the report per page view (bead 6kky). `assets/social-proof.js` fetches it on every report page and shades marked passages (yellow wash, strength by reader count, hover title "Highlighted by 3 readers"; the editor's at the weight of one reader).
- `topMarkedPassages` (report landing page): the top 5 with text re-quoted from the section fragment via `quotedPassage`. **Skipped whenever the report's editorial is approved**, which today is all 18, so no landing page shows a "Most marked" block.
- PR #294 (open, 6kky, `needs-user`): edge-caches the per-report counts with a TTL scaled to rows read (2 to 30 min), evicted at the marking location by `/api/mark`. Measured: 2,000 marks × 2,500 views/day goes from 11.25M to 275k rows/day. The feed does not depend on #294 and does not conflict with it; §4.6 explains how the feed's rollup is also the "counts table" option 6kky deferred.

### 1.5 Editorial highlights, cards, picks, share links

- `editorial/<id>.yaml` `highlights:` (paragraph, verbatim quote, optional `card: true`) are resolved by `src/lib/editorial.ts` (`ResolvedHighlight`: report, section, paragraph, exact, prefix, suffix, page, card) and written by `pnpm editorial` (`scripts/editorial.mjs`) to `build/editorial-highlights.json` (the seed's input; `build/` is not committed and not bundled into the Worker). 18 editorial files; 95 highlights carry `card: true`.
- g0w.5 (open): "Editor's picks on /highlights": an optional `pick: true` on an editorial highlight, 8 to 12 picks, at most one per report, avoiding affected-community reports, rendered server-side on /highlights, labelled as chosen by Reports that Matter. This design adopts g0w.5 as the never-empty floor of the public page (§3.4).
- 63cd (open decision, `needs-user`): the tier rule for highlights in reports flagged `affected_community` (Grenfell, Hillsborough, Post Office, Saville, 9/11, Deepwater, Challenger, Columbia; CIA torture report proposed). Tier C (counts deaths or injuries, names a private person, quotes condemned words or last words) is "landing page only, never a card, post or thread". zh1w (open) adds `affected_community: true` to `reports/registry.yaml` and the Tier C word list check to `pnpm editorial`. The flag does not exist in the registry yet.
- `?p=<paragraph>&h=<anchor>` links (`src/lib/card-key.ts`, `encodeAnchor`) land on the exact words with a landing panel (bght.4) and are edge-cached for a day keyed on the deploy (`cached()` in `src/index.ts`). Every feed item links this way.

### 1.6 What we have versus what we need

| For the feed we need | Have it? |
| --- | --- |
| The words, paragraph, section, page and report of each reader's save or share | Yes, in `marks` (unverified) |
| When it happened | Yes, `created_at` (ms) |
| Distinct readers per passage | Yes, as distinct `actor` (reader-days) |
| Reader marks separated from the editor's | Yes, `editorial:` prefix |
| A cheap way to read "what is new since last time" | Yes, `id > watermark` (rowid range) |
| Words verified against the published text | **No.** New: verification at rollup (§4.3) |
| A limit on `exact` length at write time | **No.** New: cap in `parseMarkPayload` (§5.4) |
| Per-passage rollup: readers, first/last seen, status (pending, visible, held, hidden) | **No.** New table `feed_passages` |
| Readers per passage per day (for "this week") | **No.** New table `feed_passage_days` |
| A watermark and a prebuilt snapshot | **No.** New table `feed_state` |
| A per-report public/exclude switch, the affected-community flag | **No.** `affected_community` comes with zh1w; `FEED_EXCLUDE` env var new |
| Section titles and report names for display | Yes: `loadReportMeta` (`meta.sections`), registry `common_name` (bundled) |
| Editor's picks | Partly: editorial highlights exist; `pick: true` is g0w.5 |

Nothing new identifies a reader. The design stores no IP, no user agent, no cookie and no new hash.

## 2. Assumptions (the numbers every estimate below uses)

- **A1. Traffic at launch scale:** 10,000 page views a day: 1,000 on `/highlights`, 3,000 report landing pages, 6,000 section or `/full` pages.
- **A2. Marks:** 500 a day (saves plus shares) from about 200 reader-days, over about 300 distinct passages; about 450 distinct (passage, reader-day) pairs. 75% in reports not flagged affected-community.
- **A3. D1 costs:** a query costs the rows it scans, including index entries (PR #294 notes local miniflare `rows_read` is about 2× production; the numbers below are production-scale). A row write costs 1 plus 1 per secondary index touched (q2ph: a `marks` insert costs about 3).
- **A4. Free tiers:** D1 5,000,000 rows read and 100,000 rows written a day, reset 00:00 UTC (AGENTS.md, Cloudflare). Workers Free: 100,000 requests a day, Cron Triggers allowed (up to 5 per account), **10 ms CPU per invocation** including scheduled ones. The site is on Workers Free until 4g4d.
- **A5. Cadence:** rollup every 10 minutes (144 runs a day); "this week" recomputed at most hourly (24 a day); a run with nothing new writes nothing.
- **A6. The Cache API** works on `reportsthatmatter.org`, not on `*.workers.dev`, and is per data centre.

## 3. Information architecture and what a reader sees

### 3.1 URLs and navigation

| URL | What | Rendered | Indexed |
| --- | --- | --- | --- |
| `/highlights` | **Readers' highlights**: the public page (Recently highlighted, Most highlighted this week, Editor's picks) | Server, no JavaScript needed | Yes, canonical |
| `/highlights/yours` | **Yours**: the reader's own browser-kept highlights, export, opt-out | Shell from the server, list from `localStorage` (today's `highlights-page.js`) | `noindex` |

- The two pages share a header: kicker "Highlights", h1 "What readers are highlighting" or "Your highlights", and under it a two-link tab row in the mono chrome style: `READERS · YOURS`, the current one with `aria-current="page"` and no link. These are two pages, not an ARIA tablist: each has its own URL, works without JavaScript, and is bookmarkable.
- The header nav label stays **"Highlights"** and points at `/highlights`. It already exists, is short (phone header, decision 0018), and now opens on something every visitor can see.
- People who bookmarked `/highlights` for their own list: on `/highlights`, a small script (the only JS on the page) reads the local store and, if it holds any, shows one line above the stream: "You have 6 saved passages · Yours →". The popover's "Saved" flash links to `/highlights/yours` as today's does to `/highlights` (check `share.js` and any copy that names `/highlights`).

### 3.2 The stream item

One item is one **passage**: (report, current paragraph id, exact words). Markup reuses `.highlight-entry` and `.highlight-meta` from `assets/styles.css`, so it looks like the existing personal list:

```
  │ NASA chose to continue to fly with a flawed design and to follow a
  │ measured, 27-month, corrective program.

  CHALLENGER: HOUSE REPORT · III. FINDINGS · P. 45 · 3 READERS · 2 HOURS AGO
  READ IN PLACE →
```

- **Excerpt:** the verified words (§4.3), as `<blockquote cite="…">` in the serif, at most 300 characters cut on a word boundary with an ellipsis (`truncate` in `src/templates/report.ts`); the full words are one click away.
- **Meta line** (mono, uppercase, muted, one line that wraps on phones): report `common_name` from the registry; section title; printed page if known ("P. 45"); reader count only when 2 or more ("3 READERS", never "1 READER"); coarse time from `last_seen`; "Read in place" linking `/reports/<id>/<slug>?p=<paragraph>&h=<anchor>#<paragraph>`, with a visually hidden suffix naming the report for screen readers.
- **Coarse time:** `last_seen` rounded down to the hour when stored in the snapshot; shown as "within the hour" (under 60 min), "N hours ago" (1 to 23), "yesterday", "N days ago" (2 to 6), then the date ("12 Oct"). Inside `<time datetime="2026-10-16T14:00Z">`. Relative words are computed at request time from the stored hour, so a cached snapshot does not go stale in wording.
- **Editor's items** carry "EDITOR'S PICK" in place of the count and time and never a time, so they cannot read as activity (decision 0014).

### 3.3 Blocks and ordering on `/highlights`

1. **Recently highlighted.** Visible passages ordered by `last_seen` descending, 20 shown (the snapshot holds 50; no pagination in v1). Diversity rules, applied when the snapshot is built: at most one item per paragraph (the most recent passage in it), at most 4 of the 20 from one report. Only passages seen in the last 30 days.
2. **Most highlighted this week.** Passages with at least 2 reader-days in the last 7 UTC days, ordered by that sum, then by `last_seen`; top 5. The block appears only when at least 3 passages qualify, so it never shows a "top list" of ones.
3. **Editor's picks.** g0w.5's `pick: true` highlights (8 to 12, at most one per report, no affected-community reports), each with report, page and link. Until g0w.5 lands, the fallback is one `card: true` highlight per report not flagged affected-community, chosen deterministically (the first in the file), so the page is never empty on day one. Always last, under its own heading, never interleaved with readers' items.

Page byline under the h1: "Passages readers have saved or shared, anonymously · updated every 10 minutes". At the foot, one plain line on how it works and a link to `/highlights/yours`: "When you save or share a passage, we count the words, not you: no account, no cookie, nothing that identifies you. Turn it off on Yours."

### 3.4 Empty and thin states (it is never empty)

| State | What shows |
| --- | --- |
| No visible reader passages (today: 0 reader rows) | Recently highlighted: one muted line, "Passages readers save or share appear here about half an hour later. Select any passage in a report and choose Save." Then Editor's picks. |
| 1 to 4 visible passages | Those, then Editor's picks. No "Most highlighted" block. |
| 5 or more, under 3 with 2+ readers | Recent, then Editor's picks. |
| Full | Recent (20), Most highlighted this week (5), Editor's picks. |
| Feed switched off (`FEED_ENABLED=false`) or snapshot unreadable | Editor's picks only, with no error. A D1 failure must never cost the page (as with social proof today). |

We never fabricate activity: no seeded "reader" rows, no rotating editor items with times, no counts that include the editor.

### 3.5 Per-report variant

The report landing page gets a "What readers are highlighting" block (top 3 passages of that report with 2+ reader-days in the last 30 days), from the same snapshot, so it costs no extra D1 query beyond the snapshot row. It appears below the editorial reading guide and only when at least 2 passages qualify. Reports in `FEED_EXCLUDE` or flagged affected-community (while decision 0021 Q2's default holds) show no block. This replaces the dormant `topMarkedPassages` block, which never shows while editorial is approved. A filtered `/highlights?report=<id>` is left for later (§8).

### 3.6 Phones

- Single column at the existing measure with the 16 px gutter; the excerpt keeps the 1.2 rem serif; the meta line wraps; no horizontal scroll at 375 px.
- The tab row and "Read in place" are tap targets of at least 44 px tall (padding, not font size), consistent with nupj and decision 0018.
- Server-rendered with no JavaScript except the "You have N saved" line, so the page is light on a phone.

### 3.7 Accessibility

- Landmarks: one `<main>`; each block a `<section aria-labelledby>` with an `<h2>`; the stream is an `<ol>` of `<article>`s, because order means something.
- No auto-refresh, no polling, no `aria-live`: "running updates" means the page is current each time it is loaded (60 s edge cache, 10 min rollup). Moving content would also break the site's calm.
- `<time datetime>` on every time; counts as words ("3 readers"), not icons; "Read in place" links name their destination for screen readers; contrast uses the existing `--muted` token (already passes on `.highlight-meta`).
- The yellow wash is not used on this page; quotes are plain serif with the hairline left rule, as on the personal list.

### 3.8 Design language

No avatars, no names, no icons, no hearts, no "trending", no live counters, no colour beyond the existing tokens. Chrome is uppercase mono; substance is serif; hairline rules between blocks; large whitespace. The page should read like an index card drawer of quotations, not a social feed.

## 4. Data and serving

### 4.1 New tables (migration `0005_feed.sql`)

```sql
-- One row per public-candidate passage: (report, paragraph as marked, exact words).
CREATE TABLE feed_passages (
  key TEXT PRIMARY KEY,          -- sha256(report \0 paragraph \0 exact), hex
  report TEXT NOT NULL,
  section TEXT NOT NULL,         -- slug as marked
  paragraph TEXT NOT NULL,       -- id as marked; resolved through aliases when the snapshot is built
  exact TEXT NOT NULL,           -- verified words (never the raw payload if verification changed it)
  prefix TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  page INTEGER,
  readers INTEGER NOT NULL DEFAULT 0,   -- distinct reader-days, all time
  first_seen INTEGER NOT NULL,          -- ms
  last_seen INTEGER NOT NULL,           -- ms
  status TEXT NOT NULL,                 -- 'pending' | 'visible' | 'held' | 'hidden' | 'rejected'
  reason TEXT NOT NULL DEFAULT ''       -- why held/hidden/rejected: 'short', 'unverified', 'blocklist', 'excluded-report', 'cap', 'manual'
);
CREATE INDEX feed_passages_status_seen ON feed_passages (status, last_seen);

-- Reader-days per passage per UTC day, for "this week".
CREATE TABLE feed_passage_days (
  key TEXT NOT NULL, day TEXT NOT NULL, readers INTEGER NOT NULL,
  PRIMARY KEY (day, key)
);

-- Small state: 'watermark' (last marks.id rolled up), 'snapshot' (JSON), 'week_built_at'.
CREATE TABLE feed_state (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
```

`marks` is unchanged and remains the record of events; the feed tables are derived and can be rebuilt from it (drop, reset the watermark to 0, run the rollup). The editor's rows are never rolled up (`actor LIKE 'editorial:%'` is skipped).

### 4.2 The rollup (Cron Trigger, every 10 minutes)

`wrangler.toml` gains `[triggers] crons = ["*/10 * * * *"]`; `src/index.ts` exports `{ fetch: app.fetch, scheduled }` instead of `app` (check every test that imports the default export). `scheduled` calls `runFeedRollup(env, now)` in a new `src/lib/feed.ts`:

1. Read `watermark` from `feed_state` (1 row).
2. `SELECT id, report, section, paragraph, exact, prefix, suffix, page, actor, created_at FROM marks WHERE id > ? ORDER BY id LIMIT 200` (rowid range: reads only new rows). Skip editor actors.
3. For each new row, whether this actor already marked this passage before the watermark: `SELECT 1 FROM marks WHERE report = ? AND actor = ? AND paragraph = ? AND exact = ? AND id <= ? LIMIT 1` (uses `marks_report_actor`; at most the actor's rows in that report, which the rate limit caps at 40). Within the batch, dedupe in memory.
4. For each passage key not yet in `feed_passages`: **verify** (§4.3) and apply the **policy** (§5) to set `status` and `reason`. Upsert `feed_passages` (readers += new reader-days, `last_seen`) and `feed_passage_days`.
5. Promote `pending` rows whose `first_seen + DELAY` has passed and which meet the reader threshold to `visible` (`WHERE status = 'pending' AND first_seen <= ?`).
6. If anything changed, or the hourly "this week" is due, rebuild the snapshot (§4.4) and write it with the new watermark in one `batch()`.

Batches of 200 rows and at most 25 verifications per run keep a run inside the 10 ms CPU limit (A4); leftover rows wait for the next run (the watermark only advances past processed rows). At 500 marks a day a run sees about 3.5 new rows on average.

**Why a cron and not work on the request path:** the delay (§5.1) must elapse even when nobody marks anything; verification needs a section fragment parse that should not sit on every `/api/mark`; and one writer means no races on the watermark.

### 4.3 Verification (the words must be in the report)

For each new passage: load the section fragment for its paragraph (resolved through the report's aliases, `resolveParagraph`) from the published content (`contentFor` then `loadFragment`, R2 or assets, no D1 beyond the `report_versions` pointer), then `extractParagraph` and `locate(paragraph, {prefix, exact, suffix})` (the same functions `topMarkedPassages` and `quotedPassage` use). Found: store the located words (they equal `exact` after normalisation). Not found, report not in the registry, or section missing: `status = 'rejected', reason = 'unverified'`. A rejected passage never appears and is never re-tried unless the rollup is rebuilt. This removes the injection and spam vector entirely: the public page can only ever print words the report contains, at a place it contains them.

The landing page's `topMarkedPassages` already performs the same fragment load and paragraph extraction inside a request's CPU budget, which is the evidence that it fits; the implementation bead measures it (`wrangler dev --test-scheduled`, Workers CPU time).

### 4.4 The snapshot

One JSON value in `feed_state('snapshot')`, about 40 KB:

```json
{
  "builtAt": 1760623200000,
  "recent": [ { "report": "challenger-accident", "slug": "iii-findings", "sectionTitle": "III. Findings", "paragraph": "…", "anchor": "…", "excerpt": "…", "page": 45, "readers": 3, "lastSeenHour": 1760619600000 } ],
  "week": [ … up to 5 … ],
  "byReport": { "challenger-accident": [ … up to 3 … ] }
}
```

`recent` holds up to 50 after the diversity rules; `week` is rebuilt at most hourly from `feed_passage_days WHERE day >= ?` (7 days); `byReport` is the landing-page top 3. Paragraph ids are resolved through aliases at build time; section titles come from `loadReportMeta`; nothing in it identifies a reader.

### 4.5 Serving `/highlights`

- Read `feed_state('snapshot')` (1 row), render server-side, and serve through a Cache API wrapper keyed on the deploy id (like `cached()`), `max-age=60`. A deploy retires it; a snapshot change shows within 60 s at most.
- Editor's picks come from a generated module (extend `scripts/editorial.mjs` to write the picks, resolved with section slug, title and anchor, into `src/generated/editorial.ts` or a sibling), so they cost no D1 at all.
- Any failure (no binding, no table, bad JSON) renders the picks alone.

### 4.6 Relation to 6kky and #294

`feed_passages` is the per-passage counts table that 6kky's option (b) deferred, maintained by the cron instead of on every insert. Once the feed has run for a while, `/reports/:id/marks` could read it (`WHERE report = ?` on a new index) instead of grouping `marks`, which would end 6kky's "reads scale with marks × views" for good. That is not part of this design's beads (it changes the in-text shading's immediacy to the rollup's 10 minutes, and #294 already bounds the cost); it is noted on 6kky.

### 4.7 Budget at launch scale (A1, A2, A3, A5)

**Rows read per day (new feature only):**

| What | Typical | Worst | How |
| --- | ---: | ---: | --- |
| `/highlights` snapshot reads | 1,000 | 1,000 | 1 row per view, fewer with the 60 s cache |
| Landing-page block snapshot reads | 3,000 | 3,000 | 1 row per landing view |
| Watermark reads | 144 | 144 | 1 per run |
| New `marks` rows | 500 | 500 | rowid range |
| Prior-mark check | 1,500 | 20,000 | ~3 rows typical, 40 cap per mark |
| `feed_passages` lookups by key | 450 | 500 | primary key |
| `report_versions` pointer for verification | 450 | 2,600 | 1 per report touched per run |
| Pending promotion | 1,000 | 5,000 | `status='pending'` range |
| Snapshot rebuild (recent) | 7,000 | 29,000 | ≤200 rows, only on runs with changes |
| "This week" rebuild | 25,000 | 50,000 | ≤2,100 rows, hourly |
| **Total** | **~40,000 (0.8%)** | **~112,000 (2.2%)** | of 5,000,000 |

**Rows written per day:**

| What | Per day | How |
| --- | ---: | --- |
| `marks` inserts (exists today, not new) | 1,500 | 500 × 3 (row + 2 indexes) |
| `feed_passages` upserts | 1,350 | 450 × (row + `status_seen` index, ×1.5 for the update case) |
| `feed_passage_days` upserts | 900 | 450 × 2 |
| `feed_state` (watermark, snapshot) | ≤ 300 | only on runs with changes |
| **New total** | **~2,600 (2.6%)** | **~4,100 with marks (4.1%)** of 100,000 |

**Scaling:** reads grow with views only through the 1-row snapshot, so 10× traffic (100,000 views) adds about 40,000 reads. Writes grow with marks at about 8 rows each (3 for `marks`, 5 for the feed), so the free tier's 100k writes allow about 12,000 marks a day before anything else is counted; at 5,000 marks a day the feed and marks use about 41%. That is the trigger for Workers Paid (4g4d) or for coarser rollups, and `pnpm d1-usage` shows it. The 100,000 Workers requests a day free limit is a larger constraint than D1 at 10× traffic and is unchanged by this design.

The existing per-report marks reads (6kky) are not part of this table; #294 bounds them.

## 5. Policy: what may appear publicly

### 5.1 Threshold and delay (decision 0021 Q1)

A passage becomes `visible` when all hold: verified; not held, hidden or rejected; at least **K = 1** reader-day; at least **30 minutes since `first_seen`**. Counts are printed only from 2. Times are coarse (§3.2). Both K and the delay are environment variables (`FEED_MIN_READERS`, `FEED_DELAY_MINUTES`), so a change needs no code.

Why K = 1 and not the 2026-08-21 design's 3: production has had zero reader marks; at A2's 500 marks over 300 passages, most passages have one reader, so K = 3 would leave the stream empty for weeks and fail Rufus's "running updates". The privacy risk of K = 1 is that someone who knows you were reading the site at a given time could guess which passage was yours. The delay and the coarse hour break the link between "I just pressed Save" and "it appeared", and nothing shown or stored identifies anyone. K = 2 is the fallback if abuse or a complaint shows K = 1 is wrong.

### 5.2 Affected-community reports (decision 0021 Q2)

Strategy section 8 (63cd) makes Tier C passages "landing page only, never a card, post or thread", and with no review by the campaign groups "silence means Tier A only". A public stream of reader-chosen passages lifted out of the report is closer to a post than to the landing page, and Tier A cannot be judged automatically (it needs a reading of the grammatical subject). Default, until 63cd is decided: **reader passages from reports flagged `affected_community` (zh1w's flag; until it lands, the eight named reports plus the CIA torture report, hard-coded in one list) are rolled up with `status = 'held', reason = 'excluded-report'` and appear neither in the stream nor in a landing block.** They still shade the text inside the report itself, as today. When 63cd is decided, the options are an automated Tier C screen (the strategy's word list and the editorial files' private-people list) or keeping them out.

### 5.3 Short, long and offensive selections

- **Too short:** fewer than 4 words or 20 characters → `rejected, short`. (Today a selection of 2 characters can be saved.)
- **Too long:** stored in full, shown up to 300 characters (§3.2). A selection over 1,000 characters is refused at `/api/mark` (§5.4).
- **Offensive:** the words are always the report's own, so the risk is not invented text but report text taken out of context: slurs or smears the report quotes in order to condemn (Leveson, Hillsborough's "THE TRUTH"), and graphic material (the CIA torture report). A small blocklist of words in `src/lib/feed-policy.ts` puts a matching passage in `held, blocklist` (not shown until a person runs `pnpm feed show`). The affected-community default (§5.2) already covers the worst reports.
- **Manual removal:** `pnpm feed hide <key|url>` sets `hidden, manual` (§5.5), honoured at the next snapshot (≤10 min) plus the 60 s cache.

### 5.4 Abuse

- **Injected text:** impossible to display (§4.3).
- **Flooding:** the existing 40 marks per actor per report per day, plus a public cap: one actor can make at most **5 new passages per report per day** visible (`held, cap` beyond that; their marks still count toward other passages' readers).
- **Inflating counts** by rotating user agents from one IP creates distinct actors. Effect: a passage climbs "Most highlighted". Mitigations in v1: the delay, the hide command, and the kill switch. If it is seen in practice, a follow-up adds a second daily-salted hash of the IP's /24 (IPv4) or /48 (IPv6) and counts public readers by network; not built now because it stores a little more about each reader and the risk is speculative before launch.
- **Payload size:** `parseMarkPayload` caps `exact` at 1,000 characters and `prefix`/`suffix` at 64, rejecting larger with 400 (today unbounded).
- **Kill switches:** `FEED_ENABLED=false` (the page shows only Editor's picks; the cron stops promoting), `FEED_EXCLUDE="id,id"` (reports left out). Both are `[vars]`, so they need a deploy; `pnpm feed hide --report <id>` hides one report's passages in one D1 statement without a deploy.

### 5.5 Moderation tooling

`pnpm feed` (integrator only, remote D1 through `scripts/lib/d1.ts` so it lands in the usage ledger): `status` (counts by status and reason, today's visible items), `list --held`, `hide <key|?h= link>`, `show <key>`, `hide --report <id>`, `rebuild`. Each hide or show is one row write. A public removal log is the strategy's requirement for affected-community reports, which the default keeps out of the feed; it is not built here.

### 5.6 Privacy

- Stored: nothing new about readers. The feed tables hold passages, counts and times, no actor.
- Shown: report, section, page, words, a count from 2, a time rounded to the hour.
- Consent (decision 0021 Q4): counting stays on by default, as it is today, with accurate copy and an opt-out. On `/highlights/yours`, a checkbox "Count my saves and shares anonymously in Readers' highlights" (checked) writes `rtm.count-marks = "off"` to `localStorage`; `share.js` skips `/api/mark` when it is off. The byline becomes "Kept in this browser. When you save or share, the words (not you) are counted anonymously." The About page gets a short "What we record" paragraph.
- Removing a highlight on Yours does not retract its count (the actor rotates daily and the rollup only adds). Same-day retraction (`DELETE` by today's actor hash plus a rollup that subtracts) was considered and left out of v1: it doubles the rollup's logic for a case the delay and anonymity already make low-stakes. The Yours page says so in one line.

## 6. Alternatives considered

| Alternative | Why not |
| --- | --- |
| Query `marks` on every `/highlights` view (`ORDER BY created_at DESC`) | Needs a new index on `marks` (3 → 4 writes a mark); reads scale with views × window, the 6kky pattern that exhausted reads on 2026-10-03 (t4al); no place for verification. |
| Maintain counts inside `POST /api/mark` | Adds reads, writes and fragment-parse CPU to every mark on the request path, and the delay still needs something to run later. |
| Rebuild the snapshot lazily on a `/highlights` request (no cron) | Racy with two concurrent rebuilds, puts work on a reader's request, and nothing becomes visible while nobody visits. |
| Snapshot in KV | A new binding and service for one value; free KV writes are 1,000 a day (enough, but a second budget to watch). D1 one row is simpler. |
| Snapshot as an R2 object in `CONTENT` | That bucket holds immutable content-hash objects; mixing derived, mutable state in breaks a clean rule. |
| Live updates (polling, SSE, Durable Objects with websockets) | Cost and complexity, and moving content breaks the restrained design and screen readers; a 60 s cached page is "running" enough. |
| Threshold 3 (2026-08-21 design) | Empty for weeks at launch traffic (0 reader marks today). Kept as an option in 0021. |
| Threshold 1 with no delay and exact times | "Saved 1 minute ago" ties a reader's action to a public row; the 30-minute delay and hour rounding cost little. |
| Printing `exact` as posted | Anyone could publish arbitrary text on reportsthatmatter.org. Never. |
| Interleaving Editor's picks with readers' items, or giving them times | Poses as reader activity (decision 0014). |
| Keep `/highlights` personal; public at `/highlights/readers` or `/readers` | The nav link would still open on an empty page for every new visitor, which is the problem Rufus named. |
| Rename the nav link ("Readers' highlights", "Highlighted", "Saved") | Longer on a crowded phone header (0018); "Highlights" covers both tabs. |
| Rotating editor's highlights as "fresh" content | Fakes activity. Picks are a fixed, labelled list. |
| Include affected-community reports with an automated Tier C screen now | 63cd is undecided and campaign groups have not been asked; Tier A cannot be judged by a word list. Offered as the post-63cd option. |
| Opt-in counting | The stream would stay empty; today's behaviour is already opt-out-less counting, and the design adds the opt-out and honest copy. Offered in 0021 Q4. |
| A network hash against inflation now | Stores more per reader for a speculative risk; held as a follow-up (§5.4). |

## 7. Implementation beads (children of bght.10, all `stream:product`, unstarted)

In order; each lists its blockers. Full Goal, Where, Acceptance, Verify and Out of scope are in each bead.

1. **bght.10.1 Feed data and policy** (`level:judgement`): migration `0005_feed.sql`; `src/lib/feed.ts` rollup (watermark, prior-mark check, upserts, promotion) and `src/lib/feed-policy.ts` (length, blocklist, excluded reports, per-actor cap, K, delay) as pure, tested functions over a fake D1; `parseMarkPayload` length caps.
2. **bght.10.2 Rollup cron, verification and snapshot** (`level:judgement`, after .1): `scheduled` handler and `[triggers]`; verification through `contentFor`/`loadFragment`/`locate`; snapshot build with diversity rules and alias resolution; rows read and written measured in miniflare for the A1/A2 scenario; CPU per run measured.
3. **bght.10.3 Public /highlights page** (`level:judgement`, after .2): server-rendered Recently highlighted, Most highlighted this week, Editor's picks (g0w.5 picks or the `card: true` fallback, from a generated module); states of §3.4; Cache API 60 s; tabs; phone and accessibility checks.
4. **bght.10.4 Yours tab, honest copy and opt-out** (`level:specced`, after .3): move the personal list to `/highlights/yours` (noindex); "You have N saved" line on `/highlights`; byline and About copy; opt-out checkbox honoured by `share.js`; links from the popover.
5. **bght.10.5 `pnpm feed` moderation and kill switches** (`level:specced`, after .1): `status`, `list --held`, `hide`, `show`, `hide --report`, `rebuild` (reset the watermark and re-verify everything); `FEED_ENABLED`, `FEED_EXCLUDE`; AGENTS.md and release-checklist lines (the migration must be applied before the deploy that reads it).
6. **bght.10.6 Landing-page "What readers are highlighting"** (`level:specced`, after .2, P3): per-report top 3 from the snapshot; replaces the dormant `topMarkedPassages` call.
7. **bght.10.7 Production check after the first week** (`level:judgement`, after .3 and the ship, P3): `pnpm d1-usage` against §4.7, `pnpm feed status` (held and rejected reasons), a read of the visible items for anything that should not be there; adjust K, delay or blocklist through 0021 if needed.

The decision bead for 0021 does not block the build: implementation proceeds on the defaults, and each default is an environment variable or a one-line list.

## 8. Not in this design

- A filtered `/highlights?report=<id>` view, an Atom feed of highlights, a JSON API for other clients. Cheap from the snapshot later; an Atom feed is closer to "posting" and should wait for 63cd.
- Counting landings on shared `?h=` links as a signal.
- Merging overlapping selections of the same sentence into one passage (v1 shows at most one per paragraph instead).
- Accounts, sync, annotations (bght.5).
- Moving `/reports/:id/marks` onto the rollup (noted on 6kky).

## 9. Risks for the validator to check

- **CPU on Workers Free (10 ms):** the rollup's fragment parse. Mitigation: 25 verifications per run cap; measured in bght.10.2; if it does not fit, verify at most 5 per run (500 marks a day is ~3.5 per run) or wait for 4g4d.
- **Migration ordering:** the cron and page read tables that a deploy alone does not create; the integrator applies `0005` to production first (one-off, a few rows written). Code must treat a missing table as "feed off".
- **`export default` change:** `src/index.ts` exports `app` today; tests and scripts that import it must keep working.
- **Alias drift:** `feed_passages.paragraph` is stored as marked and resolved at snapshot time (j53o), so a re-ingest moves items correctly. A visible passage whose words a correction removed stays visible (verification runs once per passage) until `pnpm feed rebuild` (bght.10.5) re-verifies everything; the integrator runs it after a republish that changes text, and the item's link still lands (the ?h= fallback marks the paragraph and says so).
- **The 0021 defaults could be overruled** after build; each is a variable or a list, so that costs a deploy, not a redesign.
