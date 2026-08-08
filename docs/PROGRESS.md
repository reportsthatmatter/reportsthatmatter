# Progress log

One entry per work session. Newest first.

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
