# Learning from aligned pairs: what the pipeline's wrong decisions look like, and how to make them

**Bead:** reportsthatmatter-38s.8 (epic 38s). **Date:** 2026-10-02. **Builds on:** [`2026-10-02-alignment-scorer.md`](2026-10-02-alignment-scorer.md) (38s.2), [`reference-editions.md`](reference-editions.md) (38s.1). **Scripts and generated results:** [`learning/`](learning/). Research and measurement only: no pipeline or site behaviour changes.

## 1. The answer

- **Page-break joins** (the weakest decision): the pipeline's wrong decisions are almost all splits where the paragraph runs on, and they fall into five shapes (§3). Two layout facts the pipeline never looks at separate right from wrong: whether the first line on the new page has a **first-line indent** relative to the line under it, and, on justified pages, whether the last line of the old page **runs to the right margin**. Hand rules built on them take page-break accuracy from **84.7% to 95.6%** on the development reports and from **80.8% to 88.9%** on held-out reports from other publishers. A decision tree trained on the development reports learns the same splits and does no better than the rules (87.3% held-out). **Adopt: hand rules in an ingest pass that reads per-line layout, plus an optional, cached LLM referee for the ~9% of page breaks the rules cannot settle**, where the referee is right 86% of the time against 77% for the rules and 75% for the pipeline, at $0.0024 a decision.
- **Block type (quotation or prose)**: a model trained across reports does not transfer (64–74% leave-one-report-out, against the pipeline's 87–98%), because each publisher marks a quotation differently: Saville by font, Philip Morris by indent, Chilcot by the quotation mark. Within one report a three-split tree reaches 93% on Saville (pipeline 87.6%). **Adopt: per-report typography declared or calibrated in the report's `ingest.ts` (a quotation font, like the existing `quoteInset(n)`), not a shared learned model.**
- **Heading or body** (short blocks only; fused headings are a boundary problem): a dev-trained tree ("bold or 1.17× the body size, and does not end a sentence") beats the pipeline on two held-out reports where the pipeline found no headings (Duelfer 77.7% → 91.8%, Hillsborough 90.9% → 98.3%) and loses on two (Columbia, Chilcot). **Adopt: as an opt-in fallback for reports with no declared heading convention.**
- **PDF-only reports** (Jack Smith, Deepwater, PSI, Challenger, Lehman, Leveson): the page-break rules transferred across four publishers and two column layouts with no retuning, so they should transfer; block type and heading conventions do not, so each new report needs its own typography calibrated, and a measured sample of adjudicated page breaks per report (§7) before we can say what we gained.
- **The references are noisier than the scorer assumed.** On held-out page breaks the reference was wrong in 19 of 185 rows checked against the PDF (10%), mostly in the tagged-PDF references (Hillsborough, Chilcot); and on two-column pages the dataset sometimes pairs lines from different columns (§2). Tagged-PDF references are poor boundary references at page breaks.

## 2. Data, method and reference quirks

**Data.** `pnpm score --all` and `pnpm score --all --holdout` on main (d4aaaa4) give `score-out/<id>/decisions.jsonl`: 71,120 boundary rows (one per printed line break, with `pdftohtml -xml` layout and text-shape features) for the development reports and 45,436 for the held-out reports; all seven reports have a single source PDF, so all have layout rows. The page-break subset scored here is 2,434 development rows (Philip Morris 1,573, Saville 435, 9/11 426) and 775 held-out (Hillsborough 348, Columbia 158, Chilcot 142, Duelfer 127): line breaks the reference covers, next block prose, quote, list, heading or contents.

**Derived features** (`learning/features.py`). Rows come in reading order, so each break also gets the line after `next` and the line before `prev`. From them: `next_first_indent_em` (next line's left minus the line under it, in ems of its font size: a first-line indent is positive, a hanging number negative, a run-on zero), `prev_short_em` (how much shorter than the line above), `page_ragged_em` (median right gap of the page's lines: 0 when justified, several ems when ragged-right) and the right-margin features only on justified pages. All lengths are in ems, because the first trees learnt Philip Morris's points (a depth-4 tree scored 34.7% on 9/11 before the change) and its page geometry (the first body line's height on the page, which differs per publisher); both were dropped.

**Discipline.** Hand rules were written from reading development errors. Learned models were chosen by leave-one-report-out on the development set (train on two, test on the third), then fitted on all three and scored once on the held-out reports. Held-out rows were read only after that, to explain the numbers and record reference quirks; nothing was retuned on them. Every number in this document is in `learning/results/*.md`, regenerated by the scripts.

**Reference quirks found while reading** (with how many page-break rows they touch):

| reference | quirk | effect on labels |
|---|---|---|
| Philip Morris (CAP) | some block quotations are run into the paragraph (¶592: "public health viewpoint: While one may be unable…") | a paragraph→quote split labelled as a join |
| 9/11 (HTML) | photo captions sit between the two halves of a paragraph; the second half opens in lower case | 11 lower-case "splits" |
| Saville (HTML) | boxed extracts are split at the PDF's own page breaks ("would become" / "impossible.") | 15 lower-case "splits" |
| Chilcot (tags) | one /P per page run, so a paragraph running over a page is two elements ("setting out six" / "tasks to be achieved"); bulleted findings kept inside the paragraph above | spurious splits; 13 bullets labelled as joins |
| Hillsborough (tags) | footnotes inlined into the paragraph at the page break (the reference text runs "…rather than have a Judicial Review 16. File held by Dr Popper… and hove [sic] to do the whole job"); page-run /P elements | the dataset's `prev` line is a footnote, not body; capital continuations labelled as splits |
| all, two-column (Columbia, Duelfer) | consecutive "body lines" can come from different columns | 11 of 196 pilot rows could not be judged |

A crude filter (the reference starts a block in lower case after an unfinished one) flags 53 page-break rows across the seven reports; results are given with and without them. The adjudication in §5 is the better measure for the held-out reports.

## 3. Error analysis: what the wrong page-break decisions look like

Clusters of the pipeline's wrong page-break decisions (`learning/errors.py`; first match wins):

| cluster | 9/11 | Saville | PM | Hillsb. | Columbia | Chilcot | Duelfer | all |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| capital after an unfinished sentence | 35 | 20 | 116 | 0 | 3 | 0 | 4 | 178 |
| lower-case continuation, our block a quote or list | 8 | 0 | 143 | 0 | 2 | 10 | 0 | 163 |
| lower-case continuation, both paragraphs (something between) | 1 | 0 | 19 | 45 | 21 | 0 | 23 | 109 |
| continues after a finished sentence | 3 | 7 | 70 | 0 | 2 | 0 | 1 | 83 |
| digit, bracket or quotation mark opens the next line | 3 | 4 | 63 | 0 | 1 | 0 | 1 | 72 |
| reference artefact | 1 | 3 | 0 | 0 | 0 | 21 | 0 | 25 |
| wrong join (we joined, the reference splits) | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| page breaks scored | 426 | 435 | 1,573 | 348 | 158 | 142 | 127 | 3,209 |

Eight examples per cluster were read against the PDF (`pdftotext -layout` around the break, `learning/show.py`) and the reference. What they are:

1. **Capital after an unfinished sentence.** "…addressed to Nancy Brennan Lund, now Senior Vice President for" / "Marketing at Philip Morris…" (PM p1049); "…linking the" / "Northern Alliance with Pashtun groups" (9/11 p141); "…as we mention below, Brian" / "Faulkner was on his way to London" (Saville p395). All genuine run-ons. `mergeAcrossPages` joins only a lower-case opening (or after an abbreviation), so every proper noun, "The" and "United States" at the head of a page splits the paragraph. On Saville the verso and recto text blocks sit at different lefts, so the first-line test must compare with the next line on the same page, not with the previous page.
2. **Lower-case continuation inside a quotation or list.** "…It was these claims and other Carlton ads to which smokers referred prior to exposure and" / "when discussing the fact that advertising had…" (PM p938, a block quotation running over the page). There is no quote+quote (or list+list) rule in `mergeAcrossPages`, and Philip Morris does not declare `pageBreakContinuations`. This is cgr's 143.
3. **Lower-case continuation with something between.** Philip Morris: the page ends in a footnote ending "(continued...)", left in the body (7go), so the continuation follows a note, not the paragraph. Hillsborough: the same with its notes (a8l). Columbia and Duelfer: a sidebar, figure caption or the other column interposes. The join rule is right; the blocks it sees are wrong. The fix is upstream (note separation, look past captions), not a better join rule.
4. **Continues after a finished sentence.** "…Dr. Benowitz has worked extensively on smoking and health issues." / "He has written over 300 peer-reviewed articles…" (PM p1031); "…Brazilian Patent P1 9203690A, filed on September 16, 1992." / "682515783-5803 (US 88089)…" (PM p612, a citation run belonging to the finding). Text alone cannot decide these. The layout can: the new page's first line is flush with the line under it (no first-line indent), and the old page's last line reaches the right margin.
5. **Digit, bracket or quote.** Philip Morris's citation strings ("TLT0903177-3180 (US 87527)…", "(US 85652); 682070007-0008…") and dates ("1972 and to mount an arrest operation", Saville). Same treatment as 1.

The pipeline almost never joins wrongly: once the reference artefacts are set aside, 1 wrong join in 3,209 page breaks. It is a one-sided error, which is why a looser join rule gains so much before it costs anything.

## 4. Hand rules and the learned models

**Rules** (`learning/pagebreak.py`, `hand_rules`):

- **R0** (a measuring stick): join when the next line opens in lower case (or `,` `;`) after an unfinished sentence, whatever the block kinds. Today's core rule without its block-kind gate.
- **R1**: join when the previous line does not end a sentence, and the next line is *flush* (its left is within 0.6 em of the line under it on the same page) *or* opens in lower case, and does not open on a label ("57.", "(b)", "9.88", "•"), and font and size do not change across the break.
- **R2**: R1, or the previous line ends a sentence but the page is justified, the previous line reaches the right margin (within 0.5 em), and the next line is flush, unlabelled, in the same font, and longer than four words.

**Page-break accuracy** (`learning/results/pagebreak.md`):

| decider | 9/11 | Saville | PM | dev mean | Hillsb. | Columbia | Chilcot | Duelfer | held-out mean |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| pipeline | 88.0% | 92.2% | 73.9% | 84.7% | 87.1% | 81.6% | 78.2% | 76.4% | 80.8% |
| R0 lower case, any block kinds | 87.8% | 89.2% | 82.5% | 86.5% | 85.3% | 95.6% | 82.4% | 95.3% | 89.6% |
| R1 | 96.2% | 93.1% | 93.1% | 94.2% | 84.2% | 94.9% | 78.9% | 96.1% | 88.5% |
| R2 | 95.3% | 93.1% | 96.6% | 95.0% | 84.2% | 95.6% | 78.2% | 96.1% | 88.5% |
| pipeline, or R2 (the pass as it would ship) | 95.3% | 94.5% | 97.1% | 95.6% | 85.6% | 95.6% | 78.2% | 96.1% | 88.9% |
| tree, depth 4 (dev: leave-one-report-out) | 92.0% | 92.6% | 93.8% | 92.8% | 83.3% | 93.7% | 76.1% | 96.1% | 87.3% |
| logistic regression (same protocol) | 92.3% | 91.0% | 92.5% | 91.9% | 82.8% | 93.7% | 64.8% | 89.8% | 82.7% |

Rules' development numbers are in-sample (written from reading these errors); the models' are leave-one-report-out. Held-out numbers are one scoring of deciders fixed beforehand, except the "pipeline, or R2" row, which was computed afterwards as the form a pass would take (it only adds joins to the pipeline's). Held-out Hillsborough and Chilcot are depressed by their references (§2, §5): adjudicated against the PDF, R2 is 93.3% right on a random held-out sample (the pipeline 85.0%).

On all line breaks, replacing only the page-break decisions moves Philip Morris from 98.57% to 99.48%, 9/11 from 97.07% to 97.25%, Saville from 98.56% to 98.59%; held-out Columbia 96.66% → 96.82%, Duelfer 93.26% → 93.47%. Page breaks are 3–4% of line breaks, but on Philip Morris they were two thirds of all boundary errors.

**The tree's top splits are the rules** (`learning/results/pagebreak-tree.txt`, depth 3, trained on all three development reports, class weights per report):

```
prev_ends_sentence = no
  font_change = no
    next_first_indent_em <= 0.60  -> JOIN    (1.43 : 0.09)
    next_first_indent_em >  0.60  -> split
  font_change = yes
    next_words > 12.5 -> join, else split
prev_ends_sentence = yes
  prev_width_rel > 0.99 and next_width_rel > 0.99 -> JOIN
  otherwise                                         -> split
```

Feature importance (depth 4): `prev_ends_sentence` 0.77, `font_change` 0.09, `next_first_indent_em` 0.04, `prev_width_rel` 0.03, `next_starts_label` 0.02. The tree adds nothing the rules lack and loses where it learnt a threshold specific to a development report; the logistic regression, which cannot express "flush *and* unfinished", is worse still. Candidate rules, in order of value: (a) unfinished + flush continues the paragraph, whatever the first letter; (b) never join into a labelled line; (c) a font change at the break blocks the join unless the next line is long; (d) on a justified page, a full last line plus a flush first line continues the paragraph even after a full stop.

## 5. LLM referee pilot

**Setup** (`learning/referee.py`). Ambiguous rows are held-out page breaks where the depth-4 tree's leaf is impure (0.1 < p(join) < 0.9) or tree and R2 disagree: 68 of 775 (9%). A random 130 of the other held-out page breaks were added for comparison. For each, Claude Sonnet (5.5, via `claude -p --model sonnet` with a one-paragraph system prompt and no tools) saw the last four lines of the old page and the first lines of the new one as `pdftotext -layout` prints them (indentation kept, running heads and footnotes included), after 16 few-shot examples drawn from the development reports across the five clusters and true splits, and answered JOIN or SPLIT, 20 cases per call. Answers are cached by case (`results/referee-cache.jsonl`).

**Cost.** $0.47 for 196 decisions at list price: **$0.0024 per decision**, about 570 input tokens each with the few-shot block shared across a batch of 20 (about 11,000 input and 265 output tokens per call). At the 9% ambiguity rate that is about $0.35 for Philip Morris's 1,573 page breaks, and a few dollars for the corpus; half that through the Batches API.

**Against the reference** the referee looked worse than the rules (67.6% on ambiguous rows, R2 82.4%, pipeline 83.8%). Reading its disagreements showed the reference was often the one wrong ("goaded by Nottingham Forest fans on the packed terrace" / "at the opposite, Spion Kop, end…", labelled a split by the Hillsborough tags). So every pilot row where any decider disagreed with the reference (79 of 196) was adjudicated against the PDF (`learning/adjudicate.py`, verdicts recorded per row): the reference was wrong on 19, and 11 could not be judged and were dropped.

**Against adjudicated labels** (`learning/results/referee-sonnet-adjudicated.md`):

| sample | n | reference | pipeline | tree | R2 | referee |
|---|---:|---:|---:|---:|---:|---:|
| ambiguous | 65 | 80.0% | 75.4% | 66.2% | 76.9% | **86.2%** |
| random (not ambiguous) | 120 | 95.0% | 85.0% | 93.3% | 93.3% | **95.8%** |
| both | 185 | 89.7% | 81.6% | 83.8% | 87.6% | **92.4%** |

R2 with the referee on the ambiguous rows only would be right on 168 of these 185 (90.8%), against 162 for R2 alone. The referee's 14 remaining errors are all JOIN where the truth is SPLIT: a new bullet, a new numbered paragraph, a contents entry, a heading, or a two-column page where the printed context interleaves columns. That is a prompt fix (say that a new bullet, number or contents entry is a split) and a context fix (give it our blocks, not the page's raw text), which should be tried on the development set first.

**Caveat.** I adjudicated with every decider's answer visible, so the adjudication can lean towards whichever was persuasive; the 19 reference errors are unambiguous on the page (sentences that plainly run on), and the X rows were dropped rather than guessed. Rows where every decider agreed with a wrong reference are not caught.

## 6. Block type and headings

**Quotation or prose** (`learning/blocktype.py`, `results/blocktype.md`). Across reports, a dev-trained tree is far below the pipeline (9/11 74.0% vs 97.7%, Saville 68.2% vs 87.3%, Philip Morris 64.2% vs 98.1%; held-out Chilcot 26.9% vs 88.6%). Its first split is "is this the document's body font?", which is right for Saville and meaningless for Philip Morris. Within a report, trained on odd pages and tested on even, a depth-3 tree reaches Saville 93.1% (pipeline 87.6%) and Chilcot 99.8% (88.8%; first split: opens on a quotation mark), and matches the pipeline on 9/11 and Philip Morris, where `quoteInset` already works. Saville by one feature, "not set in the body font → quote", is 91.1%: its boxed extracts are set in a second embedded Arial (`ODERGU+MArial`, 765 of 774 reference quotes) and its body in another (`NVULSW+MArial`), while `quoteInset(4)` looks for an indent the boxes do not have. Quotation style is a property of the document, so the decision belongs in each report's `ingest.ts` (declare the quotation font, as `quoteInset(n)` declares the indent), calibrated per report, not in a shared model. A referee would help here too (Saville's extracts are transcripts and minutes: "Q. Was it your view…", "The Prime Minister said that…"), but a font rule gets most of the gain for nothing.

**Heading or body** (`learning/heading.py`, `results/heading.md`; blocks of 25 words or fewer). Development: the pipeline is 97–99% right on these rows; the errors that matter (9/11's 115 run-in headings, 17v) are fused into paragraphs and are a boundary decision, not in these rows. A dev-trained depth-4 tree splits on bold (0.49), no sentence end (0.26) and size ≥ 1.17× body (0.17). Held out it fixes the two reports where the pipeline recognised no short headings (Duelfer 77.7% → 91.8%, Hillsborough 90.9% → 98.3%) and loses on Columbia (70.6% → 57.4%, whose tag reference counts sidebar and figure titles as headings) and Chilcot (100% → 95.6%). Useful as an opt-in default; not as a replacement.

## 7. Recommendations and how they sit in @rtm/ingest

| decision | adopt | form in @rtm/ingest | expected gain |
|---|---|---|---|
| page-break join, lower-case run-ons into quotes and lists | hand rule (text only) | extend `mergeAcrossPages`: quote+quote and list+list lower-case continuations join like paragraph+paragraph (opt-in option of `pageBreakContinuations`) | PM's 143 (cgr), 9/11's 8, Chilcot's 10; no layout needed |
| page-break join, capital / citation / after a full stop | hand rules R1/R2 on layout | a pass that receives per-line layout (left, width, font, size per printed line, from the `pdftohtml -xml` the scorer and the b78.5 oracle already parse) and decides each page-break pair; opt-in per report, then default once measured | dev 84.7% → 95.6%, held-out 80.8% → 88.9% (R2 93.3% against adjudicated labels on a random held-out sample) |
| page-break join, ambiguous 9% | LLM referee, optional | an offline step (`pnpm ingest referee <id>`) that sends ambiguous pairs to Claude and writes the answers to a committed cache in the report repo (`referee/pagebreaks.jsonl`, keyed by a hash of the two lines); ingest reads the cache and stays deterministic and offline; missing answers fall back to the rules | +6 of 65 ambiguous rows over R2 in the pilot; ~$0.0024 each |
| lower-case continuation with notes or captions between | fix upstream | note separation (7go, a8l, wck) and look past captions and sidebars (`photoCredits` generalised) | Hillsborough 45, Columbia 21, Duelfer 23, PM 19 |
| quotation or prose | per-report typography | `quoteFont(<font>)` beside `quoteInset(n)`, and a calibration report (`pnpm ingest typography <id>`) listing the document's fonts and indents with word counts and samples | Saville 87.3% → ~91% (mkm) |
| heading or body | opt-in learned fallback | `typographicHeadings()`: bold or ≥ 1.17× body size, short, no sentence end; for reports with no listed or numbered headings | Duelfer, Hillsborough on held-out |
| learned models in the pipeline | not now | keep trees as a research tool that proposes rules; ship rules | the tree did not beat the rules held out |

**Shipped: `quoteListRunOns` (38s.9, cgr).** A separate opt-in pass rather than an option of `pageBreakContinuations`, so a report that has not declared that one (Philip Morris, PSI, Lehman, Litvinenko, Chilcot) can take it alone. Quote+quote and list+list across a page marker, when the first stops mid-sentence and the second opens lower case (or `,` `;`) on no label of its own; a list item ending "; and" is finished; a cut word ("pro-" / "actively") closes up. Declared for ten reports: Philip Morris 141 joins, Leveson 81, PSI 42, Lehman 19, Litvinenko 15, Saville 11, Chilcot 4, and one each in 9/11, Challenger and Jack Smith; every join was read against the page. Columbia, Deepwater, Hillsborough and Duelfer do not move. The list+list half has no real example in the corpus yet (the lists that cross a page break all end items with ";"), so it is covered by tests only. Page-break join accuracy (`pnpm score`, rows the reference covers): Philip Morris 73.9% to 82.7%, 9/11 88.0% to 88.3%, Chilcot 78.2% to 79.6% (against its committed reference; two of its four joins sit on the reference's page-run /P artefact), Saville 92.2% to 89.7%: the reference splits Saville's boxed extracts at the PDF's page breaks ("would become" / "impossible."), so the eleven correct joins score as missed splits. Boundary F1: Philip Morris 96.5% to 97.3% (spurious splits 485 to 345), 9/11 and Chilcot unchanged to a tenth, Saville 96.4% to 96.2%.

**Built: `layoutPageJoins` (38s.10, ingest#39, not yet released).** R1 and R2 as an opt-in pass reading `context.layout`, deciding each paragraph+paragraph pair at a real page break that the text rules left split; `scanned: true` for OCR layers, and a `referee` hook (38s.11) called only on low-margin calls. Reading output added four guards: a footnote marker after a stop still ends the sentence ("…seal.21": without it Deepwater's flush new paragraphs were joined), "7.44" is a label (37 of Saville's first R1 joins were numbered paragraphs), the same face exactly except on a scan (a 9/11 map caption one point under the body), and no R1 after a last line 5 em or more short of the margin (Deepwater's index, 9/11's cast of characters). Declared for all 13 reports and Duelfer. Page-break join accuracy (rows the reference covers): 9/11 88.0% to 96.1%, Philip Morris 84.2% to 97.1%, Saville 89.3% to 94.5% (dev mean 87.2% to 95.9%); Columbia 91.9% to 94.4%, Hillsborough 76.4% to 77.6%, Chilcot 90.3% to 91.3%, Duelfer 89.0% to 91.5% (held-out mean 86.9% to 88.7%). On the adjudicated page breaks (38s.12) our errors fall from 31 of 89 to 6 on the development reports and from 34 of 119 to 29 held out; no adjudicated break is joined wrongly. Boundary F1: Philip Morris 97.3% to 98.6%, 9/11 91.0% to 91.6%, Saville 96.2% to 96.6%, the held-out reports within 0.1. PDF-only joins: Leveson 72, Lehman 54, PSI 35, Jack Smith 18, Litvinenko 15, Deepwater 14, Challenger 4, read against the page (all of the smaller sets, a random sample of the larger), all run-ons. `severed-paragraph-capital` falls in every report (366 in all); no quality signal regresses. What remains at page breaks is the lower-case-with-something-between cluster (notes, captions, the other column: all 11 of Hillsborough's adjudicated misses), list-into-quote continuations, and reference artefacts.

**PDF-only reports.** The page-break rules use nothing publisher-specific (ems, same-page comparison, justified-or-ragged detected per page), and they transferred from two US and one UK report to a UK tag-structured panel report, a NASA two-column report, a UK inquiry and a CIA two-column report without retuning. Deepwater, PSI, Lehman and Leveson are born-digital and should behave like the held-out set. Challenger and Jack Smith are scans: OCR line lefts wander with skew, so the 0.6 em flush tolerance will need measuring there, and the referee, which reads the words, is the safer decider on scans. Block type and headings will not transfer: each needs its typography calibrated. To measure any of this on a report with no reference, adjudicate a sample: 30 page breaks per PDF-only report, chosen as here (ambiguous plus random), answered by the referee and spot-checked against the page image, gives a small reference for exactly the decision being changed (bead below). The vision gold pages (38s.3) would give the same for block type and headings.

**For the scorer and the references** (38s.2 follow-ups): mark label confidence in `decisions.jsonl` (the artefact filter above); stop the Hillsborough tag adapter inlining footnotes into paragraphs; split Chilcot's bullets out of their paragraphs and treat its page-run /P elements like Hillsborough's; pick the body line, not a footnote line, as a page's last line (skip lines below the notes rule or in the note size); and order two-column pages by column before pairing lines. Hillsborough's website HTML (Wayback) would be a better boundary reference than its tags.

**For the synthetic benchmark (38s.4):** the hardest real shapes to reproduce are a capitalised run-on onto a recto page whose text block sits at a different left, a page ending on a full stop with the paragraph running on (no first-line indent on the next page), a block quotation running over a page with no inset on its first line, a citation string continuing a finding, and a footnote "(continued…)" between a paragraph and its continuation.

## 8. Reproducing

```bash
pnpm score --all && pnpm score --all --holdout           # score-out/<id>/decisions.jsonl
python3 -m venv .venv && .venv/bin/pip install -r docs/design/learning/requirements.txt
cd docs/design/learning
../../../.venv/bin/python errors.py       # results/pagebreak-clusters.md
../../../.venv/bin/python pagebreak.py    # results/pagebreak.md, pagebreak-tree.txt, ambiguous rows
../../../.venv/bin/python referee.py      # results/referee-sonnet.md (cached answers: no cost on rerun)
../../../.venv/bin/python adjudicate.py   # results/referee-sonnet-adjudicated.md
../../../.venv/bin/python blocktype.py    # results/blocktype.md
../../../.venv/bin/python heading.py      # results/heading.md
../../../.venv/bin/python show.py us-v-philip-morris "~ref_boundary and ours_boundary" 8   # read examples against the PDF
```

`show.py` and `referee.py` read the PDFs from the sibling report repos (`RTM_REPO_ROOT` overrides). The referee calls `claude -p`; set nothing else up.
