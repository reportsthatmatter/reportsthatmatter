# Quality harness

`pnpm quality` counts the defects a reader sees in each report and holds every report to a budget that only moves down. Design and rationale: [`design/2026-10-02-quality-harness-plan.md`](design/2026-10-02-quality-harness-plan.md); the defect classes: [`design/2026-10-02-quality-harness-catalogue.md`](design/2026-10-02-quality-harness-catalogue.md).

## Signals

A signal is a pure function in `src/lib/quality/signals.ts` over one report's `full.md` and rendered page, returning findings (page number and excerpt). `pnpm quality report [<id>]` prints every signal's count per report; `pnpm quality check` (in `verify.sh`, after `pnpm corpus check`) fails when a gated signal's count exceeds its budget and prints the first excerpts. Advisory signals are reported, never gated.

## Budgets

`reports/quality-budget.yaml` holds the most findings each gated signal may report for each report. They start at today's counts, so the check is green on day one and fails on any regression. A report with no entry is held to the corpus median rate per 1,000 words.

- **Ratchet.** After a fix, `pnpm quality ratchet [<id>]` lowers budgets to the current counts, never up; add `--dry-run` to see what it would lower. `verify.sh` prints "N budgets can be ratcheted" when any budget sits 10% or more above its count.
- **Raising a budget** is a hand edit with a `# why: <bead id>` comment on the line, after reading the excerpts. `pnpm quality check` compares with `git show HEAD:reports/quality-budget.yaml` and fails an uncommented increase. `pnpm quality baseline --why <reason>` regenerates every number after a re-ingest; it is the integrator's, and it refuses to raise anything without `--why`.

## Release report

`reports/quality-last.json` holds every report's counts at the last accepted release. `pnpm quality report --diff [<ref>]` (default `origin/main`) prints the table against the copy at that ref, with deltas and regressions marked; paste it into every ingest release or pin-bump PR. After the release ships, `pnpm quality ratchet --record` re-snapshots the counts; commit the file. `pnpm quality row <id>` prints one report's counts, budgets and last-recorded numbers (`publish-report` runs it).

## Adding a signal

1. Cut a fixture from the broken text, a live example from the catalogue, into `tests/quality.test.ts`, with a clean counterpart.
2. Write the signal and watch it fail on the broken fixture and pass on the clean one before trusting it.
3. Run `pnpm quality baseline --why "new signal <id>"`; read the diff (the new key appears for every report), commit.
4. Add its catalogue entry. A bug bead for a defect it covers closes only when the signal fails on the pre-fix output and passes on the fix.

## Layout oracle

`pnpm ingest verify [<id>]` also measures each report against the PDF's own layout (`measureLayout` in `@rtm/ingest`, `src/oracle.ts`; plan §3.3, bead b78.5). `pdftohtml -xml` gives every printed line's position, font, size and colour; the oracle derives what the layout implies and counts where the pipeline's blocks disagree. It never fails the run and changes no output. `--findings` prints the first five of each signal; `--no-oracle` skips it. The counts, every finding, and the first 200 unlocated paragraphs are written to `<report-repo>/.cache/oracle.json` (self-ignored by git); the per-PDF XML is cached beside it as `layout-<sha256 of the PDF>.xml`, rebuilt only when the PDF or the installed poppler changes.

| signal | what the layout says | catalogue |
|---|---|---|
| `headings-missed` | a line, alone, in a face at least 2pt bigger than the body or in another colour (not smaller than the body, not a pull-quote, at most 3 lines and 160 characters, not running furniture) with no heading block on its page | I |
| `headings-spurious` | a heading block whose opening sits on a line in the body's own face | H |
| `markers-unlinked` | a raised run of digits in a body line with no `[^N]` for it on that page or the one before | F |
| `markers-spurious` | a `[^N]` on a page with no raised `N` on it or the next | G |
| `paragraphs-oversplit` | a block opens on a body line the layout carries on from the line above (no gap of 1.4 line pitches, no indent change, not after a heading, and on a page's first line not after a paragraph that ended short on the page before) | A, B, C |
| `paragraphs-merged` | a body line the layout opens (gap, indent or hanging label, after a non-body line, or on a label) with no block opening there | I |
| `quotes-spurious` | a quote block whose first line is not in a run of 2+ lines in from the body margin by 1em | D |
| `quotes-missed` | a run in from both sides with no quote block (informational) | A |

Margin, pitch and body font are measured per page and document (`openLayout`); the thresholds are `ORACLE` in `src/oracle.ts`. Marker linking is judged with the pipeline's own `linkInlineMarkers`, so a `markers-unlinked` is a marker the output really leaves bare. Elements the oracle cannot find on their source page (a heading built from a contents list, garbled OCR, a paragraph set in a callout face) are counted as unlocated, not as disagreements: they are the oracle's coverage gap, not a defect.

### Counts per report

Measured on ingest v0.16.0 plus this change, with each report's `ingest.ts` as it stood in its checkout on 2026-10-02.

| report | headings-missed | headings-spurious | markers-unlinked | markers-spurious | paragraphs-oversplit | paragraphs-merged | quotes-spurious | quotes-missed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| litvinenko-inquiry | 220 | 0 | 103 | 162 | 271 | 1,252 | 185 | 46 |
| jack-smith-vol1 | 96 | 37 | 37 | 82 | 169 | 423 | 51 | 52 |
| us-psi-financial-crisis | 153 | 5 | 514 | 33 | 155 | 808 | 228 | 74 |
| challenger-accident | 236 | 76 | 24 | 138 | 351 | 1,970 | 332 | 212 |
| uk-leveson-inquiry | 1,350 | 2 | 7,451 | 120 | 2,161 | 2,530 | 321 | 1,178 |
| columbia-accident | 93 | 4 | 503 | 19 | 541 | 723 | 290 | 214 |
| us-911-commission | 67 | 3 | 1,734 | 10 | 153 | 2,373 | 29 | 163 |
| us-deepwater-horizon | 334 | 0 | 2,132 | 599 | 401 | 896 | 31 | 72 |
| us-v-philip-morris | 0 | 27 | 38 | 19 | 1,175 | 855 | 267 | 212 |
| uk-hillsborough-panel | 390 | 0 | 931 | 0 | 125 | 790 | 22 | 49 |
| uk-saville-inquiry | 176 | 3 | 1,394 | 6 | 231 | 1,202 | 562 | 19 |
| uk-chilcot-inquiry | 13 | 3 | 283 | 3 | 16 | 382 | 6 | 73 |
| us-lehman-examiner | 45 | 5 | 233 | 20 | 209 | 214 | 150 | 94 |

Scanned reports (Challenger, Jack Smith) read through `pdftohtml -hidden`, which keeps the OCR text layer `pdftotext` also reads. Their fonts are the scanner's, so their heading and quote counts are noisier (see precision).

### Precision

**Not yet measured against golden pages**: b78.4 has not landed, so this is a hand adjudication of seeded random samples of each signal's findings, read against the PDF layout and `full.md` (Hillsborough, Leveson and Deepwater for most; the others where noted). Samples are 5 to 24 findings: read these as bands, not percentages, and recompute against the golden pages when they exist. **No oracle signal should be budgeted below "usable"** until then.

| signal | sampled | right | precision | where it is wrong |
|---|---:|---:|---:|---|
| `markers-unlinked` | 9 | 9 | high | none seen: the digit sits flush against its word ("companies.7", "detail.160") and the pipeline leaves it bare |
| `headings-missed` | 24 | 20 | usable (83%) | pull-quotes and table labels set big or coloured; Contents lines |
| `paragraphs-oversplit` | 18 | 15 | usable (83%) | notes-appendix entries and index lines (Deepwater); the first line of a page after a header |
| `paragraphs-merged` | 22 | 16 | usable (73%) | Deepwater's notes appendix (2 of 6), where hanging entries wrap at inconsistent lefts; the body pages of Hillsborough (8 of 8) and Leveson (6 of 8) are better |
| `quotes-spurious` | 11 | 9 | usable (82%) | quotations set in a smaller face; Saville's Q-and-A transcript (2 of 6): the layout does not inset it and the pipeline's call is the doubtful one |
| `quotes-missed` | 5 | 4 | rough (80%) | informational: the run must be inset on both sides |
| `markers-spurious` | 8 | 4 | low (50%) | an index entry or a notes-appendix line linked as a marker (real); a marker whose raised glyph is a different font or on the next page (oracle miss) |
| `headings-spurious` | 16 | 6 | low (38%) | headings the typesetter set in the body's own face (Philip Morris, Challenger's OCR); the Leveson ones sampled are real defects: an advertisement's "ENGAGE" and "LOVE CELEB GOSSIP? SO DO WE, SEND US YOUR STORY!" read as headings |

What it found that the other layers had not, each confirmed on the page: Hillsborough fuses its numbered paragraphs 2.4.168 to 2.4.172 into one block (`paragraphs-merged`) and reads its maroon subheads as body (`headings-missed`); Leveson cuts paragraphs at line groups ("Murdoch would remain Chairman of both companies.7" is a block of its own) and leaves its note numbers flush and bare (7,451); Deepwater links index entries as footnote markers ("Lee, Alvin,[^156]") (`markers-spurious`).

### Runtime

`pdftohtml` once per PDF, then parsed from the cache. Measured on an Apple-silicon laptop, with the pipeline's own extraction for scale:

| report | pdftotext (pipeline) | pdftohtml + parse, cold | read + parse, warm | oracle measure |
|---|---:|---:|---:|---:|
| uk-leveson-inquiry (4 volumes) | 2.4 s | 3.0 s | 0.2 s | 2.7 s |
| us-v-philip-morris | 1.3 s | 1.4 s | 0.1 s | 0.6 s |

A whole `pnpm ingest verify` with the oracle adds about 1 to 6 s per report warm (it regenerates the report in memory for its blocks); the cache is 4 to 7 MB per report.

## What it does not replace

`pnpm ingest check` still gates the pipeline's own output, and `digitDensityCheck`, `losslessCheck`, `retentionCheck` and the structural checks in `@rtm/ingest` still gate. The 20% severed-sentence rate and the "document has headings" check there are informational (the severed count is budgeted per report as `severed-into-quote`).

Where a report has a reference edition (a clean independent text), `pnpm score <id>` measures against it instead of against known shapes, and reports each signal's precision and recall against those errors: [`scoring.md`](scoring.md).
