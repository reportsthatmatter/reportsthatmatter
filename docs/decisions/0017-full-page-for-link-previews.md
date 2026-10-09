# 0017. What does `/full` do for a report too big to preview, and to load?

- **Status:** proposed
- **Date raised:** 2026-10-09 · **Date decided:** —
- **Decided by:** —
- **Beads:** reportsthatmatter-te56 (the defect); reportsthatmatter-yvfr (this decision)

## Question

`/reports/uk-leveson-inquiry/full` is 10.9 MB of HTML (about 1.9 MB brotli). Bluesky's card fetcher answers "Unable to generate link preview" for it, and Lighthouse on a mobile profile scores it 25 (FCP 14 s, LCP 15 s, TBT 3.5 s). Do we change what `/full` serves for the largest reports, and how?

## Context

- The launch campaign links to landing pages and passages (`?p=`/`?h=` on the contents page and section pages), not `/full`. Anyone who shares a Leveson `/full` link gets a bare URL on Bluesky; the other 15 `/full` pages return a card (next largest: Philip Morris 4.4 MB, Jan 6 3.8 MB, PSI 3.1 MB). Mastodon's fetcher has a smaller body cap (not verified).
- The head is not the problem. On production the `<head>` of Leveson `/full` ends at byte 2,897 and `og:image` sits at byte 1,125. `tests/full-head.test.ts` now holds that for every report: all preview tags inside the first 16 KB. Bluesky's documented limit on the fetched body is not published; what we know is that it fails on 10.9 MB and succeeds at 4.4 MB, so it is a body-size or time limit, not a head-position one.
- `/full` is the target of existing `?p=` permalinks and of the "read it all" affordance; removing it would break those links.

## Options

- A. **Leave it.** The campaign does not use it. Cost: a bare URL when someone shares Leveson `/full`, and a 15 s mobile load for anyone who opens it.
- B. **Head-only page for link-preview fetchers on very large reports.** For `/full` where the body exceeds a threshold (say 3 MB), answer the known preview user agents (Bluesky cardyb, facebookexternalhit, Twitterbot, Slackbot, Mastodon, LinkedInBot, WhatsApp, Discordbot, Telegram) with the same head, a one-paragraph summary and a link to the contents page. Not search engines. Cost: user-agent branching (cache key must include it), and a page that differs by agent, which is common for previews but must stay limited to preview agents.
- C. **Drop or redirect `/full` for the largest reports** (to the contents page). Fixes both previews and load. Breaks `/full?p=` permalinks unless they are redirected to the section page, which the site can do (aliases already resolve a paragraph to its section).
- D. **Split or defer the body** (paginate, or load below-the-fold sections on scroll). Fixes load as well. The most work, and `Ctrl-F` over the whole report stops working on the page.
- E. **De-emphasise `/full` on mobile for reports over a threshold** (link text "Read all 10 MB at once", or hide it on small screens). Fixes nothing for previews; reduces accidental loads.

## Decision

Recommended default (not yet decided): **B for previews, plus E for load**, behind a size threshold so only Leveson is affected today. It keeps every permalink working, needs no change to the text, and fixes the only user-visible failure the audit found (the bare link). Revisit C or D if mobile load of `/full` turns out to matter in analytics after launch.

Done in this change: only the head check (`tests/full-head.test.ts`). Nothing about `/full` behaviour has changed.

## Consequences

- If B: a small branch in the `/full` route, a user-agent list kept in one place, a test per agent, and `Vary: User-Agent` on the response (edge-cache key). The head-only page needs the report's summary text, which the contents page already has.
- If C: `/full` redirects become part of the report's contract; the `?p=` redirect rule needs a test.

## Links

- `docs/research/2026-10-09-launch-audit.md` (PR #301)
- `tests/full-head.test.ts`
