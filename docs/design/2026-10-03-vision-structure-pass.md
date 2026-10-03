# Vision-model structure pass for the two scanned reports

**Bead:** reportsthatmatter-kyj3 (from zphc, `research/better-source-texts.md` §3.5; related 38s.3 and 38s.5). **Date:** 2026-10-03. **Tools:** [`scripts/vision/`](../../scripts/vision/README.md), library `src/lib/vision/`. **Measure-only:** nothing here changes a served text; the artefacts are the runner, the cached model output with a manifest, and ten hand-checked page references for each report (report-repo PRs).

## Short answer

- **The pass is cheap on a laptop and it works as a second witness.** granite-docling with Apple's MLX backend reads a page in a median 6.7 s (Jack Smith, 174 pages, 21.7 minutes; Challenger, 450 pages, 136 minutes, median 9.5 s, 84 pages over 30 s). The 80 to 100 seconds a page in the zphc probe was the CPU backend; we measured the CPU again on three pages: 268, 325 and 389 s, about 40 times slower than MLX here. No overnight run, no per-page fee.
- **The model gives structure, and the text layer must still give the words.** On the hand-checked pages the raw model output has the fewest word errors (0.6% on Jack Smith text pages, 0.9% on Challenger's golden pages, against 3.3% and 5.6% for the layer as extracted), but it also has failures a word count never shows: whole pages looped into hundreds of identical blocks, tables returned empty, footnotes tagged as body text, two paragraphs run together. The verifier catches every one of those because it aligns the model's words to the layer's and accepts a block only where they agree.
- **Verified structure beats the pipeline's where the pipeline is weak, and ties it where the pipeline is strong.** Challenger (the pipeline passes 0 of 7 golden pages): paragraph-start F1 78.7% for our served text, 87.2% for verified vision (89.4% lenient), 93.6% for the raw model; headings found 5.9% against 64.7% (raw 70.6%); notes and markers present at all (ours 0%). Jack Smith (the pipeline passes 3 of 8 golden pages, verified vision passes 4 strict, 5 lenient): paragraph-start F1 95.0% against 98.0% (99.0% lenient) on the nine text pages, markers recall 78.4% against 97.3%.
- **The whole-report run narrows this.** The ten pages flatter the pass. Over all 450 Challenger pages the verifier fully accepts 95 (21%) and rejects about half the blocks on 192 more, flags 163; where it rejects, the output falls back to the layer's plain text, so the whole-report layout-oracle counts for strict verified vision are worse than the pipeline's on paragraph starts (1,541 produced against 2,264, expected 3,953) and merged paragraphs (2,518 against 1,971), and better on over-split paragraphs and spurious quotations. Jack Smith (88% of words on pages with 80% or more of blocks accepted) is the easy case; Challenger's noisy layer is the hard one.
- **Recommendation (revised after the full run):** adopt verified vision structure for **Challenger as a per-page hybrid**, only on pages where at least 80% of blocks are accepted (151 pages, 41% of the words), through `cleanEdition` (ingest v0.19.0) behind the gate in §6; not report-wide; do **not** switch Jack Smith (small margin; the open defects, page joins and block quotations, are not ones a page-local model can see), and run the verifier there as a standing cross-check. Using the model's own words, which beat the layer's on both reports, would change served text and is left as a decision for Rufus. Cost: 2.3 hours (Challenger) and 22 minutes (Jack Smith) of laptop time, one to two days of adapter work, and review of the flagged pages (Challenger 163 of 450 flagged, 192 partial, 95 accepted; Jack Smith 14, 27, 133).

## 1. What was built

| piece | where | what it does |
|---|---|---|
| runner | `scripts/vision/run.py` | Renders each page with `pdftoppm` (150 dpi) and runs granite-docling (Docling's VLM pipeline; `--backend mlx` or `cpu`). Caches raw DocTags and Markdown per page under `<report>/.cache/vision/<pdf sha256>/<backend>/`, so a run is resumable and idempotent; `--manifest` writes `reference/vision/manifest.json` (per-page output hashes, seconds, Docling and model versions) and `doctags.jsonl.gz` (the raw output, committed, so every number below can be reproduced without the model: `--unpack`). |
| parser | `src/lib/vision/doctags.ts` | DocTags to typed blocks (heading, paragraph, list item, footnote, furniture, other) with a box each; finds the footnote markers the model left in body text, for the labels the page's own notes define. |
| verifier | `src/lib/vision/verify.ts`, `scripts/vision/verify.ts` | Aligns the model's words to the PDF text layer with the scorer's aligner (`src/lib/score/align.ts`); a block is accepted at 90% of its words in the layer and no run of more than 4 missing; accepted blocks carry the **layer's** words and the model's structure; rejected blocks keep the layer's words as plain text, flagged; runs of 4+ layer words the model never reached are kept and flagged. Short blocks whose few words the layer garbled ("II." read "11.", "Ibid." read "bid") are vouched for by the blocks either side and the size of the gap. The layout is a second witness for which blocks are footnotes (size at most 0.88 of the body's). Line-end hyphens are rejoined with the pipeline's own rule (`rejoinHyphenated`) before the check. A lenient setting (75% and a run of 8) trades word agreement for structure. |
| measures | `src/lib/vision/compare.ts`, `scripts/vision/compare.ts` | A page reference against four sources (layer, our served text, raw model, verified model): word error rate, block-start precision and recall, headings, note blocks, footnote markers, and a three-way tally of who reads each word right. |
| golden and oracle | `scripts/vision/structure-check.ts` | Builds `Block[]` and notes from the verified pages (with a simple page-join rule) and runs the pipeline's `checkGoldenPage` and `measureLayout` on them. |
| page references | each report repo, `reference/page-text/` | Ten hand-checked pages per report: `<pdf page>.txt` (blocks apart by blank lines, `# ` headings, `[^n]` markers), `<pdf page>.notes.txt`, `manifest.json` (label, stratum, method, sampling). |

Tests: `tests/vision.test.ts` (16): the parser (including the bug that a lazy match on `<unordered_list>` swallowed every list item, which made all Challenger findings vanish before it was fixed), the verifier (accepts, keeps the layer's word for a misread one, flags a dropped line, rejects invented text, anchors a garbled short block and refuses a wrong-size gap), the layout retype, the metrics.

## 2. How the references were made, and what they are not

Ten pages per report: the golden pages (`golden.yaml`: Jack Smith 8, Challenger 7, chosen by earlier agents for being hard and used to tune the pipeline) and random pages (seeded: `random.seed(20261003)`; Jack Smith 13 and 19; Challenger 92, 192, 274, of which 92 is blank and 192 a diagram, so they were replaced by the first two text pages of a seeded shuffle, 96 and 395). Each page was drafted from the model's own output (pages where it had looped, from the page image), then read against the image (110 dpi, 220 to 300 dpi crops for small print), and every word on which the draft and the layer disagreed was re-read at the image. The model was wrong in the drafts in telling ways: "evoke" for "revoke", "W.D. P." for "W.D. Pa.", "erosion" read as "operation", a digit dropped from a citation number ("SCO-1273339"), "B-8" for "B-3", "CACING", two paragraphs merged and a third split ("From the outset ..." run into the paragraph before it), a paragraph of Challenger p85 merged with the next. The layer was wrong in other places. A reader who finds an error in a reference should fix the file, not the metric.

What they are not: a second independent transcription (one checker, with the model's draft as the starting point, which biases towards the model's reading where I could not tell); a sample of the report (twenty pages; three of Challenger's ten are exhibit scans, which is why the Challenger "random" row is dominated by garbage layers). The golden pages are the pages the pipeline was tuned on, so its numbers there are optimistic; the tables give all three views.

The page references are named by PDF page. docs/scoring.md (the 7d4y branch) names them by `%%page N%%` label, and a loader that treats the file name as both would look up the wrong page here (the labels are printed numbers: Jack Smith PDF 30 is label 22, and a repeated number carries `#2`). Each `manifest.json` records `pages[<pdf>].label`; the loader should map through it.

## 3. Cost and runtime

| | Jack Smith | Challenger |
|---|---:|---:|
| pages | 174 | 450 |
| MLX wall time, all pages | 21.7 min | 136.2 min |
| median / 95th percentile / slowest page | 6.7 / 11.5 / 75.5 s | 9.5 / 63.5 / 168.2 s |
| pages over 30 s (looping or dense pages) | 2 | 84 |
| CPU backend | 3 pages timed: 268, 325, 389 s each | not run |

Hardware: the maintainer's Apple-silicon laptop, one process, no other GPU load except the Challenger run overlapping other agents' work, which inflates its tail. Software: Docling 2.132.0, mlx-vlm 0.7.4, `ibm-granite/granite-docling-258M` (the exact snapshot hashes are in each manifest). Money: none; the model is local and the weights are free. The cost is wall-clock time and attention: about 2.6 hours of laptop time for both reports, plus the reading of flagged pages. The slow pages are the ones where the model loops (an identical block repeated until the token limit); they take 60 to 170 s and are exactly the pages the verifier rejects. Pages over 30 s are 58% of Challenger's time (10% of Jack Smith's), so a per-page time limit and a repetition guard in the runner would more than halve it; not done, since the loop output is itself what the verifier is measured on.

The CPU backend was timed on three Jack Smith pages (10, 13, 19; the ten-page run was cut short by a machine reboot, and three timings agree to within 45%, enough for an order of magnitude): three pages timed, 268, 325 and 389 s, mean 327 s, so about 40 times slower than MLX on the same machine (the zphc probe's 80 to 100 s was a lighter page); a full CPU run of Jack Smith would take about 16 hours, which is why only three pages were timed.

## 4. What the verifier says about every page

`verification.md` and `verification.json` in each report repo's `reference/vision/` list every page: layer words, model words, coverage, blocks, rejected, first reasons. Strict setting, MLX output:

| | pages | accepted | partial | flagged | flagged with under 30 layer words (blank, figure) | flagged with real text |
|---|---:|---:|---:|---:|---:|---:|
| Jack Smith | 174 | 133 (76%) | 27 | 14 | 6 | 8 |
| Challenger | 450 | 95 (21%) | 192 | 163 | 86 | 77 |

Measured on layer words: Jack Smith has 80% of them on accepted pages and another 17% on partial ones, so 88% of all words sit on pages where 80% or more of the blocks are accepted (145 pages). Challenger has 24% on accepted pages, 58% on partial pages (1,922 of 4,029 blocks rejected there; mean coverage 85%) and 18% on flagged pages; only 151 pages (41% of the words) have 80% or more of their blocks accepted. Of Challenger's 77 flagged text pages, 13 are model output longer than 1.5 times the layer (loops or hallucinated text), 14 are near empty model output (tables, figures), and the other 50 are pages where the model and the layer both read something but disagree (exhibit scans whose layer is garbage, dense tables, pages whose layer lacks words). The verifier is doing its job: the flagged pages are the pages where a word count would have been misled.

## 5. Results against the checked pages

Ten hand-checked pages per report (see §2); full tables are what `scripts/vision/compare.ts` prints. Headline rows, nine Jack Smith text pages (the table page 146 left out, the model returns it empty) and Challenger's eight text pages (two exhibit scans left out for words; all ten for structure):

| | Jack Smith (9 pages) | | | Challenger (10 pages) | | |
|---|---:|---:|---:|---:|---:|---:|
| source | word error | block-start F1 | markers recall | word error | block-start F1 | headings recall |
| text layer | 3.3% | n/a | n/a | 13.7% (5.5% without exhibits) | n/a | n/a |
| our served text | 4.8% | 95.0% | 78.4% | 11.6% (3.3%) | 78.7% | 5.9% |
| raw model | 0.6% | 94.8% | 89.2% | 4.3% (0.8%) | 93.6% | 70.6% |
| verified, strict | 1.8% | 98.0% | 97.3% | 11.6% (2.1%) | 87.2% | 64.7% |
| verified, lenient | 1.8% | 99.0% | 97.3% | 11.5% (2.0%) | 89.4% | 64.7% |

Who reads a checked word right (both reports' text pages, layer against raw model): Jack Smith both 98.5%, only the layer 0.4%, only the model 1.0%; Challenger both 97.0%, only the layer 0.2%, only the model 2.5%, neither 0.3%. On Challenger's exhibit scans the layer is right on 14% of words and the model on 63%.

Golden pages (the pipeline's own structural assertions): Jack Smith pipeline 3 of 8, verified vision 4 of 8 strict and 5 of 8 lenient; Challenger pipeline 0 of 7, verified vision 1 of 7 either way (6 fail on block boundaries: page joins and quotations the page-local model cannot see).

The whole-report layout oracle (every page, pipeline against verified vision, strict; lower is better except produced starts):

| signal | Jack Smith ours | vision | Challenger ours | vision |
|---|---:|---:|---:|---:|
| headings missed | 22 | 97 | 170 | 251 |
| paragraphs over-split | 152 | 10 | 347 | 171 |
| paragraphs merged | 425 | 459 | 1,971 | 2,518 |
| quotes spurious / missed | 51 / 53 | 0 / 61 | 331 / 212 | 0 / 324 |
| markers spurious | 95 | 87 | 138 | 320 |
| paragraph starts produced / expected | 413 / 717 | 240 / 719 | 2,264 / 3,978 | 1,541 / 3,953 |

This is the result the ten pages do not show. Wherever the verifier rejects a block it falls back to the layer's words as plain text, so structure is lost exactly where the layer is noisiest, and over the whole of Challenger the strict verified output has fewer paragraph starts than the pipeline (1,541 against 2,264) and more merged paragraphs. It removes over-split paragraphs and spurious quotations, and does not improve anything else. The ten Challenger pages were chosen as text pages, and 7 of 10 are golden pages, so they flatter the pass; the whole-report counts do not.

## 6. Recommendation

**Adopt verified vision structure for Challenger as a per-page hybrid, and only on pages the verifier mostly accepts; do not adopt it report-wide; do not change Jack Smith.** The ten-page measurement favours it strongly (headings 5.9% to 64.7%, notes present at all, paragraph F1 78.7% to 87.2 to 89.4%), but the full run says that the gain is real on about 41% of Challenger's words (151 pages with 80% or more of blocks accepted) and absent elsewhere, so the earlier plan of making it the structure source for the whole report is withdrawn. The remaining pages stay on the pipeline.

1. Gate (per page): use the verified structure only where at least 80% of the page's blocks are accepted, lenient setting, and only when it does not lose paragraph starts against the pipeline on that page; otherwise keep the pipeline's blocks. This is an adapter (`cleanEdition` hybrid mode, ingest v0.19.0): one to two days.
2. Do not use the model's words. Raw model word error is lower than the layer's on both reports (0.6% against 3.3% on Jack Smith, 0.8% against 5.5% on Challenger's text pages, 63% against 14% on the exhibit scans), but accepting them would change the served text, which this task does not do and which is a question of direction, not a pass. It is the larger opportunity for Challenger's 77 flagged text pages and the exhibit scans: filed as a decision for Rufus (see the bead; no choice made here).
3. Jack Smith: leave the pipeline as it is. Run the verifier as a standing cross-check and review the pages where it and the pipeline disagree on block starts. The open Jack Smith defects (page joins, block quotations) are not ones a page-local model can see.
4. Cost to adopt: about 2.3 hours of laptop time for Challenger (resumable, committed as `doctags.jsonl.gz`, so no one needs to rerun it), 21.7 minutes for Jack Smith, the adapter, and a review of the 163 flagged Challenger pages (77 with real text).

## 7. Limits

- Ten pages per report, one checker whose draft started from the model's output (§2); three of Challenger's ten are exhibit scans and 7 of 10 are golden pages. Differences of a few points on 70 to 80 blocks are not significant.
- The whole-report oracle counts are the layout oracle's, with its own false positives; they are the only whole-report measure here, and they say structure is lost where blocks are rejected, not that the accepted blocks are wrong.
- The verifier's thresholds (90% and a run of 4; 75% and 8 lenient) were set on Jack Smith and read on Challenger; they were not tuned on Challenger's partial pages, where a looser setting would accept more blocks at the cost of word agreement.
- Single backend, single resolution (150 dpi); other resolutions (144, 200, 300 dpi) were tried on a few Jack Smith pages only (cache directories exist) and are not reported. The CPU backend was timed on three pages, not ten. Challenger's timing is inflated by other agents' work on the same laptop.
- The model is page-local: it cannot join a paragraph across a page break or know that a block quotation continues, which is why 6 of 7 Challenger golden pages still fail on block boundaries.
- Tables, figures and exhibit scans: the model returns tables empty or loops; the verifier flags them; nothing is recovered.
- No served text, id or editorial yaml moves in these PRs.

## 8. Entries for `docs/design/lessons.md`

Appended to `docs/design/lessons.md` in this PR (Measuring and Tooling themes):

- A hand-picked sample hides what a full run shows: the ten-page numbers favoured adopting the pass report-wide, the whole-report oracle counts did not. Always run the whole report before writing the recommendation.
- A background model run needs a checkpointed, resumable cache outside `/tmp` from the start: the reboot cost the sample log but not the 207 pages already cached.
- A verifier that falls back to the noisy source when it rejects makes structure worst exactly where the source is worst; report accepted-block share per page next to every structure metric.
