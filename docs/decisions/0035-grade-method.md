# 0035. Which grade dimensions count toward a report's letter, and how are the uncalibrated checks weighted?

- **Status:** proposed
- **Date raised:** 2026-10-25 · **Date decided:** —
- **Decided by:** —
- **Beads:** reportsthatmatter-yyv1 (this decision), reportsthatmatter-38s.16, reportsthatmatter-38s.19

## Question

`pnpm grade` (38s.16) turns existing measurements into one grade per report on the decision 0030 thresholds. Five choices in it move letters and were made without data to settle them. Are they right?

## Context

The method is in [docs/scoring.md](../scoring.md#the-quality-bar-one-grade-per-report); the table is [reports/grades.md](../../reports/grades.md). On the 2026-10-25 records (ingest v0.29.0), 10 of 20 live reports are at B or better.

## Options

1. **Unmatched ids** (an old `?p=` link that now finds nothing). (a) Graded at one error each: 10 reports fall to C or below on ids alone (Columbia 36.9 per 10 pages, Litvinenko 23.9, Hillsborough 23.0, Deepwater 16.6, Challenger 14.0, Leveson 12.2, Saville 9.7, 9/11 8.8, Jack Smith 5.2, PSI 3.7), almost all from re-ingests before public launch. (b) Shown, not graded: a reader meets one only by following a link made before the id went, and we have no link data. (c) Re-baseline `aliases.yaml` at public launch and grade only ids lost after it. **Default now: (b); recommended: (c) from launch.** Ids that a re-ingest gives to other text (`reused`) are graded under every option.
2. **Words.** Page-level WER exists for 9/11 and Chilcot only, and on 9/11 (58.6 per 10 pages if graded) it is likely to be largely the difference (not yet read page by page) between the served GPO HTML and Wikisource's transcription of the PDF. **Default: shown, not graded**, until b78.6 (sampled review) or 38s.3 (vision gold) measures how much of it a reader would call an error.
3. **Uncalibrated precisions.** `note-off-page` has no golden-page score: counted at an assumed 50%. Page-anchor counts are read from `reports/anchor-budget.yaml` (a ratcheted budget, so an upper bound) at 100%. **Default: as stated**; the fix is to score both against golden pages.
4. **Page breaks on reference reports.** `docs/scores.json` records "ours wrong / judged" over all 30 adjudicated breaks, a third of them drawn where ours and the reference disagree, so the rate is biased upwards. **Default: use it as is** (it can only make a grade worse); record the random stratum in `scores.json` to remove the bias.
5. **A report's own precision at few findings.** A report's own golden-page precision replaces the pooled one at 5 counted findings, unsmoothed. Leveson's oversplits are 5 of 5 there, so 2,091 count in full (paragraphs 11.0 per 10 pages, D: the one dimension below C that makes it fail); Mueller's missed headings are 0 of 5, so 455 count as none. Options: (a) as now; (b) shrink towards pooled, `(tp + k*p_pooled)/(n + k)` with k = 5; (c) a higher minimum (10). **Default: (a); recommended: (b)**, which moves Leveson's paragraph precision to about 0.71 (P about 7.9, C) and Mueller's headings to about 0.17.

## Decision

Until decided, `pnpm grade` runs the defaults above.

## Consequences

Whatever is decided goes into `src/lib/grade/grade.ts` and the quality-bar section of docs/scoring.md; `pnpm grade --diff` shows the letters that move.

## Links

- [0030](0030-publishable-grade-bar.md): the thresholds and the publishable bar.
