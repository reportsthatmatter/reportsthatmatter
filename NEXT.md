# Next

Triage on top of [issue #77](https://github.com/reportsthatmatter/reportsthatmatter/issues/77)
(the full map). This file is: what's next, who it needs, and where it's tracked.
Every row is a GitHub issue — the issue holds the detail, this is the
annotation. Updated 2026-08-22.

**Read [`AGENTS.md`](AGENTS.md) first**, then `./scripts/init.sh`. The done
condition is `./scripts/verify.sh`; after deploying,
`VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh`.

## Ready to pick up cold — one session each

Each of these is self-contained: the issue carries the brief, the method, and
what done looks like. They touch different parts of the tree and can run at the
same time, with one exception noted below.

| | | Touches | |
| --- | --- | --- | --- |
| [#99](https://github.com/reportsthatmatter/reportsthatmatter/issues/99) | **Imagery: study Co-Star, then a mark per report** | `docs/design/`, `assets/` | Write down what Co-Star's visual language actually is before making anything. Then a per-report image working almost as a logo, from public-domain photography or facsimiles of our own documents. Not started. |

## Smaller, also independent

| | | |
| --- | --- | --- |
| [#101](https://github.com/reportsthatmatter/reportsthatmatter/issues/101) | **Two-column layout** | Unblocks Columbia [#37](https://github.com/reportsthatmatter/reportsthatmatter/issues/37) and a class of sources. |
| [#102](https://github.com/reportsthatmatter/reportsthatmatter/issues/102) | **FCIC digit-dropping** | `pdftotext` silently drops every numeral. Needs OCR, and a detector so it cannot happen quietly again. |
| [#103](https://github.com/reportsthatmatter/reportsthatmatter/issues/103) | **No-space footnote markers** | ~230/844 Litvinenko notes render bare. Needs a note-number lookup, not another typographic guess — the first attempt corrupted a citation. |
| [#104](https://github.com/reportsthatmatter/reportsthatmatter/issues/104) | **Ingestion odds and ends** | Last 3% of footnote recall, 11 truncated PSI headings, heading ambiguity. |
| [#114](https://github.com/reportsthatmatter/reportsthatmatter/issues/114) | **Spike: remark vs markdown-it** | A recommendation, not a migration. Worth doing alongside whichever of #102–#104 lands next — that's where remark's structural footnote parsing would pay for itself. |
| [#106](https://github.com/reportsthatmatter/reportsthatmatter/issues/106) | **`corrections.yaml`** | Bigger lift, no open questions. Unblocks the review queues ([#105](https://github.com/reportsthatmatter/reportsthatmatter/issues/105)). |
| [#110](https://github.com/reportsthatmatter/reportsthatmatter/issues/110) · [#111](https://github.com/reportsthatmatter/reportsthatmatter/issues/111) · [#112](https://github.com/reportsthatmatter/reportsthatmatter/issues/112) | **UX odds and ends** | Page-number labelling, re-collapsing an expanded note, images in the changelog. |
| [#14](https://github.com/reportsthatmatter/reportsthatmatter/issues/14) | **Accessible link colour** | Quick. |
| — | **More reports** | Leveson [#32](https://github.com/reportsthatmatter/reportsthatmatter/issues/32) (source PDF already in the old repo), Saville [#39](https://github.com/reportsthatmatter/reportsthatmatter/issues/39), Chilcot [#67](https://github.com/reportsthatmatter/reportsthatmatter/issues/67), Philip Morris [#33](https://github.com/reportsthatmatter/reportsthatmatter/issues/33). Valukas [#24](https://github.com/reportsthatmatter/reportsthatmatter/issues/24) and Duelfer [#34](https://github.com/reportsthatmatter/reportsthatmatter/issues/34) need a browser to fetch the source. Chilcot and Leveson are heavily bulleted and wanted #12 first — that is done. |

## Needs Rufus

| | | |
| --- | --- | --- |
| [#77 branch A](https://github.com/reportsthatmatter/reportsthatmatter/issues/77) | **Launch** | Search Console, the `@ReportsThatMatter` account, the announcement thread. Parked at his instruction, 2026-08-21. Still the highest-value item on the board whenever it comes back. |
| [#99](https://github.com/reportsthatmatter/reportsthatmatter/issues/99) | **Picking a visual direction** | From rendered options, once they exist. |
| — | **Confirm the Workers plan upgrade** | Rufus, 2026-08-22: on Free, thought he'd upgrade to Paid. Not blocking — #115 (below) fixed the CPU-limit 503s on its own — but worth confirming it actually went through, since Free's 10ms-per-request budget is still tighter than this project needs to live near. |
| [#108](https://github.com/reportsthatmatter/reportsthatmatter/issues/108) | **PSI/Challenger re-ingest — judgement calls** | Review done, 2026-08-22 (`docs/PROGRESS.md`). **PSI: safe** — mostly improvements (TOC readability, a data table now one row per line), the already-expected #12 list change, and one narrow pre-existing defect (a footnote marker stranded across a paragraph break, moved not fixed). **Challenger: not safe** — #79's `TOC_ENTRY` whitespace-gap branch causes a 480-hunk regression specific to Challenger's OCR'd source (an unrelated word-degluing fix stops firing; isolated to #79 alone via the checkout-and-diff technique, confirmed against the source PDF). Neither report has been republished. Needs a decision: republish PSI as reviewed, and separately scope a fix for the OCR interaction before Challenger can follow. |

## Shipped and live

The mechanism Rufus named as the key one
([#109](https://github.com/reportsthatmatter/reportsthatmatter/issues/109);
design in [`docs/plans/2026-08-21-highlights-design.md`](docs/plans/2026-08-21-highlights-design.md)):

- [#94](https://github.com/reportsthatmatter/reportsthatmatter/issues/94) **Quote anchors** — share part of a paragraph and land on exactly those words.
- [#95](https://github.com/reportsthatmatter/reportsthatmatter/issues/95) **Saved highlights** — kept in the browser, listed at `/highlights`, exported as Markdown citations.
- [#12](https://github.com/reportsthatmatter/reportsthatmatter/issues/12) **Text out of order** — fixed after ten years open; the pipeline now has lists.
- Deferred deliberately: [#97](https://github.com/reportsthatmatter/reportsthatmatter/issues/97) accounts, [#98](https://github.com/reportsthatmatter/reportsthatmatter/issues/98) annotation.

Two rounds of fixes followed, both found by Rufus using it rather than by the
checks. Worth remembering when writing browser checks for anything
selection-shaped: they passed because they only tested selections shaped the way
the code already handled. Six shapes are covered now.

- [#96](https://github.com/reportsthatmatter/reportsthatmatter/issues/96) **Social proof** — what other readers marked, shown the same way a highlight is ever shown: the `.hl` wash, intensity scaled by reader count rather than a printed number. First cut used an underline plus a margin note; Rufus, 2026-08-21, called the underline "looks like wiki links" and the margin note a collision risk with the sidenote column, so both were dropped for the wash + a hover title. Threshold is 1 reader, not the design doc's 3 — no privacy issue with showing at one, same conversation. D1-backed (`reportsthatmatter-marks`); `/reports/:id/marks` is deliberately uncached so a passage can show up the moment it's marked.

- [#115](https://github.com/reportsthatmatter/reportsthatmatter/issues/115) **Pre-render report pages to static assets** — the fix for the CPU-limit 503s that hit production on 2026-08-21. `pnpm prerender` (`scripts/prerender.mjs`) renders every report once at build time; `/full` and each section are now literal static files, and the Worker only still does per-request work for a `?p=`/`?h=` quote link, `/sitemap.xml`, and the D1-backed "most marked" block. Worker script bundle dropped from 1.19MB to 150KB gzipped — report markdown no longer ships inside it at all, which also retires the old bundle-size ceiling. Deployed and verified against production 2026-08-22.

- [#100](https://github.com/reportsthatmatter/reportsthatmatter/issues/100) **Full-text search** — D1 + FTS5, same database as #96. `pnpm index-search` (`scripts/index-search.mjs`) builds the index from `pnpm prerender`'s own output (#115) — no separate render, so what's searchable can't drift from what's on the page. A result is a citable passage: the matched span becomes a real quote anchor (reusing `selectorFor`/`encodeAnchor` from `assets/anchor.js`), so following it lands on the exact words, highlighted, exactly like a shared link. `/search` reclaimed that path from the legacy-archive redirect list — the new native search is a strictly better landing than a redirect to a static archive's dead search. Reclaimed the section-heading bm25 boost from the design doc; skipped hand-maintained `content_version` in favour of a hash of the indexed body, which can't drift by forgetting a step. Deployed and verified against production 2026-08-22.
