# Next

Triage on top of [issue #77](https://github.com/reportsthatmatter/reportsthatmatter/issues/77)
(the full map, kept current). This file is just: what's next, who it needs, and
where it's tracked. Everything below is a GitHub issue — this is the annotation,
the issue is the detail. Updated 2026-08-21.

## Needs Rufus

| | | |
| --- | --- | --- |
| [#96](https://github.com/reportsthatmatter/reportsthatmatter/issues/96) | **Social proof — showing what other readers marked** | The first thing here that stores anything about readers. Built, then a look before it ships. |
| [#99](https://github.com/reportsthatmatter/reportsthatmatter/issues/99) | **Visual texture** | You said the design is good and the imagery is missing. Direction is yours to pick — from rendered options, not a description. |
| [#108](https://github.com/reportsthatmatter/reportsthatmatter/issues/108) | **PSI / Challenger re-ingest review** | One lateral (not clearly correct) change in the diff. I'll do the review and bring you the judgement calls. |
| [#77 branch A](https://github.com/reportsthatmatter/reportsthatmatter/issues/77) | **Launch** | Search Console, the `@ReportsThatMatter` account, the announcement thread. Parked at your instruction, 2026-08-21. Still the highest-value item on the board whenever it comes back. |

## The mechanism — highlighting, sharing, social proof

[#109](https://github.com/reportsthatmatter/reportsthatmatter/issues/109) is the
overview; design in
[`docs/plans/2026-08-21-highlights-design.md`](docs/plans/2026-08-21-highlights-design.md).

| | | |
| --- | --- | --- |
| [#94](https://github.com/reportsthatmatter/reportsthatmatter/issues/94) | ~~**Selection anchors**~~ | **Done**, merged, not deployed. Highlight part of a paragraph and share exactly that. |
| [#95](https://github.com/reportsthatmatter/reportsthatmatter/issues/95) | ~~**Saved highlights + Markdown export**~~ | **Done**, merged, not deployed. Local-first; `/highlights` lists them, export is a pasteable citation. |
| [#96](https://github.com/reportsthatmatter/reportsthatmatter/issues/96) | **Social proof** | Hairline underline, count in the margin, threshold of 3. Needs your eyes. |
| [#97](https://github.com/reportsthatmatter/reportsthatmatter/issues/97) | **Accounts + sync** | Deferred on purpose until 1–3 earn it. |
| [#98](https://github.com/reportsthatmatter/reportsthatmatter/issues/98) | **Annotation** | Recorded, not to be built. Different product: moderation, identity, notification. |

## I can run with these

**Decided, unblocked, no open questions.**

| | | |
| --- | --- | --- |
| [#100](https://github.com/reportsthatmatter/reportsthatmatter/issues/100) | **Full-text search** | The four design questions are answered — D1 + FTS5, cross-archive, results are citable passages. [Decisions](docs/plans/2026-08-21-search-decisions.md). |
| [#101](https://github.com/reportsthatmatter/reportsthatmatter/issues/101) | **Two-column layout** | Unblocks Columbia [#37](https://github.com/reportsthatmatter/reportsthatmatter/issues/37) and a whole class of sources. |
| [#102](https://github.com/reportsthatmatter/reportsthatmatter/issues/102) | **FCIC digit-dropping** | `pdftotext` silently drops every numeral. Needs OCR, and a detector so it can never happen quietly again. |
| [#103](https://github.com/reportsthatmatter/reportsthatmatter/issues/103) | **No-space footnote markers** | ~230/844 Litvinenko notes render bare. The first attempt corrupted a citation; needs a lookup, not a guess. |
| [#104](https://github.com/reportsthatmatter/reportsthatmatter/issues/104) | **Ingestion odds and ends** | Last 3% of footnote recall, 11 truncated PSI headings, heading ambiguity. |
| [#106](https://github.com/reportsthatmatter/reportsthatmatter/issues/106) | **`corrections.yaml`** | Bigger lift, no open questions. Unblocks the review queues ([#105](https://github.com/reportsthatmatter/reportsthatmatter/issues/105)). |
| [#107](https://github.com/reportsthatmatter/reportsthatmatter/issues/107) | **Pre-render at build time** | Bundle is 1.43 MB of a 3 MB cap. Much cheaper before it bites than after. |
| [#12](https://github.com/reportsthatmatter/reportsthatmatter/issues/12) | **Text out of order** | Not fixed after all — spec written and posted to the issue, ready to implement — the current pipeline still reproduces it (evidence on the issue). Bullets run together and a wrapped item lands out of order, invisible to the fidelity checks because every word is still present. Blocks Chilcot and Leveson, both heavily bulleted. |
| [#14](https://github.com/reportsthatmatter/reportsthatmatter/issues/14) | **Accessible link colour** | Quick. |
| — | **More reports** | Leveson [#32](https://github.com/reportsthatmatter/reportsthatmatter/issues/32) (source PDF already in the old repo, four volumes), Saville [#39](https://github.com/reportsthatmatter/reportsthatmatter/issues/39), Chilcot [#67](https://github.com/reportsthatmatter/reportsthatmatter/issues/67), Philip Morris [#33](https://github.com/reportsthatmatter/reportsthatmatter/issues/33). Valukas [#24](https://github.com/reportsthatmatter/reportsthatmatter/issues/24) and Duelfer [#34](https://github.com/reportsthatmatter/reportsthatmatter/issues/34) need a browser to fetch the source, not a plain fetch. |
