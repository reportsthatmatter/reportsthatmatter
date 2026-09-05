# Progress log

One entry per work session. Newest first.

## 2026-09-04/05 — Content publishing: the site stops carrying report data

The arc: `docs/plans/2026-09-04-content-publishing.md`, written after Rufus
asked why deploying the app also deployed every report's text. Landed across
five PRs on the site (#131, #133, #134, #135, #136) plus three on
`@rtm/ingest` (#4, #6, #8), each verified against production before moving
on, not just against local tests.

**Fragments, not whole pages** (#131). `pnpm prerender` used to bake the
site's layout into every artifact, so a CSS change dirtied 601 files. It now
writes layout-free content (`fragments/<slug>.html`, `full-body.html`); the
Worker assembles the page. Verified byte-identical to the old output before
calling it done — 578 pages, zero diffs.

**Publish to R2 without a deploy** (#133, #134). A `report_versions` row in
D1 pins a content hash; a report with no row falls back to the deploy's own
copy, which is what made this safe to ship before anything used it.
`pnpm publish-report <id>` writes objects then flips the pointer — one
`UPDATE`, so a publish is atomic and rollback is the same statement with an
old hash. The commit endpoint re-derives the hash from the manifest and reads
every object back before it writes the pointer, so it cannot point at a
version that would 404. All ten reports published same day; verified via
`x-rtm-content-version` on each.

**Rendering moved into `@rtm/ingest`** (#136, v0.12.1). `paragraphId()` —
what a citation actually resolves through — used to live in the site, one
stage downstream of anything a report's own `baseline.json` covered. An
id-affecting edit there could have repointed every citation in the archive
with nothing to catch it. `pnpm corpus check` (#130, earlier the same day)
closed that gap first, fingerprinting every report's citable ids; only after
it existed did rendering actually move.

**Two follow-on defects, found and fixed rather than shipped around:**

- `@rtm/ingest` v0.12.0's `dist` emitted relative imports with no `.js`
  extension — fine under `tsc`/`tsx`, invalid under Node's own resolver,
  which is what a real consumer gets. Caught because the site's test suite
  failed to *load*, not to pass. Fixed in v0.12.1
  (`scripts/fix-extensions.mjs`), verified against plain `node`.
- `detectGutter`/`splitColumns` (ingest#2, four tests red since introduction,
  never actually green): no tolerance for a gutter's position drifting a
  character (a two-digit line number is enough), and the right column had no
  per-line adjustment the left column already had, which could truncate its
  leading letter on a short line. Fixed in v0.12.2. Checked against the real
  corpus before shipping, not just the fix's own fixtures: zero live reports
  affected, confirmed by grepping the exact truncated-word pattern before and
  after. No changelog entry for this one — real defect, zero visible effect.

**Report repos can now publish themselves** (ingest#6, v0.12.3). The pure
hashing/token logic (`contentHash`, `manifestFor`, `tokenFor`, `authorises`,
…) moved into the library — it never had a site-specific dependency — and a
new `rtm-publish` CLI runs it against a report's own `full.md`. Verified for
real, not left half-wired: `challenger-accident` bumped its own pin,
published itself, and produced the **exact same content hash** the site's
own build had already produced from the same source — two independent
renders converging on one hash, which can only happen if every byte matches.
Confirmed live afterward.

**Decided rather than left open:** `assets/generated/` stays as the deploy's
fallback. The costs that motivated the whole plan — git history, coupled
publish cadence — are already fixed independent of it; what's left is a few
seconds per deploy, and it's the reason a real incident (a docs commit that
deleted 413 generated files) stayed invisible instead of live. Written into
§8 rather than left as a question.

**Docs:** AGENTS.md's Deploy section rewritten into one concrete
step-by-step covering both publish paths, with the sharp edge stated up
front — a published report is not touched by an app deploy, so it can go
stale relative to its own repo until explicitly republished. `@rtm/ingest`'s
README got the same account from the library side.

## 2026-09-03 — Four more reports ingested and shipped

Took the archive from six reports to ten. Picks came off the issue tracker,
filtered to born-digital PDFs with a clean text layer (the OCR-queue pain is
not worth taking on for a batch): **9/11 Commission** (#85), **Deepwater
Horizon / "Deep Water"** (#87), **US v. Philip Morris** (#33),
**Hillsborough Independent Panel** (#90). Ruled out along the way: Katrina
(#86 — ligatures not extracting, magazine layout), FCIC (#57/#102 — known
digit-drop), Enron Powers report and the Wells/DeflateGate report (ligature
failures / no clean source).

**Method:** each report gets its own repo under the org (source PDF + README +
`datapackage.json` + `ingest.ts` + `corrections.yaml` + baseline), cloned as a
sibling directory; registered in `reports/manifest.yaml` and
`reports/registry.yaml`; `pnpm ingest run`, read the output, tune passes,
`pnpm ingest baseline`. Worked on a **sibling `git worktree`**
(`../rtm-reports-batch`, branch `reports-batch`) so the shared main checkout
other sessions use was never switched — a sibling rather than a nested
worktree keeps `dir: ../<report>` resolving.

**Per report:**

- **9/11 Commission** (585 pp, 97.0% retained). Every page opens with an
  Adobe InDesign output slug — `Final1-4.4pp 7/17/04 9:12 AM Page 13` — that
  `runningFurniture()` can't touch (nothing recurs verbatim) and that is the
  only place the printed page number appears. Wrote an inline `productionSlug`
  volume pass in its `ingest.ts`: shape-anchored to the first body line, reads
  `Page N` into `printed`, drops the line. Front-matter staff list (two
  columns) and a few tracked-out chapter openings ("Tue sday, Se ptembe r")
  are left as-is — front matter, and in the OCR queue.
- **Deepwater Horizon** (386 pp, 97.5%, 775 footnotes linked). Clean.
  Front-matter roman page numbers show doubled ("ix ix") from a two-up
  running footer — cosmetic, front matter only.
- **US v. Philip Morris** (1,682 pp, 96.6%). The ECF header stamp strips
  cleanly via `runningFurniture()`. Findings of fact land as numbered,
  individually citable paragraphs. The 40-page dotted-leader TOC renders as
  one long block — acceptable.
- **Hillsborough Panel** (389 pp, 99.7% — the cleanest ingest in the
  archive). Main body (all 12 chapters, decimal-numbered paragraphs) is
  excellent. `quoteInset(10)` fixed the front-matter summary, whose
  hanging-indent numbered list was being severed into blockquotes
  (65 paragraphs → 20, same failure family as the Litvinenko defect).
  **Known weak point:** the report's headings are set as colour and weight,
  invisible to `pdftotext`, so only ~10 (mostly spurious, all-caps quoted
  document titles) are detected and it sections into 9 lumpy pieces. `/full`
  is fully usable; section navigation is not. Filed as an ingestion-quality
  follow-up. Shipped on the strength of `/full`.

`./scripts/verify.sh` green (all ten reports, browser e2e included);
`pnpm ingest check` green.

## 2026-08-22 — Reviewing, then republishing, the PSI/Challenger re-ingest under #79 (issue #108)

#79 (2026-08-08) fixed a real contents-page bug for Litvinenko but deliberately
did not re-apply itself to `us-psi-financial-crisis` or `challenger-accident` —
each produced 100+ lines of unreviewed diff, "including at least one lateral
change," and there wasn't time to read it by hand. This session did that read,
for both, in two passes — the first pass reached the wrong conclusion for
Challenger, caught by the second. Both reports are now republished.

**Method:** baseline = current published `full.md`. Re-ingest with today's
pipeline and the exact metadata already in `reports/registry.yaml` (wrong
metadata adds noise to the diff that has nothing to do with the pipeline).
Diff, read every hunk. Where a hunk read as ambiguous, found its `%%page N%%`
marker, worked out the PDF-file-page offset (front matter before printed
page 1), and read `pdftotext -f N -l N -layout` against the actual source
page — the diff alone cannot tell you which of two readings matches the
document, only the source can.

**`us-psi-financial-crisis` (born-digital, clean): safe, confirmed twice.**
~300 lines, three classes: TOC front matter reading as separated lines
instead of one run-together blob and a data table now rendering one bullet
per row instead of all values smashed together (p. 64, checked against
source — improvement, not #12's list fix, which is bulleted *prose*, not a
table); the already-reviewed #12 list-block change (bulk of the diff, not
re-litigated); and one real, narrow, pre-existing defect unrelated to #79 —
a footnote marker on its own short line in the PDF (an artifact of
`pdftotext -layout` wrapping a superscript) lands stranded on whichever side
of a paragraph break the boundary logic puts it, verified against source
(p. 89): neither position is right, both leave it an unlinked bare number
rather than an inline `[^288]`. Moved, not fixed — low-urgency, recorded, not
blocking.

**`challenger-accident` (scanned, OCR'd): the first pass got this wrong.**
Diffing straight against the historical published `full.md` showed 2,442
lines / 480 hunks, including what looked like a severe regression — "DEAR MR.
SPEAKER:" coming back as "DEARMR. SPEAKER:", confirmed (at the time) against
`pdftotext -layout` on the raw source. Isolating which of #12/#79 caused it,
by checking out each commit's `scripts/ingest/` in turn and re-running,
showed all 480 hunks came from #79 alone — so the conclusion was "don't
apply #79 to Challenger," and it was reported that way, in an AGENTS.md
gotcha, and to Rufus.

**That conclusion didn't survive being asked "what do you need from me to
keep moving."** Told to go ahead and republish both, the natural next
step — re-running the *original pre-#79* `scripts/ingest/` against today's
`pdftotext` to confirm the fix was what changed — instead reproduced 2,079
of those 2,442 lines with **zero code change at all**. `pdftotext` itself
had drifted: `poppler` was 26.08.0 today, installed some time in the two
weeks since Challenger's original ingest, and its own extraction of a
scanned, irregularly-spaced document had changed. The comparison that found
"a 480-hunk regression from #79" was actually mostly "poppler updated
itself," with the code's real contribution hiding inside it.

**Redone holding poppler constant** — old code vs. new code, both re-run
today, so the tool version is identical on both sides — the true code-only
delta is 68 hunks, not 480, and every one of them is already-garbled scan
noise (engineering drawings, tables, form data already unreadable in both
versions) getting bulleted or split differently. No coherent prose is
touched. The "DEAR MR. SPEAKER:" regression and the footnote-count drop
(94 → 89, which was itself a red herring even in the first pass — actual
linked footnote *definitions* were identical, 75 both times) do not appear
at all in the poppler-controlled diff. **Both reports republished** —
`git log` for the commit; `docs/plans` doesn't need a separate record since
this entry is it.

**Two lessons, one corrected:**
- The AGENTS.md gotcha this session first wrote — "test a structural-line
  heuristic against the messiest source, not just the cleanest" — is still
  true in general (PSI and Challenger *did* need separate review, and a
  heuristic proven on Litvinenko wasn't automatically proven elsewhere), but
  the specific claim "#79 regresses Challenger" was wrong and has been
  corrected in AGENTS.md rather than left standing.
- The real lesson is upstream of that one: **a diff against a historical
  committed file is only evidence about *this project's own code* if the
  external tools that produced both sides are the same version.** They
  weren't, silently, for two weeks of poppler updates. Isolating a pipeline
  change by replaying `scripts/ingest/` at different commits (the technique
  #108 was built around) only isolates the code if every comparison point
  re-runs it with *today's* tools rather than trusting an old committed
  output — regenerate the "before" side too, don't just diff against what's
  on disk.

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
