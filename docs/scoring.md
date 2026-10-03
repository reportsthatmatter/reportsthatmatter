# Alignment scoring against reference editions

`pnpm score` measures a report's text against an independent clean edition of the same document (official HTML, court reporter text, the PDF's own structure tree): paragraph boundaries, headings, block types, footnote links and words. Where `pnpm quality` (b78.2) counts shapes we already know to be wrong, the scorer says what is wrong against an answer key, including shapes nobody has catalogued. Design and inventory: [`design/reference-editions.md`](design/reference-editions.md) (38s.1); results and decisions: [`design/2026-10-02-alignment-scorer.md`](design/2026-10-02-alignment-scorer.md) (38s.2). Measure-only: nothing here changes the pipeline or the site.

## Headline numbers: `docs/scores.json`, dev and held-out sets, the scorecard

`pnpm score` with no arguments scores every report in [`reports/score-sets.yaml`](../reports/score-sets.yaml): the **development** reports (tune passes on these) and the **held-out** reports (report only; a pass must not lower them and must not be tuned on them; the file wins over each manifest's `set`, and `pnpm score` warns when they disagree). It prints the two sets separately and writes the headline numbers to the committed [`scores.json`](scores.json), each report with its `metrics`, and `previous` (the committed value when the new one differs; kept unchanged when a re-run moves nothing, so the delta of the last change survives). Per report:

| key | meaning |
|---|---|
| `boundary_p`, `boundary_r`, `boundary_f1` | paragraph boundaries against the reference |
| `join_all` (`join_all_n`) | page-break join accuracy over every page break the reference covers: our split-or-join agrees with the reference |
| `join_high` (`join_high_n`) | the same over `label_confidence: high` rows |
| `join_adj_ours_wrong`, `join_adj_judged` | adjudicated breaks (`reference/adjudicated.yaml`): "ours wrong / judged", the headline for a page-break pass |
| `marker_p`, `marker_r` | footnote markers (null where the reference has none) |
| `wer`, `wer_ref_coverage` | word error rate against the reference edition, and the share of the reference it covers |
| `wer_pages`, `wer_pages_n`, `page_marker_p`, `page_marker_r` | page-level references (Wikisource transcriptions, bead 7d4y): null until a report has them; the hook is `pageScores` in `scripts/score.mjs` and `headline()` in `src/lib/score/headline.ts` |
| `ref_error_rate`, `ref_no_answer_rate`, `ref_unusable_rate` | the reference's own error at adjudicated breaks, the share it has no answer for, and both together |

**Gating.** A report with no `reference/adjudicated.yaml` is printed but not recorded (`--ungated` records it): its reference's error rate is unknown. A reference whose error plus no-answer share exceeds the ceiling in `score-sets.yaml` (5% + 10%) prints a warning: its numbers say little (Chilcot's tags drop whole paragraphs). A held-out report whose boundary F1 falls against the recorded value prints a warning asking whether the pass was tuned on the held-out set. `--no-write` leaves `scores.json` alone; scoring a few ids merges them into the file.

**The release scorecard.** `pnpm scorecard` assembles `pnpm quality report --diff`, the layout-oracle counts per report, the golden-page table and the oracle's precision against it (from `pnpm ingest verify`; `reports/verify-last.json` is the recorded base), and the `scores.json` diff against `origin/main`, with a checklist, for the PR body of every ingest release (steps in [`scripts/ingest/README.md`](../scripts/ingest/README.md)). Lessons from each release go in [`design/lessons.md`](design/lessons.md).

## Commands

```bash
pnpm score us-911-commission          # one report (or several)
pnpm score                            # every report in reports/score-sets.yaml, the two sets apart; writes docs/scores.json
pnpm score --all                      # the development set only
pnpm score --all --holdout            # the held-out set only: report scores only, never tune passes on these
  --out <dir>                         # default score-out/ (gitignored)
  --no-layout                         # skip pdftohtml layout features in the decision dataset
  --diff <outA> <outB> [<id>...]      # decision-level flips between two runs (below); scores nothing
  --adjudicate-draft                  # also write <out>/<id>/adjudicated-draft.yaml: 20 random + 10 disagreeing page breaks to adjudicate
  --shadow                            # a report served from its clean edition: score its PDF shadow against the served text (below)
```

### Comparing two runs: `pnpm score --diff`

```bash
pnpm score --all --out score-before     # on the pinned ingest
# ... re-ingest with the change, aggregate, prerender ...
pnpm score --all --out score-after
pnpm score --diff score-before score-after [<id> ...] [--limit N]
```

The tables say a metric moved; `--diff` says which decisions moved it. It reads each report's `decisions.jsonl` from both directories and matches rows by what a pipeline change does not move: a layout page-break row by its page and the two lines either side, a block or heading row by its text and printed page, a marker by its label and the words around it. Per decision kind it counts rows unchanged, correct to wrong, wrong to correct, newly or no longer labelled, new and gone, then lists the flips with page and text. Rows whose text changed (a join, a split) appear as gone and new, not as flips. `pnpm ingest try` runs all of this for you against an unreleased ingest ([`scripts/ingest/README.md`](../scripts/ingest/README.md)). `pnpm score` also warns when `reports/<id>/full.md`, the site's aggregate that it reads, differs from the report repo's.

Each run writes, per report, to `score-out/<id>/`:

- `errors.md`: summary, the reference's own error rate at page breaks (below), excluded stretches, the block-type confusion matrix, a per-section table, the b78.2 signals' precision and recall against the scorer, then the worst examples per metric, clustered by shape (page break or not, previous block finished or not, types either side), each with the printed page, the paragraph id (`?p=`) and the `full.md` line. Read this first.
- `score.json`: every number in machine-readable form.
- `signals.md`: the b78.2 signals against the scorer's errors.
- `decisions.jsonl`: the labelled decision dataset (below), the input to 38s.8.

and `score-out/summary.md` (or `summary-holdout.md`) across reports: the score table, the reference error rates, the top error clusters, and the pooled signal table.

Reference editions live in each report repo under `reference/`: `manifest.json` (edition, set, licence, source URLs and SHA-256 of every mirrored file, normaliser, caveats, and a `version` block where the editions differ) and `blocks.jsonl`. To test against report-repo branches, `RTM_REPO_ROOT=<dir>` reads `<dir>/<repo>` instead of the sibling checkout.

## A report served from its clean edition: `--shadow`

A report whose `ingest.ts` declares `cleanEdition` (@rtm/ingest; reportsthatmatter-ivg, first us-911-commission) is served from that edition, so the edition is no longer an independent score of what we serve. Its PDF ingest still runs as the shadow, and `pnpm score <id> --shadow` turns the scorer round: the served `full.md` is the reference (`referenceFromMarkdown` in `src/lib/score/reference.ts`: block types, heading levels, notes and their markers) and the shadow is scored against it, written to `score-out/<id>-shadow/`. That keeps the report in the labelled set for the PDF pipeline (38s.8) with the served text, typography restored from the PDF, as the answer key. Needs the site's @rtm/ingest to know `cleanEdition`; adjudicated page breaks are not applied (they judge the HTML reference). `pnpm score <id>` without the flag still scores the served text against `reference/`, which now measures the edition adapter, not the PDF pipeline.

## The reference's own error rate: `reference/adjudicated.yaml`

Every reference edition is itself a pipeline output (tag trees, scraped HTML, OCR) and is wrong somewhere, worst at page breaks, where the question is whether a paragraph runs on. Each report repo commits `reference/adjudicated.yaml`: 30 page breaks decided by reading the PDF (`pdftotext` of the two pages and, where the text did not settle it, the rendered page image; `image: true` marks those), 20 drawn at random with a seeded shuffle from every page break the reference covers and 10 where our text and the reference disagree. Each entry has the physical `page` of the first line after the break, the dataset's `prev` and `next` lines, `verdict: join | split | unjudgeable`, `stratum: random | disagreement`, and a `note` where the call was made by content (a layout with no first-line indent and no spacing cue at a page top cannot be settled from the page alone). `pnpm score` matches each to the dataset's page-break row and reports, in `errors.md`, `score.json` and the summary table:

- the reference's error rate (adjudicated verdict against the reference's label), with a 95% Wilson interval, and ours;
- how many adjudicated breaks the reference has no answer for (a line none of whose words are in it: Chilcot's tags drop paragraphs whose names were links) and the combined "wrong or no answer" rate;
- the random stratum alone, the unbiased sample.

Rows matched to an adjudication get `adjudicated`, `label_confidence: adjudicated`, `correct_adjudicated_ref` and `correct_adjudicated_ours` in `decisions.jsonl`. To make one for a new report: `pnpm score <id> --adjudicate-draft`, read each break, fill in the verdicts, commit the file beside `blocks.jsonl`. Re-draw only when the layout parsing changes; the matching is by page, so an old file keeps working.

## Adding or rebuilding a reference

`scripts/score/reference.py` mirrors and normalises references (stdlib only; tagged-PDF references need `pikepdf` and `pdfplumber` in a venv):

```bash
python3 scripts/score/reference.py list
python3 scripts/score/reference.py fetch <id>    # download into <repo>/reference/raw/, record URL + SHA-256
python3 scripts/score/reference.py build <id>    # raw (or archive/ PDF tags) -> blocks.jsonl, update manifest.json
```

Hillsborough is a hybrid (`html_overlay`): the panel website's Wayback pages (mirrored under `reference/raw/`, `captured` URL per page in the manifest) where they hold a stretch, the PDF's tags for the rest (see [`design/2026-10-02-alignment-scorer.md`](design/2026-10-02-alignment-scorer.md), 38s.12).

A new reference is an entry in `REFERENCES` (edition, set, licence, files, caveats, `version` if it is a different version of the text) and, for a new format, an adapter that emits blocks: `{type: heading|paragraph|quote|list|note|table|contents, level, num, text, section, markers: [{label, offset, note}]}`, notes as `{type: note, id, label, text}`. Footnote markers are removed from `text` and kept at their character offset. Commit the report repo's `reference/` on a branch and open a PR, like any report change.

## How the alignment works

1. Both editions become word streams (letters and digits, lower case, diacritics folded); footnote markers are taken out and kept at their word position. Body and notes are aligned separately.
2. Words are aligned monotonically (the aligner is @rtm/ingest's `align`, shared with the hybrid source mode that stamps pages with it): 7-word sequences unique in both streams are anchors, the longest increasing subsequence of anchors is the skeleton (so repeated boilerplate cannot pull it out of order), and gaps are filled by an exact LCS plus split/joined words ("tue sday" / "tuesday"). A gap whose matched words do not form runs of three or more is left unaligned: it is different text, not the same text with errors.
3. A reference block counts only when half its words align. Unaligned runs of 200+ words are reported as excluded stretches (version differences where the manifest says the editions differ, otherwise coverage gaps: front matter, a separately published executive summary), never as errors.
4. Block starts are compared within two words, one to one. A start of ours inside a reference block is a spurious split; a reference start we do not reproduce is a missed split. Headings are scored the same way, with level accuracy under the most common reference-to-our level mapping. A footnote marker is linked when ours sits within two words of the reference's and its note's words match the reference note's; a bare number next to where the marker belongs is reported as bare.
5. OOV is our words (in aligned blocks) that never occur in the reference, nor as two adjacent reference words joined.

## The decision dataset

`decisions.jsonl` has one row per pipeline decision, with `ref_*` labels from the reference (null where it does not cover the text) and `ours_*` for what we did; `correct` compares them.

- `decision: boundary`, `source: layout`: every break between two printed lines of body text (from `pdftohtml -xml`, cached under the report repo's `.cache/` by `@rtm/ingest`). Labels `ref_boundary`, `ours_boundary`, `ref_next_type`. Features: `crosses_page`, `skipped_lines` (furniture or notes between), `gap_after`, `line_spacing`, `font_change`, `size_change`, and for `prev_` and `next_` line: text shape (`chars`, `words`, `first` character class, `last` character, `ends_sentence`, `ends_hyphen`, `starts_label`, `caps_ratio`, `opens_quote`, `closes_quote`) and layout (`page`, `top_rel`, `left`, `indent` from the page's modal left, `right_gap`, `width_rel`, `size`, `size_rel`, `bold`, `italic`, `font`, `color`, `superscript`). Filter `ref_next_type` to paragraph, quote, list, heading or contents to leave out table rows.
- Label confidence (boundary rows): `label_confidence` is `high`, `low` or `adjudicated` (null where the reference has no answer), with `label_flags` listing why a row is `low`: `ref-splits-lowercase-after-unfinished` (the reference starts a block in lower case after an unfinished one: a page-run fragment, a caption between paragraph halves), `ref-splits-unfinished-at-page-break`, `ref-joins-labelled-line` (the reference runs a numbered or bulleted line on) and `ref-note-or-table`. `ref_covered` is false, and `ref_boundary` null, where a line is in neither side's aligned words (`label_flags: line-not-in-reference`). Train and score on `high` and `adjudicated` rows, or report both.
- How lines are chosen (`prepareLayout`, 38s.12): on a two-column page (8 or more narrow lines in each half, under a fifth spanning the middle) lines are read column by column, a full-width line closing the band above it; on other pages by top then left, and a hanging paragraph label or bullet ("2.5", "\u2022") is joined to the text beside it. A page's trailing run of lines set below 0.9 of its modal size is footnote text (`note`), never its last body line. A body line is one whose words are in the reference, or in ours when it is not in a page margin (the reference may lack words); the break row pairs the last body line with the first of the next page, and a line with no aligned word of its own borrows the nearest one for its position (`prev_ref_unaligned`, `next_ref_unaligned`).
- `decision: block`: every block of ours: `ours_type` against `ref_type` (the reference type of most of its words; `note` when its words are the reference's notes), with text shape and its first line's layout.
- `decision: heading`: blocks of 25 words or fewer and every heading: `ref_heading`, `ref_level`, `ours_heading`, `ours_level`.
- `decision: marker`: every reference footnote marker and its `outcome` (linked, wrong-note, bare, missing).

Without a single source PDF (multi-volume reports) or with `--no-layout`, boundary rows fall back to `source: blocks`: one per block start of ours and one per reference start we missed.
