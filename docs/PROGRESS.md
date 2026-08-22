# Progress log

One entry per work session. Newest first.

## 2026-08-22 — Reviewing the PSI/Challenger re-ingest under #79 (issue #108)

#79 (2026-08-08) fixed a real contents-page bug for Litvinenko but deliberately
did not re-apply itself to `us-psi-financial-crisis` or `challenger-accident` —
each produced 100+ lines of unreviewed diff, "including at least one lateral
change," and there wasn't time to read it by hand. This session did that read,
for both.

**Method:** baseline = current published `full.md`. Re-ingest with today's
pipeline and the exact metadata already in `reports/registry.yaml` (wrong
metadata adds noise to the diff that has nothing to do with the pipeline).
Diff, read every hunk, `git checkout` the report directory afterward so
nothing unreviewed lands in the tree — no report was republished this
session. Where a hunk read as ambiguous, found its `%%page N%%` marker,
worked out the PDF-file-page offset (front matter before printed page 1),
and read `pdftotext -f N -l N -layout` against the actual source page —
the diff alone cannot tell you which of two readings matches the document,
only the source can.

**`us-psi-financial-crisis` (born-digital, clean): safe.** 323 lines / 43
hunks, three classes:
- TOC front matter now reads as separated lines instead of one run-together
  blob, and a two-column data table ("2005 WaMu Gain on Sale Margin," p. 64)
  now renders as one bullet per row instead of all values run together on one
  line — checked against the source page, confirmed improvement, not #12's
  list fix (that's bulleted *prose*; this is a table).
- The already-reviewed #12 list-block change (bulleted quotes → `- ` items) —
  the bulk of the diff, matches the ~133-line estimate, not re-litigated.
- One real, narrow defect, unrelated to #79 specifically: a footnote
  marker that sits on its own short line in the PDF (an artifact of
  `pdftotext -layout` wrapping a superscript) gets attached to whichever
  paragraph happens to be adjacent after the paragraph-boundary logic runs,
  landing on the trailing edge of one paragraph in the old output and the
  leading edge of the next in the new one — verified against source (p. 89):
  neither position is right, both strand the digit as a bare unlinked number
  rather than an inline `[^288]` reference. Pre-existing, just moved. Recorded
  as a real but low-urgency finding, not a #79 regression.

**`challenger-accident` (scanned, OCR'd): not safe — do not apply #79's fix
as currently written.** 2,442 lines / 480 hunks, and isolating which of the
two accumulated changes (#12, #79) caused it —
`git checkout <commit> -- scripts/ingest/`, re-run, diff against the previous
step, restore — showed **all 480 hunks come from #79 alone**; #12 changed
nothing here (Challenger's source has no bulleted prose for it to touch).
Two effects, confirmed against source:
- The document's own footnote count dropped in the reported metric
  (94 → 89), which read as alarming until checked: the actual linked
  footnote *definitions* in the output are identical, 75 in both. The
  metric counts something upstream of what ships — not itself evidence of
  lost content, and a reminder not to trust a summary number over what's
  actually in the file.
- Words that were correctly spaced in the currently-published output come
  back glued in the new one — "DEAR MR. SPEAKER:" → "DEARMR. SPEAKER:",
  confirmed against `pdftotext -layout` on the raw source page 3: the raw
  extraction *is* "DEARMR. SPEAKER:", so the published version's correct
  spacing was already the product of some fix upstream of #79's change, and
  that fix has stopped firing on some class of line since. This pattern
  repeats through most of the 480 hunks — front matter, headings, running
  prose. A genuine regression, not lateral: the old reading is the one that
  matches the source.

**Why the same fix behaves so differently on the two reports — see the
gotcha added to AGENTS.md.** Short version: `TOC_ENTRY`'s new whitespace-gap
branch was written and tested against Litvinenko, a very clean born-digital
PDF; Challenger is scanned and OCR'd, with irregular spacing throughout, and
apparently reclassifies far more lines as "structural" (contents-entry- or
heading-like) than intended — which changes which paragraph-boundary and
degluing logic each line goes through. PSI, also born-digital, wasn't
affected the same way. The lesson isn't "the fix is wrong" — it visibly
improved PSI — it's that a heuristic proven on the cleanest source in the
corpus needs checking against the messiest one before it's assumed general.

**Recommendation:** #79's `TOC_ENTRY` change is fine to keep as-is for
born-digital sources. Re-ingesting PSI under it looks safe once someone
signs off on the classification above (still not done here — republishing
is a separate decision). Challenger needs the whitespace-gap branch's
interaction with OCR'd spacing understood and fixed before a re-ingest is
safe; until then its `full.md` should stay on the pre-#79 pipeline output,
same as today.

## 2026-08-09 — Sidenote length clamp (issue #80)

Researched before building, per Rufus's request — full writeup at
`docs/plans/2026-08-09-sidenote-design-research.md`, written to double as a
blog post. Short version: measured real note-length distribution across all
four reports first (median is 47-169 characters everywhere; Jack Smith's
citation-block footnotes are the outlier, 20.8% over 400 characters, max
3,658). Surveyed prior art — Tufte CSS (what RTM already runs, explicitly
has "no automatic overflow handling"), Gwern.net's `sidenotes.js` (a full
runtime collision-resolution layout engine — solves a much bigger problem
than RTM has, at a cost the author himself calls "user-visible &
distracting"), and the newer native-`popover`-plus-anchor-positioning
pattern (elegant, but changes the interaction model for every note to fix a
problem that's specific to a minority of outliers).

Landed on the narrowest fix that solves the actual problem: classify a note
`long` at render time (`>400` characters, decided once in the pipeline, not
measured at runtime) and clamp it to ~8 lines with a fade + "Show full note"
toggle, reusing the exact checkbox the site already ships for mobile
collapse — same mechanism, new trigger condition, zero new JS. First attempt
used `mask-image` on the whole note, which faded the toggle label along with
the text and made both illegible where they overlapped; fixed by moving to
a solid gradient overlay (`::after`) instead, which only needed one more
screenshot to catch.

Verified against the real reports, not just synthetic tests: Jack Smith
(the worst case) clamps cleanly with a legible fade and working expand;
PSI's dense table-of-contents area (many long notes clustered together)
holds up too; mobile correctly never shows the new toggle (it already
collapses notes entirely, so there's nothing to clamp). New unit tests for
the classification threshold and the expand affordance, new e2e check that
a long note is clamped by default and grows on click.

→ **PR #82**, branch `sidenote-length-clamp`.

## 2026-08-08 (2) — The Litvinenko Inquiry, a real fidelity bug, and a fix I built then reverted

Continued from the session below. With the OCR-fix candidates exhausted,
went back to branch B and tried a fresh backlog candidate not yet attempted:
**The Litvinenko Inquiry (issue #66)**. Source: `gov.uk`, born-digital PDF
(not a scan) — 330 pages, 0.004% capitalisation-damage ratio, zero OCR
auto-fixes needed, 844 footnotes, 99.4% content retained. By a wide margin
the cleanest source of the four reports on the site. New repo:
[`uk-litvinenko-inquiry`](https://github.com/reportsthatmatter/uk-litvinenko-inquiry).

**Bug found by reading the rendered output**, not by a failing check — every
fidelity gate was green. The contents pages right-align page numbers with a
wide whitespace gap instead of dot leaders (a different convention from the
other three reports). `scripts/ingest/paragraphs.ts` only recognised dot
leaders, so a title ending in "?" — "Why would anyone wish to kill Alexander
Litvinenko?" — had its page number read by the citation linker as a footnote
marker, since the number coincidentally matched a real footnote elsewhere in
an 844-footnote document. Result: the sentence was severed and a fake
citation link appeared on the contents page. The same collision hit a
15-page witness-list appendix even harder (multiple broken links per page).

**Fix:** extended `TOC_ENTRY` to also match a wide whitespace gap, gated on
the character before the gap *not* being sentence-continuation punctuation
(".", ",", ";", ":") — because a footnote marker that wraps onto its own
short line after a page break ("previously reported results.   197") has
the exact same shape, and initially got misfired on by the same broadened
pattern. Caught that with a regression sweep across all three published
reports before shipping: `jack-smith-vol1` came back byte-identical (good),
but `us-psi-financial-crisis` and `challenger-accident` had ~100–350 lines
of *unreviewed* changes each — some clear improvements, but at least one
lateral change (a stray page-number artifact moved from the end of one
paragraph to garble the start of the next, rather than actually being
fixed). Didn't have time to review ~450 lines of diff by hand, so **did not
re-apply the fix to those two reports** — the pipeline change is live, but
their `full.md` files are untouched pending a proper review pass. Verified
empirically that the new pattern only ever matches the actual contents/table
pages in Litvinenko (4 pages) plus the witness table (3 pages) — zero false
positives across the other ~320 pages of that document.

**A related fix I built, tested, and then reverted.** The Litvinenko PDF
also sets many footnote superscripts with *no space at all* before the
digit ("the surgery.88"), which the existing inline citation linker
requires (`\s+` between punctuation and digit) and so leaves as raw
unlinked numbers — roughly 230 of 844 footnote references. Built a second
pass in `scripts/ingest/footnotes.ts` to catch the no-space case too,
gated on the punctuation being preceded by a letter rather than a digit
(so paragraph numbering like "3.104" wouldn't be mistaken for it). Wrote
tests, verified it fixed ~230 of the 236 cases. Then ran the same
three-report regression sweep — and it silently corrupted a real citation
in the **already-published** `jack-smith-vol1` report: "Section V.D.2"
(a legal subsection reference) became "Section V.D." plus a fake link to
an unrelated footnote, because "D.2" has the identical shape to a glued
footnote marker and legal section-numbering isn't on the existing
citation-abbreviation guard list. **Reverted the whole change.** A letter
followed by a period followed by digits genuinely can mean two different
things, which fails the project's own bar in AGENTS.md: "auto-fix only
what has no other reading." Litvinenko ships with the ~230 unlinked
footnote markers as a known, visible (not silently corrupting) limitation —
worse than the other three reports on this one dimension, but the same
failure mode (a bare trailing number where a footnote should be) already
exists here and there in the published reports too, so this isn't a new
class of defect, just a higher rate of an existing one.

→ **PR #79**, branch `litvinenko-report-toc-fix`. `us-psi-financial-crisis`
and `challenger-accident` regeneration is explicitly left undone.

### For later review

- **`us-psi-financial-crisis` and `challenger-accident` full.md are stale**
  relative to the current pipeline (the TOC whitespace-gap fix isn't
  reflected in them). Re-running `pnpm ingest run` on either will pull in
  the fix, but the resulting diff needs a careful line-by-line read before
  committing — don't just trust the fidelity gate, it doesn't catch this
  class of bug (see above).
- **The no-space footnote-marker gap in Litvinenko is real and unfixed.**
  ~230 of 844 footnotes render as a bare trailing number instead of a
  linked sidenote. A safe fix needs to distinguish a citation marker from a
  document's own section-numbering scheme (here: legal "V.D.2", UK-inquiry
  "3.104" paragraph numbers), which varies per report and isn't reliably
  inferable from local text shape alone — may need to key off something
  structural (e.g. only glue-link within running prose, never at a
  paragraph's own opening number) rather than a punctuation/case heuristic.
- Two-column layout support (Columbia) and the digit-dropping extraction bug
  (FCIC) from the previous session are both still open — see below.

## 2026-08-08 — OCR fixes, and two report candidates ruled out for now

Picked up via issue #77. Baseline confirmed green (`./scripts/init.sh`).

Went looking for the next report to ingest (branch B, "the best next code
work" per the issue). Two candidates from the backlog turned out not to be
viable right now:

- **Columbia Accident report (issue #37).** Repo `us-columbia-shuttle-accident`
  already holds the source PDF (`CAIB_lowres_full.pdf`, Vol. I, 249 pages,
  OCR-clean — 0.06% capitalisation-damage ratio, well under the 1% proxy).
  But the body prose is set in **two columns**, and `pdftotext -layout`
  interleaves them line-by-line (confirmed by sampling pages 30, 100, 150,
  200 — unrelated sentences from the left and right column land on the same
  output line). `scripts/ingest/extract.ts` has no column-aware extraction.
  Ingesting as-is would silently scramble reading order in a way the current
  fidelity checks (lossless-subset, word-count deltas) likely would not
  catch, since the same words are still present, just reordered. **Needs
  column detection/splitting in the pipeline before this is safe to ingest.**
  Not attempted — out of scope for one sitting, and risky to build unattended
  without a way to visually verify the result.

- **FCIC Final Report (issue #57).** Single clean PDF from `gpo.gov`
  (`GPO-FCIC.pdf`, 664 pages, single-column, low OCR-damage ratio ~0.1%).
  But **every digit in the document is silently dropped** by `pdftotext`, in
  both `-layout` and `-raw` mode — e.g. "the spring of , the FOMC" (year
  missing), "a  billion position" (amount missing). This is systemic across
  the whole document, not a scan-quality issue — looks like a broken
  ToUnicode CMap for the numeral glyphs in whatever typesetting tool produced
  this PDF. For a financial-crisis report, dropping every dollar figure, date
  and percentage silently is disqualifying. Would need a different extraction
  path (maybe OCR the rendered page images instead of trusting the text
  layer) — not attempted.

- **Valukas Report (issue #24, Lehman Brothers).** Source is
  `jenner.com/lehman`, which sits behind a Cloudflare bot challenge — not
  fetchable without a real browser. Nine separate PDF volumes besides.
  Not attempted.

- **Duelfer Report (issue #34).** GPO landing page is a JS-rendered
  govinfo.gov shell now (fdsys was retired) — no static PDF link found by a
  plain fetch. Not attempted; would need a browser to navigate govinfo.gov's
  search/download flow.

Pivoted to branch C (ingestion quality) instead, since it's self-contained
and doesn't need a new external source. Surveyed the three published
reports' `fidelity.md` review queues — they're mostly false positives (legal
citations like "2d Cir." or exhibit numbers like "4/13-2a" flagged as "digit
inside a word") — but found one genuine artifact, `fonn` → `form`, that no
existing pattern caught at all. Promoted it plus four already-flagged
artifacts (`ofthe`, `inthe`, `bo th`, `conceming`) from suspect-only to
auto-fixed, since none of them have a legitimate reading other than the
corrected word (unlike `modem` or `arid`, kept suspect-only deliberately —
real words). Re-ran the pipeline against source PDFs for all three reports
(never hand-edited `full.md`); only jack-smith-vol1 (+4 fixes) and
challenger-accident (+3) had matches. `pnpm cards` re-run, no paragraph-id
drift. Full `verify.sh` green.

→ **PR #78**, branch `ocr-fixes-ofthe-fonn`, open for review.

### For later review (not urgent, just logged)

- Two-column layout support in `scripts/ingest/extract.ts` would unblock
  Columbia and possibly other candidates — worth doing before working further
  down the backlog if more two-column sources turn up.
- The digit-dropping failure mode (FCIC) is new — worth a quick structural
  check added to the pre-ingest triage (`pdftotext` a sample page, grep for
  suspiciously absent digit density) so it's caught before a human notices
  missing dollar figures downstream.
- Several backlog candidates (Valukas, Duelfer, and probably others) need a
  real browser to find the source PDF, not a plain `curl`. Playwright is
  already available in this repo's toolchain (used for `verify.sh`'s e2e
  checks) — could be reused for backlog sourcing too.
