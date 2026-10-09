# Launch-readiness audit, 2026-10-09

Stream: product. Production is https://reportsthatmatter.org (wrangler routes; workers.dev kept as the preview URL). Audited main at 9a3baea2 (v0.24.0, 16 reports) built in a worktree and served by `wrangler dev --local`, and read production over HTTP (about 650 requests in all: 80 page comparisons, the posting queue, 80 external links, Bluesky's public card extractor, three Lighthouse runs, three phone profiles). Nothing was written to production. Method scripts and screenshots are in the worktree's `audit-out/` (not committed).

## Launch blockers

None found. The campaign's own links work: all 68 posting-queue links return 200, land on the highlighted words with the panel on a phone (Pixel 7), and 66 of 68 serve the exact quote card as `og:image` (the other two: reportsthatmatter-ahzb, P3). All 129 `?h=` links on the landing pages and all 301 landing `?p=` links resolve; 197 `?h=` links (landing and queue) land with the panel and a mark. Production serves the same title, canonical, `og:image` and description as main on 80 sampled pages (16 landings, sections, `?p=`, `?h=`).

## Findings by area

### 1. Routes, links, heads

- 1,313 local requests across home, /reports, /about, /press, /highlights, /search (with and without a query), /changelog, /blog, feed, sitemap, robots, health, 16 landings, 16 `/full`, 16 marks, 800 section fetches (includes `/full` links), 301 `?p=` and 129 `?h=` links, and four 404 shapes. 1,262 unique internal links, 0 broken. 404s return 404 with a "Not found" page. `/processing` is 404 for the 8 reports without notes and is not linked from them.
- Head rules (`tests/seo-head.test.ts`): every page has one canonical with no query, `og:url` that keeps `?p=`/`?h=` (so two quotes from one section are two previews), `twitter:card=summary_large_image`, `og:image` with size and alt, JSON-LD on landings and sections; search results are `noindex`. sitemap and robots use `https://` on production.
- `?h=` quote cards: a link gets a quote card only when the words are a `card: true` highlight (23 of the 129 landing-page `?h=` links; all but 2 of the 68 queued links). The rest show the report's title card, as designed (bght.2 is the runtime card for any selection).
- Social descriptions are long: landing and some sections carry 300 to 560 characters as `og:description` (reportsthatmatter-ntjx).
- External citation links: 271 unique, 80 sampled. 15 failed; almost all are autolinked OCR fragments and line-wrapped URLs in the report text (`two.ls`, `q.cn`, `http://org.uk/wp-content/...`), not citations. Real source links (govinfo, justice.gov, nationalarchives, github) were fine; a few dead government pages (trinketsandtrash.org 404) are in the report text. Renderer fix in ingest: reportsthatmatter-y960.

### 2. Phones (iPhone 13 and iPhone SE in WebKit, Pixel 7 in Chromium)

- The highlight dock, share flow and `?h=` panel behave on the three profiles (`scripts/e2e-mobile.mjs`: all pass locally except the editor-label check, which needs seeded local marks; production shows "Editor's highlight" correctly).
- Fixed in the PR: the search page scrolled sideways on every phone (the report select was 835 px wide; now `max-width: 100%`); the landing panel showed `"So what?"”` (a straight quote inside curly ones; now `‘So what?’`).
- Not fixed: header nav and wordmark tap targets are 16 to 26 px (reportsthatmatter-nupj, decision 0016); at 320 px (iPhone SE 1st gen) the press wordmark, the landing's mono line and `/full` overflow by 5 to 28 px; text under 14 px is the mono chrome (12 px footer, 9 to 11 px page numbers and captions).
- Panel citation says P. 29, the post text p. 30, for a quote in a paragraph that straddles a page break (reportsthatmatter-p3o8).

### 3. Accessibility (axe-core, WCAG 2 A/AA/2.1 AA and best practice, desktop and Pixel 7, 15 pages)

- Fixed: color-contrast on every page (`--muted` #8a8a8c was 3.2:1; now #6e6e70, 4.8:1); the credit line's link in running text (underline, no opacity); two unlabelled `nav` landmarks (now "Main" and "Footer"); /about skipped h1 to h3.
- Open, from the ingest renderer: a permalink `a` directly inside `ul` (changelog and `/full`), empty `th`, heading jumps in report text (reportsthatmatter-fd08).
- After the fixes: no color-contrast or landmark violations; the remaining nodes are the renderer items above.

### 4. Performance (Lighthouse mobile, production)

| Page | Perf | A11y | LCP | TBT | Weight |
|---|---|---|---|---|---|
| /reports/us-911-commission | 81 | 92 | 2.9 s | 0 | 192 KiB |
| /reports/jack-smith-vol1?p=just-before-2-24-p | 99 | 87 | 1.6 s | 0 | 96 KiB |
| /reports/uk-leveson-inquiry/full | 25 | 85 | 15.1 s | 3.5 s | 2,956 KiB (10.9 MB decoded) |

The landing's LCP is render-blocked by the Google Fonts stylesheet (about 0.8 s). Leveson `/full` is the outlier (reportsthatmatter-te56). SEO 100 and best-practices 100 on the first two.

### 5. Social previews (Bluesky's public extractor, `cardyb.bsky.app`)

Seven links: the first queue item (quote card, title "Mr. Trump's Supporters Attack the United States Capitol — Jack Smith Report, Volume One", description the quote), the legacy-card item, a Hillsborough and a Lehman queue item, the 9/11 landing, a 9/11 `?p=` link, and Leveson `/full`. All gave a title, the quote or summary as description and an image, except Leveson `/full` ("Unable to generate link preview"; the other 15 `/full` pages are fine). Quote cards are 2400x1260, 80 to 175 KB; the default card is 291 KB (WhatsApp's commonly cited limit is about 300 KB). Facebook, LinkedIn and X validators need logins and were not run; tags were checked against the documented rules.

### 6. Copy (home and /about, read in full)

No spelling or factual errors. Questions of wording are in decision 0015 (reportsthatmatter-pbkk): "No commentary. No spin." beside editor's introductions; header nav lacks Blog while the footer has it; "since 2015" in the credit line.

## Fixed in this PR

`assets/styles.css` (muted contrast, search select width, footer credit link), `assets/passage-panel.js` (nested quotes in the panel's display), `src/templates/layout.ts` (landmark labels), `src/templates/about.ts` (h2 not h3; `.col h2` shares `.col h3`'s style), `tests/launch-audit.test.ts`.

## Beads filed (stream:product)

reportsthatmatter-te56 (P2, Leveson `/full`: no link card, LCP 15 s), reportsthatmatter-y960 (P2, junk autolinks in report text; ingest renderer), reportsthatmatter-fd08 (P3, renderer a11y), reportsthatmatter-nupj (P3, phone nav targets; decision 0016), reportsthatmatter-ahzb (P3, two queue items use cards `?h=` never serves), reportsthatmatter-p3o8 (P3, citation page differs), reportsthatmatter-ntjx (P3, long og:description), reportsthatmatter-pbkk (P3, copy; decision 0015). No P1: nothing found is launch-blocking.

## What emulation could not show

The OS selection menu and Android's Touch to Search bar (see the design doc, section 7); Facebook, LinkedIn and X rendering; Mastodon's body-size cap on the large `/full` pages.
