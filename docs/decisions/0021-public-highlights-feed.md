# 0021. What may the public highlights feed show, and where do a reader's own highlights go?

- **Status:** proposed
- **Date raised:** 2026-10-16 · **Date decided:** —
- **Decided by:** —
- **Beads:** reportsthatmatter-bght.10.8 (this decision); feature bght.10 and its children bght.10.1-.7; related: 63cd (affected-community tier rule), g0w.5 (Editor's picks), 6kky and PR #294 (marks reads), zh1w (the `affected_community` registry flag), decision 0014 (editor's highlights)

## Question

Rufus, 2026-10-16: `/highlights` shows only the reader's own browser-kept highlights, so it is empty for every new visitor. He wants it to show running, anonymous updates of what readers are highlighting, with personal highlights on their own page. Building that needs five choices of direction: how many readers and how long before a passage is public; whether affected-community reports appear; the URLs; whether counting is opt-out or opt-in; and how the editor's highlights sit beside readers'.

## Context

- Design and numbers: [docs/design/2026-10-16-public-highlights-feed.md](../design/2026-10-16-public-highlights-feed.md). Implementation proceeds on the defaults below; each is an environment variable or a one-line list, so changing one later costs a deploy, not a redesign.
- Every Save and every Copy link or Share already sends the selected words to `POST /api/mark`, stored in D1 `marks` with a daily-salted hash of IP and user agent (no IP, user agent or cookie stored). The `/highlights` byline "Kept in this browser · never sent to us" is therefore inaccurate today.
- Production on 2026-10-16: 224 editor's highlights, 0 passages marked by any reader. The site has not launched.
- The public page will only ever print words verified against the published report text; spam and invented text cannot appear whatever is decided here.
- Strategy section 8 (63cd, undecided): in affected-community reports, Tier C passages are "landing page only, never a card, post or thread"; without the campaign groups' review, "silence means Tier A only".

## Options

**Q1. Threshold and delay before a reader's passage is public.**
- A. **1 reader-day, after 30 minutes, time rounded to the hour, count printed only from 2 (recommended default).** The stream has something in it from the first saves; the delay and rounding break the link between pressing Save and seeing it appear.
- B. 2 readers. Safer against one person's choice being visible; the stream stays mostly empty at launch traffic.
- C. 3 readers (the 2026-08-21 highlights design). Empty for weeks.
- D. 1 reader, no delay, exact times. Most "live"; ties a reader's action to a public row.

**Q2. Affected-community reports (Grenfell, Hillsborough, Post Office, Saville, 9/11, Deepwater, Challenger, Columbia; CIA torture report proposed).**
- A. **Left out of the public stream and the landing-page block until 63cd is decided; still shaded inside the report as today (recommended default).**
- B. Included when the passage passes an automated Tier C screen (the strategy's word list, the editorial files' private-people list).
- C. Included like any other report.

**Q3. Where things live.**
- A. **`/highlights` is the public page ("Readers"); the personal list moves to `/highlights/yours` ("Yours"); the nav label stays "Highlights" (recommended default).** A line on `/highlights` points readers with saved passages to Yours.
- B. `/highlights` stays personal; the public page is `/highlights/readers`. The nav link still opens on an empty page for new visitors.
- C. Rename the nav link ("Readers' highlights", "Saved"). Longer on a crowded phone header (0018).

**Q4. Consent to counting.**
- A. **On by default, as today, with truthful copy on Yours and About and an opt-out checkbox on Yours (recommended default).**
- B. Opt-in. Respectful, but the stream would stay empty.
- C. On, no opt-out (today's behaviour), with copy fixed only.

**Q5. The editor's highlights on the page.**
- A. **A separate "Editor's picks" block below readers' items, labelled, never interleaved and never with a time or count; g0w.5's `pick: true` list, falling back to one `card: true` highlight per non-affected report until it lands (recommended default).**
- B. Interleaved with readers' items. Poses as reader activity (0014).
- C. Not on the page. Then it can be empty.

## Decision

Proposed: A for each of Q1 to Q5. Awaiting Rufus.

## Consequences

- Implementation beads bght.10.1-.7 build to the defaults: `FEED_MIN_READERS=1`, `FEED_DELAY_MINUTES=30`, the affected-community list held out, `/highlights` public and `/highlights/yours` personal, counting on with an opt-out, Editor's picks as their own block.
- Q2 is revisited when 63cd is decided; if B, a follow-up bead adds the Tier C screen to `src/lib/feed-policy.ts`.
- If Q1 becomes B or C, it is an environment variable change; the page's thin and empty states (design §3.4) already cover a sparse stream.

## Links

- Design: [docs/design/2026-10-16-public-highlights-feed.md](../design/2026-10-16-public-highlights-feed.md)
- [0014](0014-editors-highlights.md) (editor's highlights are labelled, never counted as readers), [0018](0018-phone-header-navigation.md) (phone header)
- Earlier design: `docs/plans/2026-08-21-highlights-design.md` §4 (threshold 3), `docs/design/2026-10-03-sharing-and-highlights.md`
- Strategy section 8: marketing repo `strategy/2026-10-strategy.md`
