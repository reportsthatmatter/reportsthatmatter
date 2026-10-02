# Alignment scoring against reference editions

`pnpm score` measures a report's text against an independent clean edition of the same document (official HTML, court reporter text, the PDF's own structure tree): paragraph boundaries, headings, block types, footnote links and words. Where `pnpm quality` (b78.2) counts shapes we already know to be wrong, the scorer says what is wrong against an answer key, including shapes nobody has catalogued. Design and inventory: [`design/reference-editions.md`](design/reference-editions.md) (38s.1); results and decisions: [`design/2026-10-02-alignment-scorer.md`](design/2026-10-02-alignment-scorer.md) (38s.2). Measure-only: nothing here changes the pipeline or the site.

## Commands

```bash
pnpm score us-911-commission          # one report (or several)
pnpm score --all                      # the development set: every report whose reference says set: development
pnpm score --all --holdout            # the held-out set: report scores only, never tune passes on these
  --out <dir>                         # default score-out/ (gitignored)
  --no-layout                         # skip pdftohtml layout features in the decision dataset
```

Each run writes, per report, to `score-out/<id>/`:

- `errors.md`: summary, excluded stretches, the block-type confusion matrix, a per-section table, the b78.2 signals' precision and recall against the scorer, then the worst examples per metric, clustered by shape (page break or not, previous block finished or not, types either side), each with the printed page, the paragraph id (`?p=`) and the `full.md` line. Read this first.
- `score.json`: every number in machine-readable form.
- `signals.md`: the b78.2 signals against the scorer's errors.
- `decisions.jsonl`: the labelled decision dataset (below), the input to 38s.8.

and `score-out/summary.md` (or `summary-holdout.md`) across reports: the score table, the top error clusters, and the pooled signal table.

Reference editions live in each report repo under `reference/`: `manifest.json` (edition, set, licence, source URLs and SHA-256 of every mirrored file, normaliser, caveats, and a `version` block where the editions differ) and `blocks.jsonl`. To test against report-repo branches, `RTM_REPO_ROOT=<dir>` reads `<dir>/<repo>` instead of the sibling checkout.

## Adding or rebuilding a reference

`scripts/score/reference.py` mirrors and normalises references (stdlib only; tagged-PDF references need `pikepdf` and `pdfplumber` in a venv):

```bash
python3 scripts/score/reference.py list
python3 scripts/score/reference.py fetch <id>    # download into <repo>/reference/raw/, record URL + SHA-256
python3 scripts/score/reference.py build <id>    # raw (or archive/ PDF tags) -> blocks.jsonl, update manifest.json
```

A new reference is an entry in `REFERENCES` (edition, set, licence, files, caveats, `version` if it is a different version of the text) and, for a new format, an adapter that emits blocks: `{type: heading|paragraph|quote|list|note|table|contents, level, num, text, section, markers: [{label, offset, note}]}`, notes as `{type: note, id, label, text}`. Footnote markers are removed from `text` and kept at their character offset. Commit the report repo's `reference/` on a branch and open a PR, like any report change.

## How the alignment works

1. Both editions become word streams (letters and digits, lower case, diacritics folded); footnote markers are taken out and kept at their word position. Body and notes are aligned separately.
2. Words are aligned monotonically: 7-word sequences unique in both streams are anchors, the longest increasing subsequence of anchors is the skeleton (so repeated boilerplate cannot pull it out of order), and gaps are filled by an exact LCS plus split/joined words ("tue sday" / "tuesday"). A gap whose matched words do not form runs of three or more is left unaligned: it is different text, not the same text with errors.
3. A reference block counts only when half its words align. Unaligned runs of 200+ words are reported as excluded stretches (version differences where the manifest says the editions differ, otherwise coverage gaps: front matter, a separately published executive summary), never as errors.
4. Block starts are compared within two words, one to one. A start of ours inside a reference block is a spurious split; a reference start we do not reproduce is a missed split. Headings are scored the same way, with level accuracy under the most common reference-to-our level mapping. A footnote marker is linked when ours sits within two words of the reference's and its note's words match the reference note's; a bare number next to where the marker belongs is reported as bare.
5. OOV is our words (in aligned blocks) that never occur in the reference, nor as two adjacent reference words joined.

## The decision dataset

`decisions.jsonl` has one row per pipeline decision, with `ref_*` labels from the reference (null where it does not cover the text) and `ours_*` for what we did; `correct` compares them.

- `decision: boundary`, `source: layout`: every break between two printed lines of body text (from `pdftohtml -xml`, cached under the report repo's `.cache/` by `@rtm/ingest`). Labels `ref_boundary`, `ours_boundary`, `ref_next_type`. Features: `crosses_page`, `skipped_lines` (furniture or notes between), `gap_after`, `line_spacing`, `font_change`, `size_change`, and for `prev_` and `next_` line: text shape (`chars`, `words`, `first` character class, `last` character, `ends_sentence`, `ends_hyphen`, `starts_label`, `caps_ratio`, `opens_quote`, `closes_quote`) and layout (`page`, `top_rel`, `left`, `indent` from the page's modal left, `right_gap`, `width_rel`, `size`, `size_rel`, `bold`, `italic`, `font`, `color`, `superscript`). Filter `ref_next_type` to paragraph, quote, list, heading or contents to leave out table rows.
- `decision: block`: every block of ours: `ours_type` against `ref_type` (the reference type of most of its words; `note` when its words are the reference's notes), with text shape and its first line's layout.
- `decision: heading`: blocks of 25 words or fewer and every heading: `ref_heading`, `ref_level`, `ours_heading`, `ours_level`.
- `decision: marker`: every reference footnote marker and its `outcome` (linked, wrong-note, bare, missing).

Without a single source PDF (multi-volume reports) or with `--no-layout`, boundary rows fall back to `source: blocks`: one per block start of ours and one per reference start we missed.
