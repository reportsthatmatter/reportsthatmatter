# Progress log

One entry per work session. Newest first.

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
