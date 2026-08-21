# Next

Triage on top of [issue #77](https://github.com/reportsthatmatter/reportsthatmatter/issues/77)
(the full map). This file is: what's next, who it needs, and where it's tracked.
Every row is a GitHub issue — the issue holds the detail, this is the
annotation. Updated 2026-08-21.

**Read [`AGENTS.md`](AGENTS.md) first**, then `./scripts/init.sh`. The done
condition is `./scripts/verify.sh`; after deploying,
`VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh`.

## Ready to pick up cold — one session each

Each of these is self-contained: the issue carries the brief, the method, and
what done looks like. They touch different parts of the tree and can run at the
same time, with one exception noted below.

| | | Touches | |
| --- | --- | --- | --- |
| [#115](https://github.com/reportsthatmatter/reportsthatmatter/issues/115) | **Implement: pre-render to static assets** | `src/`, `wrangler.toml`, `scripts/` | #107's analysis is done and merged ([`docs/plans/2026-08-21-serving-architecture.md`](docs/plans/2026-08-21-serving-architecture.md)); this is the build. Do the plan-tier check first — it may stop tonight's class of 503 on its own — then the `/sitemap.xml` fix, then the pre-render move. **Most urgent: production hit CPU limits on 2026-08-21 and is green only because of two holding measures.** |
| [#99](https://github.com/reportsthatmatter/reportsthatmatter/issues/99) | **Imagery: study Co-Star, then a mark per report** | `docs/design/`, `assets/` | Write down what Co-Star's visual language actually is before making anything. Then a per-report image working almost as a logo, from public-domain photography or facsimiles of our own documents. |
| [#108](https://github.com/reportsthatmatter/reportsthatmatter/issues/108) | **Review the PSI / Challenger re-ingest** | `reports/`, `scripts/ingest/` | Rufus said go ahead. The method for isolating one pipeline change from the rest is in the issue. Bring back only the judgement calls, with the source page alongside. |
| [#100](https://github.com/reportsthatmatter/reportsthatmatter/issues/100) | **Full-text search** | `src/`, `scripts/` | Four design questions answered: D1 + FTS5, cross-archive, results are citable passages. Rufus, 2026-08-21: "just go ship it." Precise deep links come free from the quote anchors, which are built. D1 is already wired up (branch `social-proof-96`, unmerged) — add a migration alongside `migrations/0001_marks.sql` rather than re-plumbing the binding. |

⚠️ **#100 touches `src/index.ts` the same way #96 did.** Check whether
`social-proof-96` has merged before starting, to avoid a painful rebase.

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
| [#96](https://github.com/reportsthatmatter/reportsthatmatter/issues/96) | **A look before social proof ships** | Built on branch `social-proof-96` — a real D1 database (`reportsthatmatter-marks`), the `/api/mark` and `/reports/:id/marks` routes, and the display: a hairline underline plus "UNDERLINED BY N READERS" in the margin, and a "Most marked passages" block on the contents page. Threshold is 1 marker, not the design doc's 3 — Rufus, 2026-08-21: no privacy issue with showing at one. `./scripts/verify.sh` passes, including a real POST → D1 → underline round trip. Not merged or deployed; not in the remote D1 schema either. |
| [#99](https://github.com/reportsthatmatter/reportsthatmatter/issues/99) | **Picking a visual direction** | From rendered options, once they exist. |

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
