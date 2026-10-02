# Quality harness, part 2: the plan

**Date:** 2026-10-02. **Bead:** reportsthatmatter-b78 (epic). **Derived from:** [`2026-10-02-quality-harness-catalogue.md`](2026-10-02-quality-harness-catalogue.md). **Status:** proposed, for Rufus's decision on §7; child beads b78.2–b78.7 are specced and ready.

## 1. The answer in one paragraph

Readers find defects because every check we have measures something other than what the reader sees: word counts, baseline moves, a rate gate set at the catastrophe. The catalogue shows fourteen defect classes, roughly 15,000 live instances, and zero found by a check. The fix is not fourteen more checks. It is a corpus lint with per-report counts and budgets that ratchet down, running in `verify.sh` on every change (so a regression anywhere in 13 reports fails the build and a new report cannot ship above the corpus's normal defect rate), backed by a small set of ground-truth pages verified against the PDF (so "right" is defined somewhere), and a layout oracle from the PDF's own font and position data (so structure, the weakest area, is measured against the document rather than against regexes). A sampled model read on each release estimates the rates the lint cannot and tells us the lint's precision. Readers remain the last line, and every reader report must end as a check that fails on the broken output.

## 2. What the catalogue says the design must do

- **Measure placement and order, not just words** (reasons 1–3 in the catalogue §2). Signals operate on blocks: what kind, what follows, where on the page.
- **Fail on day-one defects, not only on moves** (reason 2). Absolute counts with budgets, like the density check, not fingerprints.
- **Count per report, gate per report** (reason 4). Opt-in passes mean every report has a different defect profile; one corpus-wide threshold either misses Litvinenko or fails Leveson.
- **Read the shipped artifact with independent code** (reason 5). Signals read `full.md` and the rendered HTML as text, and the oracle reads the PDF, not the pipeline's block model.
- **Check plausibility against the document itself** (reason 6). The report's contents page and its fonts are the only structural ground truth we have; use both.
- **Be cheap enough to run on every change.** `pnpm ingest check` regenerates the whole corpus in 14 s; the catalogue's signal script runs over it in 2 s. The harness must stay in that order.

## 3. The layers

### 3.1 Corpus invariants with per-report budgets (b78.2, b78.3) — build first

`pnpm quality check`, in the site repo, after `pnpm corpus check` in `verify.sh`. Pure functions over each report's `full.md` plus `full-body.html`/`meta.json`, one per signal, each returning findings with a page number and excerpt. Counts are compared with `reports/quality-budget.yaml`; any count above budget fails the build and prints the first excerpts.

Why the site and not `@rtm/ingest`: the gate's subject is the corpus, which only the site sees; adding a signal must not need a library release and 13 pin bumps; and the density check already lives here. The promotion rule from `scripts/ingest/README.md` applies in reverse: when a signal becomes the measure a pass is judged by (as `pageBreakSplits` already is), it moves into `fidelity.ts` and the site imports it.

Why budgets and not thresholds: a threshold is a judgement about what is acceptable, and the catalogue shows we do not know that yet. A budget is a fact (today's count) plus a direction (down). The first version is green on today's corpus, which is the condition for it to land at all; every fix then lowers budgets with `pnpm quality ratchet`, which only ever writes smaller numbers. Raising a budget is a hand edit with a `# why: <bead>` comment, and the check fails on an uncommented increase against `HEAD`. A new report gets default budgets from the corpus median rate per 1,000 words, so a new ingest cannot ship with Litvinenko's furniture or Lehman's lists without a named exception.

The v1 signals, mapped to the catalogue classes and today's counts, are specified in b78.2: severed-into-quote (A, 843 + 354), severed-paragraph (B/C, 289 + 26) with an advisory capitalised variant (959, unbudgeted until its precision is measured), bare-footnote-marker (F, 9,032), note-text-in-body (E, 121 + 80, plus a per-report citation vocabulary where declared), furniture-paragraph (K/I, Litvinenko 241), contents-entry-without-heading (I, 1,908), heading-plausibility (H/I), printed-page-reversal (K, 18), rendered-h1 (N, 4), rendered-ol-words-share (J, Lehman 42.8%), ids-per-1k-words (J, existing), quote-share by page parity (D). Each has a vitest fixture cut from the catalogue's live example and must fail on it before it is trusted.

b78.3 adds the release discipline: `pnpm quality report --diff` against the counts recorded at the last release, pasted into every ingest release or pin-bump PR; `publish-report` prints the report's row; and the two gates the budgets supersede (`severedSentenceCheck` at 20%, `document has headings` > 0) become informational in `fidelity.ts`.

### 3.2 Golden pages against the PDF (b78.4) — build second

Signals say "this looks wrong". Nothing in the system says "this page is right", which is why every heuristic change is argued from diffs of outputs nobody has verified. Each report repo gets `golden.yaml`: five or more PDF pages with the paragraph count, headings, quotes, note numbers, markers and a few `must_contain` runs, verified by an agent against the page image and recorded with who and when. `pnpm ingest verify` regenerates the report and checks every entry. Pages are chosen from the catalogue's examples (so each class has a page that would catch its return) plus one ordinary page per report.

This is the ground truth the other layers calibrate against: the precision of each signal and of the oracle is measured on these pages before either gets a budget. It is also what the ingest library's existing `tests/fixtures/pages/` wanted to be and could not, because an input fixture with an ad hoc assertion is not a verified page.

### 3.3 Layout oracle from `pdftohtml -xml` (b78.5) — build third

The structural classes (H, I, J, K: wrong headings, missing headings, flat Leveson, uncitable lists) are where the corpus is weakest and where regexes are weakest. The PDF knows: `pdftohtml -xml` (poppler, already installed, 0.04 s/page) gives each line's position and a font with size and colour. Hillsborough's headings are maroon 18–45pt; its numbered paragraphs start 42 units left of the body; markers are small raised digits. Build a measure-only module in `@rtm/ingest` that derives expected headings, markers, paragraph starts and indented blocks per page from the layout and counts the disagreements with the pipeline's output: headings missed and spurious, markers unlinked and spurious, paragraphs oversplit and merged, quotes spurious. These counts feed `pnpm quality report` and, once their precision is measured on the golden pages, the budget file.

This is deliberately not a second parser and not a second extraction engine. pdftohtml is the same poppler the pipeline already pins its drift to; adding pymupdf or Tesseract would add a dependency and a second version to track. If the oracle proves too noisy on scanned reports (Challenger, Jack Smith), that is the moment to revisit, with the oracle's own numbers as the argument. Using the layout data to improve the pipeline (r19's "new extraction path") is a separate, later decision this measurement will inform.

### 3.4 Sampled LLM review on each release (b78.6) — build fourth

Two jobs a model does that regexes cannot: find the shapes we have not catalogued, and judge whether a flagged passage is a defect. `scripts/quality-review.mjs` samples ~60 passages per report (random blocks plus flagged ones), gives the model the catalogue's class list and the source page's text layer, and asks for structured labels. Output is a dated report: estimated rate per class per report with intervals, precision per signal, the worst twenty passages with live links, and new shapes. Run by hand on every pin bump and before a release; not in `verify.sh`.

Cost at list price (Sonnet 5.5, $2 in / $10 out per MTok): ~1.6M tokens in, ~0.16M out per run, about $5, or ~$2.40 through the Batches API. A full-corpus read (every block, ~100M tokens) is ~$100 batched: affordable quarterly, not per change. Haiku 4.5 is half the price if one run shows it agrees with Sonnet.

### 3.5 Reader-report intake (b78.7) — build alongside

Readers stay the last line. The rule to add to AGENTS.md: a text bug bead closes only when a signal or a golden page fails on the pre-fix output and passes on the fix, and the catalogue has the example. An issue template with the catalogue's classes, a `reader-report` label, and a "Report a problem with this passage" link in the share popover make a reader's report arrive with the paragraph id attached.

## 4. Mapping: classes to layers

| class | lint (3.1) | golden (3.2) | oracle (3.3) | LLM (3.4) | reader (3.5) |
|---|---|---|---|---|---|
| A severed into quotation | gate | page | paragraphs-oversplit, quotes-spurious | rate | |
| B severed at page break | gate (lower), advisory (capital) | page | paragraphs-oversplit | precision of the advisory | the shape that found ca3 |
| C severed mid-page | gate | page | paragraphs-oversplit | rate | |
| D body as quotation | parity gate | page | quotes-spurious | | |
| E footnote text in body | gate + citation vocabulary | page | | rate | the shape that found g1f |
| F unlinked markers | gate | markers | markers-unlinked (exact) | | |
| G spurious markers | heading/list markers, duplicate defs | markers | markers-spurious | rate | |
| H headings from captions | plausibility | headings | headings-spurious | | |
| I headings missing/fused | contents coverage, fused openers | headings | headings-missed, paragraphs-merged | | |
| J uncitable paragraphs | ol-words-share, ids/1k | paragraphs | | | |
| K furniture | furniture-paragraph, page reversals | must_not_contain | | rate | |
| L contents as body | ol-words-share, list page numbers | page | | | |
| M OCR garble | (weak) | must_contain | | rate | |
| N markdown hazards | rendered-h1, long paragraphs | | | | |

Every class has a gate or a page in the first two layers except M, whose honest answer is the sampled read plus the existing suspect queues.

## 5. How it runs

- **Every change, every worktree:** `verify.sh` runs `pnpm quality check` after `pnpm corpus check` (~2 s). A regression in any report fails. Peer noise in other agents' report repos shows as that report's row, same as the corpus check today.
- **Every ingest release and pin bump:** the integrator runs `pnpm quality report --diff <last release>` and pastes the table into the PR; regressions need a bead; improvements get `pnpm quality ratchet`. `pnpm ingest verify` runs the golden pages and the oracle (cached XML, ~5 min cold for the corpus, seconds warm).
- **Every release, by hand:** `pnpm quality-review` (~$3–5), its report committed under `docs/quality/`, new shapes filed.
- **Every new report (stage 1):** `report-preparation.md` step 3 becomes "run `pnpm quality report <id>`, read the excerpts, write five golden pages"; default budgets apply.
- **Quarterly or on demand:** the full-corpus model read (~$100).

Cost summary: build, roughly b78.2 two days, b78.3 one, b78.4 two (mostly page verification), b78.5 three, b78.6 one, b78.7 one; run, seconds per verify, minutes per release, under $5 per release in model time.

## 6. Order and why

1. **b78.2 lint + budgets.** Largest coverage for the least work; green on day one; immediately turns the catalogue's counts into regression protection and makes nen-style roll-outs (declare a pass, read the move) measurable. Start now.
2. **b78.3 ratchet + release report.** Makes 1 bite over time and gives the integrator the before/after table the protocol already asks for by hand.
3. **b78.4 golden pages.** Defines "right" for 65 pages; cheap; prerequisite for trusting anything else's precision.
4. **b78.5 oracle.** The only layer that reaches the structural classes properly; needs 3 to be calibrated.
5. **b78.6 LLM review.** Needs 1's signals to have something to estimate precision for.
6. **b78.7 intake.** Mostly docs and a template; land with 1.

In parallel, the four live-defect beads the catalogue surfaced (56s Litvinenko furniture and severed quotes; b94 unlinked markers corpus-wide; liv Challenger/Columbia division labels; x0n Lehman lists) are ordinary pipeline work and the first budgets to ratchet.

## 7. Decisions for Rufus

1. **Budgets start at today's counts (green day one), not at zero.** Recommended: yes. The alternative, a red verify until 15,000 defects are fixed, would be ignored.
2. **Signals live in the site, promoted to `@rtm/ingest` when a pass is judged by them.** Recommended: yes, for iteration speed; the oracle lives in ingest because it needs the PDFs.
3. **Spend ~$5 of model time per release on the sampled review, ~$100 quarterly for a full read.** Recommended: yes.
4. **Golden pages are verified by agents reading the page image, spot-checked by Rufus.** Recommended: yes; 65 pages is an afternoon.
5. **No second extraction engine now.** Recommended: use poppler's own `pdftohtml -xml` as the oracle; revisit with its measured precision on scanned reports.

Everything else in this plan proceeds without further input (protocol rule 11).
