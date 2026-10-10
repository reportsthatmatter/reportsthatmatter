# Quality harness, part 1: the catalogue of defects the pipeline missed

**Date:** 2026-10-02. **Bead:** reportsthatmatter-b78.1 (child of the b78 epic). **Companion:** [`2026-10-02-quality-harness-plan.md`](2026-10-02-quality-harness-plan.md), the plan derived from this.

This is the shape of the problem: every class of text or structure defect that readers and agents have found in published reports and that no check caught, with concrete examples, how each was found, what signal would have detected it, and a measurement of how much of it is in the corpus today.

## 1. Sources and method

Sources: the 47 bug-type beads and the ingestion task beads in the site's Beads database (closed and open, 2026-08 to 2026-10), the running examples list in b78.1's notes, the GitHub issues on the report repos (jack-smith-report#1 is the only reader-filed one on a report repo; site issues #12, #13, #103, #104, #125 predate Beads), AGENTS.md's recorded incidents, and the ingest library's own fidelity checks.

Measurement: a throwaway Node script (`measure.mjs`, kept in the session scratchpad, not committed; the plan's first bead turns it into real code) run over the aggregated corpus as checked out on 2026-10-02: `reports/<id>/full.md` for the 13 live reports plus the pre-rendered `assets/generated/reports/<id>/{meta.json,full-body.html}`. Corpus size: 7,274 pages, 2.95M body words, 40,721 prose blocks, 7,715 block quotations, 1,646 headings, 3,339 list blocks, 17,727 footnote definitions, 40,670 paragraph ids. Each signal below is a cheap textual pattern; where the precision was checked by reading samples it is stated, otherwise the count is a candidate count, not a defect count.

Report short names in tables: jack = jack-smith-vol1, litv = litvinenko-inquiry, psi = us-psi-financial-crisis, chal = challenger-accident, lev = uk-leveson-inquiry, col = columbia-accident, 911 = us-911-commission, deep = us-deepwater-horizon, pm = us-v-philip-morris, hills = uk-hillsborough-panel, sav = uk-saville-inquiry, chil = uk-chilcot-inquiry, leh = us-lehman-examiner.

| | jack | litv | psi | chal | lev | col | 911 | deep | pm | hills | sav | chil | leh |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| pages | 149 | 326 | 627 | 360 | 1,937 | 229 | 446 | 337 | 1,682 | 362 | 479 | 145 | 195 |
| body words (k) | 47 | 125 | 242 | 132 | 983 | 162 | 193 | 163 | 477 | 184 | 156 | 57 | 33 |
| prose blocks | 447 | 2,235 | 2,413 | 2,809 | 12,667 | 3,203 | 2,529 | 2,025 | 6,112 | 3,062 | 1,859 | 952 | 408 |
| quote blocks | 77 | 559 | 924 | 627 | 2,114 | 435 | 110 | 74 | 1,916 | 39 | 579 | 197 | 64 |
| headings | 47 | 67 | 57 | 210 | 74 | 206 | 116 | 61 | 479 | 21 | 167 | 68 | 73 |
| footnote defs | 291 | 857 | 2,847 | 82 | 8,594 | 27 | 1,749 | 794 | 56 | 6 | 1,451 | 283 | 690 |
| ids per 1k words | 6.7 | 16.2 | 7.4 | 18.2 | 11.8 | 19.0 | 8.3 | 10.4 | 12.4 | 15.1 | 10.8 | 15.5 | 6.8 |

## 2. Why nothing caught them: the structural reasons

The individual bead notes converge on six reasons. They matter more than any one defect, because the plan has to remove the reasons, not add one check per defect.

1. **The gates count words, not where they landed.** `losslessCheck` and `retentionCheck` compare word multisets. A sentence cut in half, a footnote printed as a paragraph, 34,000 words of endnotes sitting in the body (60p), 816 paragraphs set as block quotations (eyc): all score identically to the correct output.
2. **Baselines record what shipped, not whether it was right.** `pnpm ingest check` and `pnpm corpus check` only fire on a move. Chilcot's 892 id-less paragraphs (4qw) and Philip Morris's 4,088 (9ek) were accepted into the baseline on day one and never moved.
3. **The rate gates were calibrated to catch the catastrophe, not the ordinary case.** `severedSentenceCheck` fails above 20% because the one incident it was built for scored 0.47. Litvinenko scores 9.8% today (231 of 2,348 paragraphs run straight into a quotation) and passes; so does everything else in §3.A.
4. **Opt-in passes make every report's blind spots its own.** `pageBreakContinuations`, `runningFurniture`, `geometry("per-page")`, `escapeNumberedParagraphs` each fix a class, but only where declared. Nothing measures the class on the reports that do not declare the pass (reportsthatmatter-nen is the manual version of that measurement).
5. **The checker shares code with the producer.** Non-ASCII paragraph ids vanished from `paragraphToSection`, search and the corpus baseline together (4k6), because all three read ids back with the same regex. A check built from the pipeline's own view of its output cannot see what that view omits.
6. **Structure is checked for existence, not plausibility.** "document has headings" passes at 1 heading for a 453-page report (Duelfer, 1l4) and at 10 wrong headings for Hillsborough (r19). "every footnote reference has a note" passes when 42% of the markers were never turned into references at all (§3.F).

### What exists today

| Check | Where | Sees | Blind to |
|---|---|---|---|
| `digitDensityCheck` | ingest `fidelity.ts`, `pnpm ingest verify` | a source text layer missing its digits | everything downstream |
| `structuralChecks` (page-number lines, form feeds, orphan refs, headings > 0, blank runs) | same | gross formatting | wrong headings, unlinked markers, misplaced text |
| `losslessCheck` (< 0.1% foreign words) | same | invented or mangled words | reordered, misclassified or misplaced text |
| `retentionCheck` (90–105% words) | same | wholesale loss | ~270 deleted citation lines in a 480k-word report (9ek) |
| `severedSentenceCheck` (< 20% paragraphs into quotes) | same | the Litvinenko catastrophe | the same defect at 9.8%, mid-page or across a page marker |
| `pageBreakSplits` | ingest `fidelity.ts`, measure only | lower-case continuations across page markers | capitalised continuations, mid-page splits; not a gate |
| `pnpm ingest check` (baseline.json) | site `scripts/ingest/cli.ts` | any move in a report's markdown | a report that was wrong from day one |
| `pnpm corpus check` (corpus-baseline/{id}.json) | site `scripts/corpus.mjs` | any move in rendered ids/sections | same |
| `paragraphDensityCheck` (≥ 4 ids per 1k words) | site `src/lib/density.ts`, in corpus check | a report with almost no citable text | everything above the floor |
| `pnpm editorial` | site | a quotation that is not verbatim, a citation that moved | the report's own text |
| verify.sh HTTP/browser checks | site | pages that fail to render, `p-1` ids, no sidenotes where the source has footnotes | the content of any paragraph |
| golden page fixtures (81 real pages) | ingest `tests/fixtures/pages/` | regressions on the specific pages already captured | every page not captured |
| `fidelity.md` OCR suspect queues | report repos | likely OCR garble, for a human | 999 open suspects nobody reads (#122) |

## 3. The defect classes

Each class: what the reader sees, examples (report, location, bead), how it was found, why no check fired, the automatic signal, and the measured count. "Found by" tallies at the end.

### A. Sentence severed into a block quotation (mid-page)

A paragraph stops mid-sentence and the rest of the sentence is set as a block quotation, because the scan is skewed or the lines are inset (a lettered sub-item, a quotation's own margin). The reader sees a quotation that never opened and a paragraph with no end; the quoted half has no paragraph id (dam).

Examples. Litvinenko 3.120, live today: `…a. Mr Litvinenko had been suffering from abdominal pain, profuse diarrhoea and` then `<blockquote>vomiting for two days when he was taken to hospital.…` (chapter on Barnet Hospital; 865 of 1,089 paragraphs were affected before `quoteInset(3)`, AGENTS.md; jvy is one surviving instance). Jack Smith p.5–6, one sentence in three blocks with the middle one a quotation (ca3, kb4; fixed by `pageBreakContinuations`). Challenger Conclusions pp.4–5, the quotation stops mid-sentence and resumes as plain paragraphs (m2y, open). Philip Morris findings: `told the other company presidents that` / `> they had taken definite steps…` (9ek's residue). Columbia's Mission Control transcript, every speaker turn split prose/quote (tk8).

Found by: reader (ca3, GH jack-smith-report#1), agent reading the rendered page (m2y, jvy), agent writing an introduction (9ek). Not caught because `severedSentenceCheck` is a 20% gate.

Signal: a prose block that does not end a sentence, immediately followed (no page marker) by a quote block opening in lower case; and, more broadly, any quote block opening in lower case without an opening quotation mark.

| signal | jack | litv | psi | chal | lev | col | 911 | deep | pm | hills | sav | chil | leh | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| prose → quote, lower-case, same page | 3 | 244 | 2 | 89 | 318 | 52 | 29 | 8 | 91 | 0 | 5 | 2 | 0 | 843 |
| quote block opens lower-case | 4 | 267 | 47 | 135 | 444 | 69 | 46 | 12 | 291 | 24 | 48 | 13 | 9 | 1,409 |

Precision: 10 of 10 sampled Litvinenko hits, 10 of 10 Leveson, 10 of 10 Philip Morris are genuine severed sentences. Columbia's 52 are the transcript (a defect, lower severity). Litvinenko's 244 is 10.9% of its prose blocks and is live.

### B. Sentence severed at a page break (paragraph to paragraph, or into a quotation)

The page-foot half and the page-top half of one sentence become two paragraphs with two ids, or the second half is a quotation. Causes: a paragraph that fills the page leaves two markers in a row and the merge looked past one (ca3); the continuation opens on a capital or a quotation mark so no join rule fires (1xr, q0m); a photo credit or caption sits between the halves (xay).

Examples. Jack Smith p.3/4 `…knowingly false claims of election` / `fraud-and the evidence shows…` (ca3). Lehman: `…affirmatively represented those` / `"low" leverage numbers to investors as positive news, created a misleading portrayal of` / `Lehman's true financial health.80 …` — one sentence, three paragraphs, three ids, ~25 instances (1xr, open). Deepwater p.55, 72, 181, 250: the continuation joins to `Mark Wilson/Getty Images` (xay, open). PSI: `…which exposed them to the risk of losses` / `> from changes in interest or prepayment rates…`.

Found by: reader (ca3), agent reading `/full` (1xr), agent fixing eyc (xay). Not caught: `severedSentenceCheck` looks only at the next block; `pageBreakSplits` is a measure, not a gate, and only counts lower-case continuations.

Signal: prose block not ending a sentence (allowing a trailing bare or linked marker), then one or more page markers, then a prose block (lower-case: certain; capitalised: probable) or a quote block opening lower-case.

| signal | jack | litv | psi | chal | lev | col | 911 | deep | pm | hills | sav | chil | leh | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| across page break → paragraph, lower-case | 0 | 0 | 0 | 2 | 19 | 2 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 26 |
| across page break → paragraph, capitalised | 37 | 170 | 48 | 83 | 235 | 26 | 62 | 67 | 158 | 7 | 47 | 5 | 14 | 959 |
| across page break → quote, lower-case | 1 | 0 | 42 | 1 | 118 | 3 | 4 | 0 | 156 | 1 | 12 | 10 | 6 | 354 |

Precision: the capitalised variant is 8 of 10 genuine in Jack Smith (`the Justice` / `Department`, `the White` / `House`), and matches reportsthatmatter-nen's finding that these are "just as often" real continuations; in Litvinenko most of its 170 are furniture splices (class K), not splits. The lower-case paragraph variant is near zero because `pageBreakContinuations` and its predecessors already handle it; the quote variant is the open shape nen describes (Leveson 118, Philip Morris 156).

### C. Sentence severed mid-page, paragraph to paragraph

The same split with no page break and no quotation: two-column layouts (Columbia), a caption or table displaced into the flow, a lettered sub-item whose text wraps, a line-end hyphen (`fol-`) left dangling at a paragraph end.

Examples. Columbia Findings F6.3-1 `…on the morn-` (tk8). Columbia body: `…communication of critical safety information and` / `stifled professional differences of opinion…`. Challenger: `…evidence of damage occurring in the seconds which fol-`. Jack Smith `"hostaoes` / `> b ' "` (2dw, OCR-driven).

Found by: agent writing an introduction (tk8), agent sweeping footnotes (2dw). Not caught: nothing looks at paragraph-to-paragraph joins.

| signal | jack | litv | psi | chal | lev | col | 911 | deep | pm | hills | sav | chil | leh | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| prose → prose, lower-case, same page | 5 | 84 | 43 | 54 | 9 | 72 | 4 | 4 | 3 | 0 | 2 | 0 | 9 | 289 |
| prose block ends in a hyphen | 1 | 0 | 1 | 45 | 12 | 29 | 10 | 6 | 1 | 1 | 4 | 0 | 0 | 110 |

Precision: Jack Smith 5 of 5 genuine; Columbia 5 of 5; Litvinenko's 84 are mostly lettered sub-items (`…[^112]` / `b. On 4 November…`) which end without a full stop by design, so count ~half; PSI's 43 include contents dot-leader lines.

### D. Body text set as block quotation wholesale

Not a sentence here and there but whole pages: a geometric misread of the page's left margin. Everything on the page loses its paragraph id.

Examples. Deepwater: 788 of 848 blockquotes on even-numbered pages, 816 even-page paragraphs in total, including most of Chapter 9's recommendations (eyc; fixed with `geometry("per-page")`). 9/11 Notes appendix: 402 quote blocks for prose of that size (60p). Litvinenko pre-`quoteInset(3)`. Duelfer's own byline rendered as a quotation on the front page (1l4).

Found by: agent writing an introduction (eyc), agent reading the rendered notes section (60p). Not caught: nothing compares the quotation share to anything.

Signal: share of blocks that are quotations, overall and split by printed-page parity (odd/even). Deepwater pre-fix would have shown ~93% of quotations on even pages against a flat split in every other report.

| signal | jack | litv | psi | chal | lev | col | 911 | deep | pm | hills | sav | chil | leh |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| quote share of blocks, % | 14.7 | 20.0 | 27.7 | 18.2 | 14.3 | 12.0 | 4.2 | 3.5 | 23.9 | 1.3 | 23.7 | 17.1 | 13.6 |
| even pages, % | 14.4 | 20.4 | 28.6 | 18.3 | 14.8 | 11.7 | 3.8 | 4.4 | 23.4 | 2.1 | 24.4 | 17.8 | 13.8 |
| odd pages, % | 15.3 | 19.8 | 27.2 | 18.2 | 13.8 | 12.2 | 3.3 | 3.0 | 24.3 | 0.1 | 23.1 | 16.7 | 13.3 |

Today's corpus is flat by parity (eyc is fixed). PSI's 27.7% and Philip Morris's 23.9% are high and deserve a read: Philip Morris has 700 quote blocks of more than 40 words with no quotation mark anywhere in them.

### E. Footnote text printed in the body

A note's text lands in the body as a paragraph (with an id, so it is "citable" nonsense), or splices into the middle of a body sentence. Causes: the note runs over the page break and the run-over has no number (g1f); the page's note block was never found because a bogus number derailed the counter (je7); the note fills whole pages (626); the note's number is OCR-garbled so the block looks like prose (48o, 4yp); the report has endnotes, which were read as footnote blocks or left as body (vpx, 60p).

Examples. Jack Smith landing paragraph `most-part-co-conspirators-deceived-trump`: `deliberately / [citations] / withheld from` (g1f). PSI p.174 notes 604–605 as paragraph `2004-ots-examination-handbook-section` (je7); pp.438–439 one note as 17 body paragraphs (626); 3 remaining (74p). Challenger: six `Ibid.` paragraphs with garbled numbers (48o). 9/11: 34,000 words of notes in the body (60p). Columbia today: `Ibid., Paragraph 3.3.1.8.16.` as a paragraph. Litvinenko today: `2 Mascall 9/68-70 3 A fuller description of A1's CV is at 2/101-104 4 A1 2/114…` as a paragraph.

Found by: reader via landing-page links (g1f, Rufus), agent sweeping with a report-specific citation regex (je7, 626, 74p), agent reading the rendered page (48o). Not caught: word counts do not say where words landed. The one thing that worked was 626's measure, a regex over the report's own citation vocabulary (`SCO-|GS MBS-E|Hearing Exhibit|Int. Tr.`) applied to body paragraphs after stripping `[^N]`.

| signal | jack | litv | psi | chal | lev | col | 911 | deep | pm | hills | sav | chil | leh | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| paragraph opens `N Capital…` (note-number shape) | 3 | 11 | 5 | 45 | 8 | 7 | 0 | 22 | 1 | 0 | 16 | 0 | 3 | 121 |
| paragraph opens `Ibid.`/`Id.`/`See`/`Testimony of`/`Interview with` | 2 | 0 | 1 | 6 | 0 | 21 | 0 | 6 | 44 | 0 | 0 | 0 | 0 | 80 |
| short paragraph containing `ibid`/`supra` | 0 | 0 | 0 | 44 | 4 | 17 | 0 | 12 | 14 | 0 | 0 | 0 | 0 | 91 |

Precision: the note-number shape is genuine in Jack Smith (3/3), Deepwater (4/4: endnote text as paragraphs), Lehman (3/3), Litvinenko (4/4); false in Saville (glossary: `1 PARA 1st Battalion…`) and PSI (chart labels). Philip Morris's 44 `Id.` paragraphs are record citations the opinion prints as body lines, a different but related nuisance (9ek).

### F. Footnote markers never linked (bare digits)

The marker stays as digits glued to the preceding word: `impartial.15 I underline that`, `by it.3 Given this` (Litvinenko, live), `$38.6 B71 16.172` (Lehman, marker fused to a figure). The reader sees stray numbers; the sidenote never appears; `every footnote reference has a note` is green because it only pairs `[^N]` with `[^N]:`.

Examples. Lehman: 122 of 817 markers (0bf, open). 9/11: 370 of 1,749 flush-glued across chapter boundaries (w1n, open). GitHub #103 (2026-08) was the first report of the class.

Found by: agent reading the rendered output during report preparation (0bf), agent measuring after 60p (w1n). Not caught: the only marker check pairs references with definitions.

Signal: in prose and quote blocks after stripping `[^N]`, a letter or closing quote/bracket, then sentence punctuation, then 1–3 digits, then a space and a capital or the block end. Sampled 60 hits across Leveson, Columbia, Hillsborough, Challenger, Chilcot: 60 genuine. The one systematic false positive, numbered paragraph references like `para 2.3`, has a digit before the full stop and is excluded.

| signal | jack | litv | psi | chal | lev | col | 911 | deep | pm | hills | sav | chil | leh | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bare marker after punctuation | 0 | 92 | 16 | 113 | 6,394 | 179 | 43 | 1,020 | 52 | 450 | 10 | 185 | 478 | 9,032 |
| as % of all markers (bare + linked defs) | 0 | 9.7 | 0.6 | 57.9 | 42.7 | 86.9 | 2.4 | 56.2 | 48.1 | 98.7 | 0.7 | 39.5 | 40.9 | |

This is the largest class by count and was entirely unmeasured. Leveson has 6,394 unlinked markers against 8,594 linked notes. Hillsborough's notes are never parsed at all (6 definitions; its citation style is a numbered list, gpy/r19), so every one of its 450 markers is bare. Columbia (27 definitions, 179 bare) and Deepwater (endnotes, 56% bare) are the same shape as 9/11 before 60p.

Fix (b94, 2026-10-03): `layoutMarkers()` in `@rtm/ingest` (ingest#46), declared per report. The PDF says which numbers are markers: they are raised (`LayoutLine.raised`). Each raised run is found in its page's blocks by the words printed before it and linked when its note was collected on the page and it is in sequence; the text linkers then stay out. Leveson 7,497 → 142 unlinked by the oracle, PSI 598 → 26, Chilcot 283 → 0, Lehman 221 → 22; 100 sampled links read against the PDF, none wrong. Deepwater, Columbia and Hillsborough wait for their notes to be parsed (kgz8). Caught by: the oracle's `markers-unlinked` (100% precise on the golden pages) and the golden pages' `markers` assertions; `bare-footnote-marker` fails on the pre-fix output (Leveson 6,456 → 101).

Marker after a closing quotation (4ef1, 2026-10-03): with `layoutMarkers()` declared at ingest v0.20.0 (Litvinenko), 41 markers set after the closing mark of an italic quotation were left as bare numbers (`assassinating Berezovsky" 33 and`): the PDF's italic fragment box includes its trailing space and overlaps the marker's by a pixel or three, so `parseLayoutXml` made the marker a line of its own instead of a raised run, and the text linkers had been switched off. Neither `bare-footnote-marker` (it needs sentence punctuation glued to the digits) nor the oracle's `markers-unlinked` (it counts raised runs, and this was not one) could see it, and the oracle's Litvinenko budget was raised to 29 on the strength of the other 29, which are real and different (page-foot notes left in the body at chapter openings, e.g. p.111, lj4). Signal: `bare-marker-after-quote`, a bare 1 to 3 digit number directly after a closing quotation mark (a non-space before the mark) whose label is a note definition that no marker cites, one number per uncited definition (Litvinenko 41, Deepwater 193, Philip Morris 5, Leveson 4, Columbia 6, Challenger 2, Jack Smith 1; read: Litvinenko's 41 match the bead's count and the pages read (18, 22) are markers; `29 Fed. Reg.` and `18 U.S.C.` in Philip Morris are not; Deepwater, Columbia and Challenger were not read). Fix: ingest `layout.ts`, a marker-shaped fragment smaller than its line may overlap the fragment before it by a quarter of the line's height; Litvinenko 41 to 0, Leveson 4 to 2, no other layoutMarkers report moves, no paragraph id moves. Golden page: Litvinenko p.22 (markers 33 to 38). Caught by: `bare-marker-after-quote` and that golden page.

### G. Spurious footnote markers and links

The inverse: a number that is not a marker gets linked, or a marker is linked to the wrong note, or linking fuses two blocks. Dates (`11,[^13] and 19 March`, axw), counts and OCR noise (`75 out of 75`, g1f; 7vz), a contents entry's page number (`military action in Iraq .[^47] The UK's relationship` sits in Chilcot's contents list today, ixe), `linkInlineMarkers` spanning a blank line so the next paragraph becomes part of the heading (72f, yun: Philip Morris's `DEFENDANTS HAVE VIOLATED 18 U.S.C. §1962(d)[^18] U.S.C. § 1962(d) provides…` heading is live), markdown-it linkifying `Crit.lR` as a URL (yhb, ~266 instances).

Found by: agent reading Leveson output (axw), remark spike (yhb), agent fixing 72f (yun), the alignment scorer (apk). Signals: marker inside a heading or list item (1 today); a definition number defined more than once (PSI had three `[^75]`); a linked number whose note is far from the page sequence; a `<a href>` whose host is not a lowercase TLD (fixed in markdown.ts).

**Repeated labels resolved by count (apk).** A numbering that restarts per chapter defines `[^20]` once per chapter, and the renderer gave the k-th reference to a label the k-th definition. One stray marker (9/11's drop-cap garble `Tue sday, Se ptembe r 11,[^20] 01` took chapter 1's note 20) moved every later `[^20]` onto the previous chapter's note: 148 of 1,718 reference markers in 9/11 (p.4 `Haznawi in 6B.[^20]` opened Rohan Gunaratna instead of `UAL record, Flight 93`), and the same shape in Litvinenko (94), Leveson (196), Deepwater Horizon (112), Columbia (7) and Lehman (1). Signals: `note-marker-wrong-note` (the rendered sidenote is not the definition the reference aligns to; 134 on 9/11 before the fix, 0 after) and `note-marker-unpaired` (a repeated-label reference no definition pairs with, the stray marker itself; 12 left in 9/11, counts read as notes: `Massachusetts,[^153] miles away`).

**Notes out of sequence (6hbt).** Where a label is defined once, `note-marker-unpaired` cannot see a spurious marker: Jack Smith's notes run 1..265 and the linker linked a reporter's volume (`Hammerschmidt,[^265] U.S. at 188`, `437 U.S.[^1] (1978)`) and the docket numbers of an appendix table. The linked references, read alone, should run 1..n in reading order, each once (per chapter where the numbering restarts). Signal: `note-reference-sequence` (a gap, a repeat, or a first appearance outside the longest increasing run, per run of notes; 92 on Jack Smith, 70 of them repeats). It also finds the displaced sidebar (9/11 p.177: note 26 reads before the box whose notes are 22-25; gq4j), unlinked stretches (PSI notes 1402-1419, kvxj; Litvinenko's first notes of five chapters, n7fb; Hillsborough, kgpr; Lehman, qsfc), and scan digits split from a note number (Challenger `Ibid.[^2] 9`, m827). On the layout-read endnotes of #56 it reads Deepwater 756 → 1 and Columbia 20 → 7. Beads 4kfr, u00i.

**A note rendered from another page (y0w9).** The renderer pairs each `[^N]` with a `[^N]:` definition by an alignment over labels (`resolveNoteReferences`) wherever a label is defined more than once. With few of a chapter's markers linked the alignment has many equal-length solutions and takes the early definitions, so a sidenote shows another page's note: Litvinenko 20 of 756, Philip Morris 17 of 19, Leveson 121, PSI 18, Challenger 140, Jack Smith 71 (mostly a paragraph the pipeline over-merges across pages), Saville 10, Chilcot 3, Lehman 3, at ingest v0.19.0. `note-marker-wrong-note` cannot see it: its truth is the same alignment. Signal: the oracle's `note-off-page` (`pnpm ingest verify`, budgeted per report in `reports/oracle-budget.yaml`): every reference is paired with its definition exactly as the renderer does and counted when the definition's `pdfIndex` is more than one page from the block that holds the marker; not counted for reports whose notes are at the back (`notes-at-back`). Fix: `layoutMarkers()` makes the references dense (Litvinenko 756 to 802, Philip Morris 19 to 21: 0 off-page in both), declared by the report. Pre-fix fixture: `tests/note-off-page.test.ts` in `@rtm/ingest` (one linked marker in a restarting numbering opens the first chapter's note). Closes y0w9.

### H. Headings made from body, caption or exhibit text

Figure captions, map labels, sidebar titles, quoted memo lines, ad copy, table cells, flowchart boxes and name lists become `##` sections, so the contents page lists `WALK-UP MUSIC FOR DAVID SCHNEIDER` (PSI, h0l), `SHELLFISH CORALS`, `MS AL LA GA` (Deepwater, a0z), `MISSED OPPORTUNITY` ×6 and 107 non-structural sections (Columbia, tk8), ~200 of 244 headings (Challenger, c1y), `WHEN IT COMES TO THE LOWEST IN TAR, ONLY ONE` (Philip Morris, 72f), `BOSTON`, `POTUS` (9/11, 5u2 open), `Hobson Bryan Jill Jonnes` (Deepwater, 0ij open), `## OF ACTION: CHECK TRANSCRIPTS…` (Hillsborough, r19). Body text is then filed under the wrong section.

Found by: agent writing an introduction (h0l, a0z, tk8, 72f) or reading the heading list (c1y). Not caught: `document has headings` is a count > 0.

Signals and today's counts: headings per 100 pages (Columbia 90, Challenger 58 vs Leveson 3.8, Hillsborough 5.8, median ~28); headings longer than 14 words (106: Philip Morris 61 are legitimate long titles, Challenger 17 are OCR caption garble such as `SCOTT CROSSFIELD NEUONL. MILDER…`); the same heading 3+ times (26: `philip morris` ×24, `missed opportunity` ×6, `imagery request` ×3); short all-caps paragraphs (258: Columbia 73 `STS-107.`, Challenger 75) which are the same captions when they are not promoted. The decisive signal is the next class's: compare headings with the report's own contents page.

### I. Headings missing, fused into body text, truncated or deleted as furniture

The inverse of H, and the heavier defect: chapter and section titles never become headings, so sections run together or the whole report is one flat page. Causes: plain title-case headings with no textual signal (Chilcot: 75 of 88 contents entries, ixe); headings expressed only by colour and size (Hillsborough, r19); chapter titles deleted because they recur as running heads (Hillsborough's 12 chapter and 3 part openings, r19; Columbia's `CHAPTER 1…11`, tk8); chapter openers with no blank line folded into the first paragraph (Deepwater, a0z); OCR-mangled `Recommendation`/`Finding` labels reflowed onto the previous paragraph (Challenger, 9zk); body-less chapter banners folded backwards into the previous chapter (9/11, u88, w8g); headings attached to the wrong body text (Leveson Chapter 7 ×4, djy open); truncated (`The period up to July` missing `1971`, b5x; `…to Improve Spill`, a0z; `Defendants Undertook Joint Efforts to Undermine and Discredit the` / rest in a blockquote, 72f).

Found by: agent reading full.md against the source contents page (ixe, r19), writing an introduction (a0z, tk8, u88, djy), reading the bead's own examples (9zk). Not caught: no check compares the headings to the contents the report prints, and none checks the count is plausible for the page count.

Signals: contents entries recovered as list items (`- Title — 23`) with no matching heading; a paragraph that opens with a title-case run then `N. Capital` (a heading fused into the first numbered paragraph); a heading ending in a function word; a short label (`Findings`, `Recommendations`, `Issue`) recurring as a paragraph.

| signal | jack | litv | psi | chal | lev | col | 911 | deep | pm | hills | sav | chil | leh | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| contents entries recovered as list items | 41 | 142 | 9 | 64 | 1,505 | 147 | 0 | 39 | 472 | 44 | 220 | 88 | 113 | 2,884 |
| …with no matching heading | 9 | 86 | 9 | 52 | 1,341 | 65 | 0 | 27 | 55 | 6 | 199 | 18 | 41 | 1,908 |
| paragraph opens title-case run then `N.` | 0 | 2 | 2 | 0 | 19 | 0 | 0 | 0 | 0 | 4 | 0 | 1 | 0 | 28 |
| heading ends in a function word | 0 | 0 | 1 | 5 | 1 | 3 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 12 |
| short label paragraph recurring 4+ times (distinct strings) | 0 | 6 | 1 | 14 | 27 | 7 | 0 | 2 | 2 | 0 | 1 | 0 | 0 | 60 |

Leveson: 1,505 contents entries, 74 headings; its four volumes are nearly flat (89% of listed sections have no heading). Saville 199 of 220; Litvinenko 86 of 142; Challenger 52 of 64; Lehman 41 of 113. The matching here is crude (normalised exact or suffix match), so treat the ratio, not the count, as the finding. Fused headings live today: Leveson `Draft Criteria for a Regulatory Solution 1. Effectiveness`, Hillsborough `Protocol on Disclosure of Information 1. This protocol…` (and, in the PDF-filled stretches of the hybrid, 77 more such as `Recognition of the disaster 2.4.20 The first…`; a8l: closed by `typographicHeadings`, caught by golden pages pp.134 and 378, which fail on the fused output; a count of paragraphs that open on a title-case run then `N.N.N` was 58 before and 0 after, and 0 in every other report, but no `pnpm quality` signal reads it yet), Chilcot `Security Sector Reform 884. An SSR strategy…`. Challenger: `findings` ×55, `finding` ×41, `recommendations` ×40, `issue` ×33 as plain paragraphs (9zk's shape, still live); Columbia `findings:` ×18, `recommendations:` ×16. Truncated live: `WALL STREET AND` (PSI), `Chapter 2: The 'moment' of` (Hillsborough), `Publication of Parliamentary Reports in` (Leveson).

### J. Paragraphs with no id (uncitable text)

Text the reader can see but cannot link, highlight or card. Causes: a margin-set `N.` opener read as an ordered list (Chilcot 892 of ~950, 4qw; Philip Morris 4,088 findings, 9ek); non-ASCII characters in the id dropped by the readers' regex (185 ids across five reports, 4k6); block quotations have no ids at all (dam); an empty list item borrowing a later paragraph's id (ru3).

Found by: agent writing an introduction (4qw, 9ek, 4k6, dam). Not caught until the density check (4qw) existed; it would not have caught Philip Morris (12.4/1k today, 5.9 before) at the chosen floor either.

Signals: ids per 1k words (exists); share of body words inside `<ol>`/`<li>` without an id; share inside `<blockquote>`; ids containing non-ASCII letters (so the readers are exercised).

| signal | jack | litv | psi | chal | lev | col | 911 | deep | pm | hills | sav | chil | leh |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `<ol>` blocks in rendered body | 16 | 36 | 77 | 212 | 292 | 26 | 11 | 5 | 123 | 303 | 90 | 1 | 12 |
| words inside `<ol>`, % of report | 1.6 | 4.7 | 14.6 | 12.1 | 7.4 | 0.3 | 7.4 | 1.9 | 1.3 | 7.3 | 3.2 | 6.5 | 42.8 |
| ids with non-ASCII letters | 1 | 0 | 0 | 0 | 4 | 171 | 2 | 0 | 0 | 0 | 0 | 1 | 0 |

Lehman's 42.8% is the nine-volume master contents (b7z) still rendered as lists; PSI 14.6%, Challenger 12.1%, Hillsborough 303 `<ol>` blocks (its numbered citations) all deserve a read. Note `<ol>` items do carry ids for top-level `<ul>` lists only (#12), so these words are uncitable.

### K. Running furniture and banners spliced into the text or left as paragraphs

Running heads, chapter tabs and folios survive as their own paragraphs (with ids), or are spliced into the middle of a sentence, or the furniture stripper takes real text with them. Litvinenko, live today: `The Litvinenko Inquiry` ×132 as paragraphs; `Part 3 | Chapters 1 to 5 | Alexander Litvinenko` ×109, including spliced: `Part 3 | Chapters 1 to 5 | Alexander Litvinenko found Mr Berezovsky to be a highly unreliable witness…` (full.md line 394) and `…Mr Litvinenko was investigating the` / `The Litvinenko Inquiry case. The couple got on well…`. Litvinenko does not declare `runningFurniture()`. Duelfer: a rotated chapter-name tab spliced mid-line 142 times in 451 pages, not at a page edge so the edge-only stripper cannot see it (1l4). Leveson: `AN INQUIRY INTO THE CULTURE,` ×8, `THE RIGHT HONOURABLE LORD JUSTICE LEVESON` ×8 as paragraphs. The stripper over-reaching: Philip Morris's ~270 record-citation lines deleted as digit-masked furniture (9ek); Columbia's chapter headings and `11, 2001.` citation tails stripped as footers (tk8); Hillsborough's chapter openings (r19); Lehman's court caption as paragraphs `x`, `re-chapter-11-case-no` (djt open); roman folios `vii vii` left in text (cbr open).

Found by: agent doing the ingest and reading full.md (1l4), agent writing an introduction (djt), agent fixing another bead (9ek, tk8). Not caught: retention is 96.7% either way.

Signals: a short paragraph recurring verbatim 4+ times (60 distinct strings today, above); a recurring short string found inside a longer paragraph (my attempt matched ordinary words like `recommendations`, so the signal needs the furniture string's page position, which only the pipeline has: this is a measure to expose from `runningFurniture()` itself); the printed page sequence running backwards (Challenger 14 times: `94 → 2`, `124 → 6`; Jack Smith `146 → 2`), which is a chapter number or a volume folio misread as the page.

### L. Contents pages rendered as body, headings or lists

The report's own table of contents becomes h2 headings (`## 8. "THE SYSTEM WAS BLINKING RED"`, 9/11, 5fn in progress), run-together quote blocks, merged list items (Columbia), or, in Lehman, 1,900 of 4,000 lines of the whole work's master contents as bullets with a `## VOLUME` heading missing its number and a roman folio `xi` as its own line (b7z). Chilcot's contents list carries a `[^47]` link where a page number was (ixe). Saville's `Outline Table of Contents` splices into body text.

Found by: agent reading output (b7z, 5fn), reader of the contents page. Signals: words inside lists in the first 5% of the report; list items ending in a page number (2,884 today, mostly legitimately parsed contents); a heading ending in a page number or containing dot leaders.

### M. OCR garble and OCR-driven structure failures

Scanned reports (Challenger, Jack Smith, parts of Columbia) carry garble that the gates tolerate (`losslessCheck` allows 0.1%: 1,000 words in a million) and that breaks structure detection downstream: a garbled note number swallows the notes after it (lie), a run of notes `56, 67, "rigid,", 6 9, 6 0, 6 1, 6*, 8s` (aqn), `hostaoes b '` (2dw), `Recommendation` mangled so it is not a heading (9zk), 625 words of letter-spaced garble as one paragraph (`7 included a b l a t i v e m a t e r i a l s`, Challenger), `0rings` ×28, `reso1ied`, `ce1iifies` (Jack Smith). The `fidelity.md` queues hold 999 open suspects nobody reads (#122).

Found by: agent reviewing suspect queues (lie, aqn, agk), reader (2dw via g1f). Signals tried: unknown lower-case words per 1k against the system dictionary gives 43–71 for every report, dominated by proper nouns and British spellings, so it does not separate Challenger (71) from clean born-digital Deepwater (51) usefully; digit-inside-word tokens (77 total, Challenger 28) are a precise but small signal. Real detection needs a second opinion on the page (the plan's differential layer) or a per-report vocabulary.

### N. Markdown and rendering hazards

Small, deterministic, and still shipping: a paragraph opening with a literal `#` renders as `<h1>` (Columbia `# 18-7503-005`, PSI `# # #`; 4 `<h1>` in the corpus today, 6zo open); two sections titled `undefined` (72f); a numbered-paragraph opener `3.77` not starting a paragraph without a blank line (hzf); roman folios doubled in text (cbr); an empty bullet taking a later paragraph's id (ru3); per-chapter footnote numbering colliding (ooj, #121); corrections unable to reach footnote text (3jb). Signals: `<h1>` count in a rendered body (should be 0), section title `undefined` or empty, paragraphs longer than 450 words (23 today: Leveson 8, Hillsborough 8, Deepwater 4, mostly endnote runs and fused numbered paragraphs).

## 4. Tallies

By class, across the ~50 beads and issues examined (a bead can hold two classes):

| class | beads/issues | live count today (best signal) |
|---|---:|---|
| A severed into quotation, mid-page | 7 | 843 prose→quote joins; Litvinenko 244 (10.9%) |
| B severed at page break | 6 | 26 certain + 354 into quotes + ~700 probable capitalised |
| C severed mid-page, para→para | 4 | 289 candidates, 110 dangling hyphens |
| D body as quotation wholesale | 4 | 0 by parity; PSI/Philip Morris quote share 24–28% unread |
| E footnote text in body | 10 | 121 note-number paragraphs, 80 citation openers |
| F unlinked markers | 3 | 9,032 (Leveson 6,394; Hillsborough 98.7%) |
| G spurious markers/links | 5 | 1 heading with a marker; others unmeasured |
| H headings from captions/body | 9 | Columbia 90/100pp, Challenger 58/100pp; 26 repeated headings |
| I headings missing/fused/truncated/deleted | 11 | 1,908 contents entries without a heading; 28 fused; 169 Challenger labels |
| J uncitable paragraphs | 5 | Lehman 42.8% of words in `<ol>`; 7 reports > 5% |
| K furniture spliced or left | 8 | Litvinenko 241 furniture paragraphs; 18 page-sequence reversals |
| L contents pages as body | 4 | Lehman master contents; 9/11 contents headings |
| M OCR garble | 8 | 999 unread suspects; 77 digit-in-word tokens |
| N markdown hazards | 7 | 4 `<h1>`, 23 paragraphs > 450 words |

By how the defect was found (same ~50): reader or Rufus on the live site 6 (ca3/kb4, g1f, 7z2, 2dw, jack-smith-report#1, GH#12/#13); agent writing an introduction or reading guide 15 (4qw, 9ek, eyc, tk8, 72f, h0l, a0z, u88, w8g, 4k6, djy, djt, dam, 5u2, rcz.1); agent doing the stage-1 ingest or re-ingest and reading full.md or the rendered page 17 (ixe, 0bf, 1xr, 1l4, c1y, 48o, m2y, 626, je7, r19, 60p, vpx, b7z, 5fn, osv, xay, jvy); agent sweeping with a purpose-built regex 5 (je7, 626, 74p, w1n, axw); an existing automated check 0. The density check (4qw) was written after the fact and is the only check in the corpus that fails on a defect in this catalogue.

## 5. What the numbers say

1. The classes readers complain about (A, B, E) are a few hundred instances each and concentrated: Litvinenko, Leveson and Philip Morris hold 70% of the severed sentences. Three report-level pass declarations would remove most of them; the harness's job is to make that visible without a reader.
2. The largest class by count, unlinked markers (F), had never been measured and is 9,000 instances. It is also the easiest to detect precisely.
3. Structure (H, I, J, K) is where the corpus is weakest and where the signals are weakest: Leveson is 983k words with 74 headings, and the only reliable oracle is the report's own contents page, which the pipeline already parses for some reports.
4. Nothing in the catalogue was found by a check, and almost everything was found by someone reading a rendered page with a purpose. That is what the plan has to automate: cheap purpose-built reads, at scale, with counts and budgets, run on every change.
