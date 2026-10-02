# Alignment scorer: first results

**Bead:** reportsthatmatter-38s.2 (epic 38s). **Date:** 2026-10-02. **Builds on:** [`reference-editions.md`](reference-editions.md) (38s.1). **Usage:** [`../scoring.md`](../scoring.md). Measure-only: no pipeline or site behaviour changes.

## What was built

- **Mirrored references.** Each development and held-out report repo gets `reference/` on a branch (PRs below): `manifest.json` with edition, set, licence, source URL and SHA-256 of every mirrored file, caveats and, for Philip Morris, a `version` block; `blocks.jsonl`, the edition normalised to typed blocks (heading, paragraph, quote, list, note, table, contents) with heading level, printed paragraph number, footnote markers at character offsets and their note ids. HTML editions are mirrored under `reference/raw/` because Wayback and UKGWA are fragile; tagged-PDF references derive from the PDF already in `archive/`. Normaliser: `scripts/score/reference.py` (stdlib; pikepdf and pdfplumber for tags).
- **Scorer** in the site (`src/lib/score/`), next to `src/lib/quality`: it scores the corpus the site serves, it needs no ingest release to change, and it reuses the quality block helpers and the signals it evaluates. Promote to `@rtm/ingest` when a pass is judged by it (the quality plan's rule).
- **`pnpm score <id>`, `pnpm score --all [--holdout]`**: per report `errors.md` (worst examples per metric, clustered, with page, paragraph id and line), `score.json`, `signals.md`, `decisions.jsonl`; and a summary table.
- **Decision dataset** for 38s.8 (schema in `scoring.md`): 71,000 line-break boundary rows with layout features for the three development reports, plus block, heading and marker rows.
- **Signal evaluation**: each b78.2 signal's precision and recall against the scorer's errors.
- Tests: `tests/score.test.ts` (aligner on small fixtures: insertion, deletion, split words, different text left unaligned, repeated boilerplate; parser; one fixture with a defect of each kind; layout parsing).

Runtime: under 2 s per report (5 s for Philip Morris with layout), so it can run on every pin bump.

## Scores: development set

| report | boundary P | R | F1 | spurious splits | missed splits | heading P | R | level acc. | marker P | R | WER | OOV | ref coverage |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| us-911-commission | 93.5% | 88.7% | 91.0% | 184 | 336 | 95.5% | 64.0% | 92.9% | 97.7% | 90.5% | 0.40% | 0.11% | 95.6% |
| uk-saville-inquiry | 98.5% | 94.5% | 96.4% | 38 | 147 | 100.0% | 94.9% | 100.0% | 98.6% | 98.2% | 0.11% | 0.00% | 100.0% |
| us-v-philip-morris (version differs) | 94.3% | 98.8% | 96.5% | 485 | 97 | 93.2% | 98.0% | 99.1% | 10.5% | 2.1% | 0.88% | 0.05% | 95.1% |

Reference coverage is the share of the reference's words in blocks that aligned; the rest is excluded, not counted. Excluded stretches: 9/11's executive summary (9,069 words; a separate publication); Philip Morris's final judgment and remedial order (21,622 words, printed with the reporter's opinion, not in our amended opinion) and the two editions' tables of contents (different page numbers).

## Scores: held-out set (report only; never tune on these)

| report | boundary P | R | F1 | heading P | R | level acc. | WER | OOV | ref coverage | reference caveat |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| columbia-accident | 88.8% | 88.3% | 88.6% | 92.4% | 28.3% | 73.4% | 0.44% | 0.01% | 76.3% | tags miss figures and tables |
| uk-hillsborough-panel | 65.4% | 78.1% | 71.2% | 0% | 0% | – | 0.60% | 0.00% | 99.8% | one /P per page run: split at printed paragraph numbers only, so unnumbered paragraphs count as our spurious splits |
| uk-chilcot-inquiry | 92.2% | 93.8% | 93.0% | 100% | 100% | 100% | 14.95% | 0.58% | 98.9% | names missing from marked content (WER is the tags') |
| us-duelfer-report | 77.7% | 67.2% | 72.0% | 0% | 0% | – | 5.35% | 0.37% | 94.6% | HTML of chapters 1-2; our full.md is the unreleased repo main |

Marker metrics are empty where the reference has no linked markers (Hillsborough, Columbia, Duelfer); Chilcot's 283 tag markers are 215 bare numbers in ours (b94).

## Top error clusters (development set)

| report | cluster | count | reading |
|---|---|---:|---|
| 9/11 | table → our paragraph | 232 | ch.1 flight timelines and appendix A/B tables flattened into prose (17v) |
| 9/11 | marker at the right place, wrong note | 148 | one spurious `[^20]` in the ch.1 drop-cap garble consumes chapter 1's note 20; the renderer resolves repeated labels by order, so every later `[^20]` opens the wrong note (apk) |
| 9/11 | heading → our paragraph (run-in, fused) | 115 | bold subheads run into their paragraph (17v) |
| 9/11 | spurious split, mid-page, previous unfinished | 82 | figures and boxes interrupting a paragraph |
| Philip Morris | spurious split at a page break | 142 + 142 + 73 | page-break joins: paragraph (unfinished; and where the page ends a sentence) and quotations (cgr); the dataset shows 26% of page-break line breaks wrong (7go) |
| Philip Morris | quote → our paragraph | 127 | block quotations typed as prose |
| Philip Morris | bare marker / note in body | 78 / 59 | footnotes left in the body, '(...continued)' paragraphs (7go) |
| Saville | quote → our paragraph | 309 | boxed evidence extracts typed as prose (mkm) |
| Saville | quote→quote merged | 91 | consecutive extracts joined |

Held out, for scale only: Hillsborough fuses 293 headings into the following paragraph and carries 305 note paragraphs in its body (a8l); Columbia types 224 headings as paragraphs and has 373 note paragraphs in its body (wck).

## How well do the b78.2 signals predict these errors? (pooled, development set)

| signal | predicts | findings | precision | scorer errors | recall |
|---|---|---:|---:|---:|---:|
| severed-into-quote | spurious split | 298 | 57% | 707 | 24% |
| severed-paragraph | spurious split | 7 | 14% | 707 | 0% |
| severed-paragraph-capital (advisory) | spurious split | 267 | 82% | 707 | 31% |
| severed-* (any) | spurious split | 572 | 68% | 707 | 55% |
| bare-footnote-marker | reference marker we did not link | 64 | 100% | 133 | 48% |
| note-text-in-body | reference note in our body | 64 | 5% | 59 | 5% |
| furniture-paragraph | short paragraph not in the reference | 62 (5 located) | 100% | 196 | 3% |
| heading-* (any) | spurious heading | 80 | 18% | 42 | 33% |
| contents-entry-without-heading | reference heading we missed | 214 (6 matched a reference heading) | 17% | 136 | 1% |

Readings: the advisory `severed-paragraph-capital` is the most precise severed signal (82%) and is a candidate for a budget; `severed-paragraph` is nearly all false positives on these reports; together the severed signals catch about half the spurious splits, so the other half is a shape no signal has (mid-page interruptions, page ends that close a sentence). `note-text-in-body` misses Philip Morris's note paragraphs (they open on prose, not `12 See`). The heading signals find few of the spurious headings and none of the 9/11 and Hillsborough fused headings, which are the larger class. Nothing measured the wrong-note cascade before.

## The decision dataset (for 38s.8)

| report | boundary rows | page-break accuracy | in-page accuracy | block | heading | marker |
|---|---:|---:|---:|---:|---:|---:|
| us-911-commission | 17,997 | 88.0% (50 split, 1 join wrong of 426) | 97.3% | 2,989 | 725 | 1,718 |
| uk-saville-inquiry | 12,801 | 92.2% (31 split, 3 join wrong of 435) | 98.8% | 3,099 | 1,369 | 1,442 |
| us-v-philip-morris | 40,322 | 73.9% (411 split wrong of 1,573) | 99.6% | 9,008 | 3,025 | 94 |

Accuracy is over line breaks the reference covers whose next block is prose, quote, list, heading or contents. The pipeline's errors at page breaks are almost all splits where the reference joins: the first decision 38s.8 should model.

## Robustness to reference flaws

- Version differences: the manifest's `version` block marks Philip Morris; unaligned stretches of 200+ words are excluded and listed, and a reference block counts only when half its words align, so the 17 August reporter text does not charge us for the 8 September amendments. The amended opinion's renumbered footnotes show up as "bare number, number differs", not as missing text.
- Different text inside a gap is left unaligned unless its matched words form runs of three or more, so stray function words cannot invent boundaries.
- Repeated short notes ("Cameron Report, para 49.") are compared word for word before trusting the notes alignment.
- Reference parsing repairs: Saville markers left as plain text in the HTML ("2004,1 we express") are recovered from the following note; tag elements that open in lower case are joined to the element before (page-break fragments); Hillsborough's page-run /P elements are split at printed paragraph numbers.

## Limits and next steps

- Hillsborough's held-out boundary score is pessimistic: its tags do not separate unnumbered paragraphs. Its website HTML (Wayback) would be a better boundary reference.
- CAP has no heading markup; headings are inferred (I., A., 1., a., short all-caps lines), so Philip Morris heading scores are approximate.
- Layout features need a single source PDF; multi-volume reports fall back to block-level boundary rows.
- Next: put `pnpm score --all` beside `pnpm quality report --diff` in pin-bump PRs (38s.6); budget the precise advisory signal; start 38s.8 on the page-break join decision.
