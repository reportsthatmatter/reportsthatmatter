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

## Golden pages

A signal says "this looks wrong"; a golden page says "this page is right" (plan §3.2, bead b78.4). Each report repo carries `golden.yaml`: 5 to 8 PDF pages whose true structure was read off the page image (`pdftoppm -f N -l N -png`, then looked at) and recorded with who and when. `pnpm ingest verify` regenerates the report and checks every entry; a mismatch fails the run. The library half (`parseGolden`, `checkGoldenPage`, `scoreOracle`, `finalBlocks`) and the entry format are in `@rtm/ingest` (`src/golden.ts`; its README has a section).

```yaml
pages:
  - pdf: 49                    # page within its PDF; `volume: 2` for a later volume
    printed: 48
    verified_by: "agent, 2026-10-02, against the page image"
    features: [A, D, I]        # catalogue classes the page is here to catch
    xfail: reportsthatmatter-men, reportsthatmatter-b94   # known pipeline defects on this page
    xfail_only: [blocks, markers]                         # ...in these assertions only
    continues_previous: true   # the page opens mid-paragraph...
    opens_with: "bone marrow failure, multi-organ failure"
    blocks:                    # the blocks that START on this page, in order
      - paragraph: {start: "3.174 Third, Dr Cary noted", end: "polonium 210.", notes: [202]}
      - quote: {start: "“I am entirely satisfied", end: "may be recorded.”", notes: [203]}
      - heading: "Dr Harrison and his colleagues"
      - paragraph: {start: "3.179 Having ascertained", continues: true}   # runs over the break
    footnotes: [201, 202, 203]  # note numbers defined on this page
    markers: [201, 202, 203]    # markers referenced on it
    must_contain: ["a run of text held by one block"]
    must_read: ["exactly this, hyphens and spacing kept"]
    must_be_quote: ["inside a quotation block"]
    must_not_be_quote: ["outside any quotation"]
    must_not_contain: ["furniture or note text that must not reach the body"]
    separate: ["table row one", "table row two"]   # each found, no block holding two
    headings: ["only"]          # without `blocks` (a page with a table): the headings that start here
```

Conventions: a quotation is one block however many paragraphs it has (the pipeline keeps consecutive indented paragraphs together and quotations carry no ids); a heading's enumerator ("I.", "(3)", "2.1") is not compared; quote style, hyphens and spacing are ignored except under `must_read`; an assertion left out is not asserted (`markers: []` asserts there are none). Numbers are linked as the final text links them, not re-linked: `finalBlocks(result)` is `result.blocks` with each block's final text (`IngestResult.linkedText`: markers as `[^N]`, hyphens rejoined, OCR fixed).

**A page the pipeline gets wrong must fail, and verify must stay green.** Mark it `xfail: <bead>` and list in `xfail_only` the kinds of assertion that are known to fail (`blocks`, `headings`, `footnotes`, `markers`, `must_contain`, `must_read`, `separate`, `must_be_quote`, `must_not_be_quote`, `must_not_contain`, `opens`). Those may fail; any other that fails is a regression and fails the run; and when every listed one passes the run fails until the xfail comes off. So a page that is red for a known reason still guards everything else on it: removing `quoteInset(3)` from Litvinenko fails page 49, which is xfail for its missing subheading and unlinked markers, on `must_be_quote`. `verify` prints `now passing: ...` when a known failure shrinks, so `xfail_only` can be narrowed.

Writing an entry:

```bash
pnpm ingest outline <id>                        # one line per PDF page: headings, blocks, notes (choose pages)
pnpm ingest page <id> <volume> <pdfPage>        # layout lines (indentEm, rightGapEm, font, label, raised) beside the blocks made
pnpm ingest page <id> <volume> <pdfPage> --draft            # the pipeline's reading as a draft entry (verified_by left empty)
pnpm ingest page <id> <volume> <pdfPage> --fixture <name>   # a test fixture (page XML, blocks, notes) in .cache/fixtures/
pdftoppm -f N -l N -r 75 -png <pdf> /tmp/page   # then look at the image: the draft is the pipeline's reading, not the truth
pnpm ingest verify <id> [--explain]             # --explain: where the oracle and the entries disagree, with what the oracle saw
```

`RTM_REPORT_DIRS=<dir>` makes the CLI read `<dir>/<repo>` instead of `../<repo>` where it exists, for working in git worktrees of the report repos. A golden page is edited only when the PDF says the entry was wrong, with the reason in the commit message.

Where a report has `reference/adjudicated.yaml` (38s.12), a golden page on one of its breaks agrees with the verdict (a `note:` says so): Columbia 21 and 100, Chilcot 10 and 38, Hillsborough 34, Saville 64.

### The pages (2026-10-02, ingest v0.18.0)

77 pages, 13 reports; 14 match the PDF in full, 63 are known failures (each with a bead); every page's other assertions hold. Chosen from the catalogue's examples (each class A to M has a page that would catch its return) plus an ordinary page per report; so the sample over-represents hard pages and says nothing about the rate of defects across the report.

| report | pages (PDF page; vol.page for later volumes) | match in full |
|---|---|---:|
| litvinenko-inquiry | 35, 49, 86, 100, 111, 284, 310 | 1 |
| jack-smith-vol1 | 10, 21, 30, 40, 44, 63, 64, 146 | 3 |
| us-psi-financial-crisis | 65, 69, 153, 174, 274, 438, 439 | 2 |
| challenger-accident | 11, 22, 29, 62, 68, 85, 204 | 0 |
| uk-leveson-inquiry | 1.19, 1.110, 1.111, 1.300, 2.16, 3.15, 4.55 | 1 |
| columbia-accident | 21, 43, 100, 119, 145, 170 | 0 |
| us-911-commission | 32, 37, 48, 271, 446 | 2 |
| us-deepwater-horizon | 17, 71, 72, 100, 266, 323 | 0 |
| us-v-philip-morris | 35, 400, 955, 1265, 1617 | 1 |
| uk-hillsborough-panel | 34, 36, 64, 90, 100 | 0 |
| uk-saville-inquiry | 26, 50, 64, 123, 157 | 2 |
| uk-chilcot-inquiry | 5, 8, 10, 12, 38 | 2 |
| us-lehman-examiner | 1.2, 1.20, 1.60, 2.21, 2.22 | 0 |

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

Margin, pitch and body font are measured per page and document (`openLayout`); the thresholds are `ORACLE` in `src/oracle.ts`. Blocks are read as the reader gets them (`finalBlocks`: markers linked by every step, including the endnotes pass that runs on the serialised text), so a `markers-unlinked` is a marker the output really leaves bare. Before this, 9/11's endnote markers were read from the raw blocks and counted 1,734 unlinked; they are 18. Elements the oracle cannot find on their source page (a heading built from a contents list, garbled OCR, a paragraph set in a callout face) are counted as unlocated, not as disagreements: they are the oracle's coverage gap, not a defect.

### Counts per report

Measured on ingest v0.18.0 (2026-10-02), reading each block's final text.

| report | headings-missed | headings-spurious | markers-unlinked | markers-spurious | paragraphs-oversplit | paragraphs-merged | quotes-spurious | quotes-missed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| litvinenko-inquiry | 220 | 0 | 103 | 162 | 255 | 1,252 | 184 | 46 |
| jack-smith-vol1 | 96 | 37 | 37 | 81 | 152 | 425 | 51 | 53 |
| us-psi-financial-crisis | 153 | 5 | 514 | 33 | 132 | 858 | 226 | 91 |
| challenger-accident | 236 | 76 | 24 | 138 | 347 | 1,971 | 331 | 212 |
| uk-leveson-inquiry | 1,350 | 2 | 7,451 | 120 | 2,100 | 2,537 | 319 | 1,254 |
| columbia-accident | 93 | 4 | 503 | 19 | 537 | 724 | 290 | 214 |
| us-911-commission | 67 | 3 | 18 | 17 | 113 | 2,377 | 29 | 164 |
| us-deepwater-horizon | 334 | 0 | 2,132 | 600 | 397 | 906 | 31 | 72 |
| us-v-philip-morris | 0 | 27 | 38 | 19 | 958 | 992 | 261 | 345 |
| uk-hillsborough-panel | 390 | 0 | 931 | 0 | 125 | 794 | 22 | 49 |
| uk-saville-inquiry | 176 | 3 | 1,394 | 6 | 226 | 1,230 | 552 | 20 |
| uk-chilcot-inquiry | 13 | 3 | 283 | 3 | 15 | 387 | 6 | 76 |
| us-lehman-examiner | 45 | 5 | 233 | 20 | 144 | 221 | 143 | 99 |

Scanned reports (Challenger, Jack Smith) read through `pdftohtml -hidden`, which keeps the OCR text layer `pdftotext` also reads. Their fonts are the scanner's, so their heading and quote counts are noisier (see precision).

### Precision, against golden pages

Each oracle signal's count on a golden page set against what that page's entry says is wrong (`scoreOracle`: counts matched one for one, `tp` = min(oracle, truth), `fp` = counted beyond the truth, `fn` = true and not counted). `pnpm ingest verify` prints the table over every golden page; `--explain` lists each disagreement with the lines the oracle saw. ingest v0.18.0, 77 pages; a signal is scored only on pages whose entry speaks to it (`blocks` for the block signals, `markers` for the marker signals). Pages were chosen for being hard, so recall is recall on the hard cases.

| signal | tp | fp | fn | precision | recall | born-digital precision | scanned precision |
|---|---:|---:|---:|---:|---:|---:|---:|
| `markers-unlinked` | 75 | 52 | 21 | 59% | 78% | 59% | 100% (n=1) |
| `headings-missed` | 23 | 24 | 19 | 49% | 55% | 59% | 0% |
| `paragraphs-oversplit` | 45 | 11 | 83 | 80% | 35% | 73% | 95% |
| `quotes-spurious` | 15 | 4 | 13 | 79% | 54% | 79% | n/a |
| `markers-spurious` | 8 | 13 | 3 | 38% | 73% | 64% | 10% |
| `headings-spurious` | 1 | 3 | 6 | 25% | 14% | 50% | 0% |
| `paragraphs-merged` | 15 | 132 | 1 | 10% | 94% | 8% | 15% |
| `quotes-missed` | 1 | 14 | 0 | 7% | 100% | 7% | 0% |

Per report, `tp/fp/fn` for the four signals worth a second look:

| report | headings-missed | markers-unlinked | paragraphs-oversplit | quotes-spurious |
|---|---|---|---|---|
| litvinenko-inquiry | 4/0/2 | 5/0/1 | 0/1/5 | 2/0/0 |
| jack-smith-vol1 | 0/8/0 | 1/0/1 | 2/1/0 | - |
| us-psi-financial-crisis | 0/5/2 | 1/0/7 | 1/0/1 | 1/1/1 |
| challenger-accident | 0/0/9 | 0/0/9 | 16/0/16 | 0/0/3 |
| uk-leveson-inquiry | 9/0/0 | 21/0/2 | 6/0/3 | 2/2/0 |
| columbia-accident | 0/0/5 | 8/15/1 | 13/3/34 | 6/0/0 |
| us-911-commission | 0/4/1 | - | 0/6/6 | 2/0/3 |
| us-deepwater-horizon | 1/3/0 | 6/18/0 | 1/0/5 | 1/0/0 |
| us-v-philip-morris | - | 1/0/0 | 5/0/5 | 0/0/3 |
| uk-hillsborough-panel | 6/0/0 | 8/0/0 | 0/0/4 | - |
| uk-saville-inquiry | 1/4/0 | 0/11/0 | 0/0/4 | 1/1/3 |
| uk-chilcot-inquiry | 2/0/0 | 4/0/0 | - | - |
| us-lehman-examiner | - | 20/8/0 | 1/0/0 | - |

What the false positives are (each read on the page with `--explain`):

- `markers-unlinked`: all 52 are three oracle gaps. A notes page (Columbia p.119, Deepwater p.323) prints its note numbers as small raised digits, and the oracle reads them as markers (33). Saville links its notes as `[^1-31]` (note 1 of paragraph 31) and the oracle looks only for `[^N]` (11). Lehman's leverage tables carry a marker in every cell and the oracle counts the digits twice (8). Without them it is 75 of 75.
- `headings-missed`: a scanned page's OCR face differs from line to line (Jack Smith p.63: 8 body lines read as headings); bold run-in subheads in PSI and figure labels in 9/11 and Deepwater that the layout sets big. On Hillsborough, Leveson, Litvinenko and Chilcot, the reports whose headings are typographic, it is 21 of 21.
- `paragraphs-merged`: the oracle counts every line the layout opens (each item of a list, each paragraph inside a quotation, each table row) with no block opening there; the pipeline keeps a quotation as one block and a list as one block. 132 false positives, mostly Chilcot (35), Saville (22), Columbia (21), Deepwater (12), PSI (12), PM (14). It measures the pipeline's conventions, not defects.
- `quotes-missed`: the same convention (a run inset on both sides that continues a quotation already open).
- `paragraphs-oversplit`: high precision; it misses most of what is wrong (recall 35%) because it only fires on a block whose first line the layout says continues, and the scans' lines carry no layout to compare (Challenger 16 of 32).
- `markers-spurious`: OCR digits on scanned pages (Jack Smith 8); too few true cases elsewhere.

**Which signals get budgets** (rule: a signal is budgeted per report when its precision on that report's golden pages is at least 80% on at least 5 counted findings, and the budget only ratchets down):

- `markers-unlinked`: yes, after the two cheap fixes that remove every false positive above (skip lines of a page that defines endnotes; read `[^N-label]` as note N). Until then budget only the born-digital reports where it is clean: Leveson (21/21), Hillsborough (8/8), Chilcot (4/4), Litvinenko (5/5), Philip Morris (1/1). It is the signal with the highest recall (78%), and it is the largest defect class by count.
- `paragraphs-oversplit`: yes for Challenger (16/16), Columbia (13/16), Leveson (6/6) and Philip Morris (5/5), the reports with at least 5 findings on golden pages; too few elsewhere (Jack Smith 2/3, 9/11 0/6 and Litvinenko 0/1 are the doubtful ones). Recall is 35%, so the count under-reports; that is safe for a ratchet that only goes down.
- `quotes-spurious`: Columbia only (6/6); everywhere else there are at most 4 findings on golden pages (overall 79% on 19).
- `headings-missed`: per report where the golden pages say it is right: Hillsborough (6/6) and Leveson (9/9); Litvinenko (4/4) and Chilcot (2/2) are clean but have too few findings to say. Not on the scans, PSI, 9/11, Saville or Deepwater.
- No budget: `paragraphs-merged`, `quotes-missed` (conventions, not defects: fix the oracle to count a quotation or a list as the block the pipeline makes, then re-measure), `headings-spurious` (4 findings on golden pages: not enough to say), `markers-spurious` (38%).

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
