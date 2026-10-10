# `pnpm ingest` — running the library over this corpus

The pipeline itself lives in **[`@rtm/ingest`](https://github.com/reportsthatmatter/ingest)**,
pinned in `package.json`. This directory holds only `cli.ts`, which runs it
over the reports in `reports/`.

```bash
pnpm ingest run <id>        # rebuild one report from reports/<id>/ingest.ts
pnpm ingest verify          # fidelity gates against the real source PDFs, the layout oracle (measure-only except its per-report budgets in `reports/oracle-budget.yaml`, which fail the run when exceeded; --no-oracle, --findings, --ratchet-oracle), then each report's golden pages (golden.yaml; --no-golden, --explain)
pnpm ingest page <id> <vol> <pdfPage> [--draft] [--fixture <name>]   # one page's layout lines beside the blocks made; a draft golden entry; a test fixture
pnpm ingest outline <id>    # one line per PDF page (headings, block counts) to choose golden pages from
pnpm ingest preflight       # is each repo's installed @rtm/ingest the one it pins? (run, verify, check, baseline run it first; --no-preflight skips)
pnpm ingest try <branch|path> [<id>...]   # what would an unreleased ingest do to the rendered corpus? (below)
pnpm ingest folios <id>... [--pages all|N-M] [--limit N] [--json <file>]   # the printed number read off each PDF page, its source (pipeline, vision, html), the printed-minus-PDF offset runs, stray reads and unread pages (vwqr; needs an ingest with folioReport)
pnpm ingest anchors [<id>...] [--check] [--ratchet] [--md <full.md>]   # where each %%page%% marker lands, checked from the PDF text layer alone; budgets in reports/anchor-budget.yaml (docs/quality-harness.md, "Page anchors")
pnpm ingest check           # has any report's output moved?
pnpm ingest baseline <id>   # accept a move, after reading the diff
pnpm ingest referee <id> [--dry-run] [--refer medium]   # fill a report's page-break referee cache (an LLM; offline build reads the committed answers)
pnpm ingest referee eval [--dev|--holdout] --answers rules|oracle|invert|cache|replay:<file>|fake:split|live [--refer medium]   # what the referee does to the adjudicated page breaks
```

`run` on a `cleanEdition` report also prints the edition report: edition words aligned to the PDF, words the PDF never prints, pages anchored or placed by a neighbour, typography restored, disagreements. Its "pages anchored" comes from the alignment that placed the markers, so it cannot fail; `pnpm ingest anchors <id>` is the independent check.

The page-break referee (reportsthatmatter-38s.11): a report that declares `layoutPageJoins({ referee: pageBreakCache(new URL("./referee/pagebreaks.json", import.meta.url)), refer: "medium" })` reads LLM answers for the page breaks the layout rules are least sure of from a committed `referee/pagebreaks.json` in its repo; a build never calls out and a missing answer keeps the rules' call. `pnpm ingest referee <id>` fills it (Anthropic SDK; `ANTHROPIC_API_KEY` or an `ant auth login` profile; `--dry-run` prints the calls and an estimated cost; `--record`/`--replay <file>` record and replay responses; `--fake split` tests the plumbing with no key). `eval` measures against the adjudicated page breaks and exits 1 if the held-out set loses one. Design and numbers: [`docs/design/2026-10-03-pagebreak-referee.md`](../../docs/design/2026-10-03-pagebreak-referee.md).

Golden pages (`<report repo>/golden.yaml`) are verified ground truth for a few PDF pages per report: `verify` fails when a regeneration no longer matches one, and a page the pipeline is known to get wrong is marked `xfail: <bead>` so it stays visible without failing the run. Format, how to write an entry and the oracle's measured precision: [`docs/quality-harness.md`](../../docs/quality-harness.md). `RTM_REPORT_DIRS=<dir>` reads report repos from `<dir>/<repo>` (git worktrees) where they exist; every site script that reads a report repo (ingest, `pnpm score` and `reference.py`, `pipeline status`, `marks`, `link`, `ship`, `bump-pin`) resolves it through `scripts/lib/report-dirs.ts`, and the old `RTM_REPO_ROOT` is still read as a fallback. `run`, `baseline` and `aggregate` refuse a report repo that is the shared checkout (default sibling path, main working tree; `aggregate <id…>` copies and checks only the named reports): `pnpm ingest worktrees <id…>` makes worktrees and prints the `RTM_REPORT_DIRS` to export; the integrator passes `--shared`. `pnpm ingest recheck [--passes a,b] [<id>…]` re-ingests in memory each report declaring a changed pass and fails on a correction that no longer matches once; `pnpm ingest crosscheck` flags golden pages that contradict `reference/adjudicated.yaml`.

## Where a fix goes

| | |
| --- | --- |
| Holds for every document in the corpus | a shared pass, in `@rtm/ingest` |
| A property of *this source* the parser cannot infer | a pass declared in `reports/<id>/ingest.ts` |
| A judgement about *this document's text* | `reports/<id>/corrections.yaml` |

If you are writing a correction to undo something the parser did, you needed a
different pass or a bug fix. The library's own README has the detail, including
the promotion rule for passes.

## Changing the library

It is a separate repo, pinned by tag. A pipeline fix is therefore two steps:
release it there, then bump the pin here and re-run `pnpm ingest check`. That
friction is deliberate — it is what makes each report adopt improvements
knowingly rather than having them arrive unannounced, which is the failure
that motivated the split.

A re-ingest that moves paragraph ids also regenerates the report's aliases: after
`pnpm ingest aggregate`, `pnpm aliases generate --all` (from a branch based on
what is published), commit `reports/<id>/aliases.yaml` and `published-ids.txt`
with it. See AGENTS.md, "Ids move; aliases keep links alive".

After a bump, **reinstall in every report repo** before `pnpm ingest check`: each report's `ingest.ts` imports `@rtm/ingest` from its own `node_modules`, so a repo that was not reinstalled still runs the old library and crashes on whatever the new one exports (v0.18.1: `layoutPageJoins`). `pnpm ingest preflight` lists each repo's pin against its installed version and the `pnpm -C <repo> install` that fixes it.

### Trying an unreleased ingest

```bash
pnpm ingest try ../ingest-my-fix                       # a checkout or worktree of ingest (built if its dist is older than src)
pnpm ingest try fix/hyphen-joins us-911-commission     # a branch or ref of ../ingest (RTM_INGEST_DIR overrides) and the reports to run
pnpm ingest try ../ingest-my-fix --layout --limit 6    # score page breaks from the PDF layout too (slow); more excerpts per kind
pnpm ingest try ../ingest-my-fix --base main           # compare two ingests (a PR against an unreleased main), not the pin against one
pnpm ingest try ../ingest-my-fix --no-findings         # skip the oracle and anchor runs (the slow part)
pnpm ingest try --restore                              # undo a trial that was interrupted
```

With no ids it runs every report. It snapshots the pages the pinned ingest renders, makes a throwaway git worktree of each report repo at its current `HEAD` (shared checkouts are never written; `reference/` and `.cache/` are linked, not copied), links the ingest into this site's `node_modules` and into each worktree (a report repo imports `@rtm/ingest` from its own `node_modules`, so a site-only link fails with "does not provide an export"), re-ingests, copies the result over the site's aggregate, prerenders, and prints per report:

- the join/move list: paragraphs joined, split, changed, added, removed, moved (aligned by text, not id), ids lost and new, sections gone and new, sidenotes and words, with excerpts;
- the quality counts as `pnpm quality report --diff` shows them, regressions marked `▲` (only when a count moved);
- the score decisions that flipped, for reports with a reference edition (`pnpm score --diff`; `--no-score` skips it);
- the **findings diff** (38s.18): the layout-oracle findings, the page-anchor findings and the quality-signal excerpts that appeared or vanished between the two sides, per report, so a reviewer reads the three new cases rather than all 36. Findings are matched by source, signal and text, not by page or id (a page-break join moves every later marker by a page), and one that only changed page is counted, not listed. `--limit N` caps the findings listed per signal; `--no-findings` skips it. It runs `pnpm ingest verify <id> --no-golden --findings-json` and `pnpm ingest anchors <id> --json` against each side, in the trial worktrees.
- the **page source and folio view** (vwqr): per report, the pages whose source flipped between the two sides (vision to pipeline or back, the gate moving) and the pages whose read printed number changed, as ranges. It runs `pnpm ingest folios <id> --json` against each side; a side whose ingest has no `folioReport` is reported as not compared. `--no-findings` skips it too.

**`--base <ref|path>`** makes the "before" side an ingest too, run exactly as the trial is (linked into the site and the report worktrees, re-ingested, prerendered), instead of the pinned ingest as the site renders it now. Use it for a PR against an unreleased `main`, where the pin is the wrong baseline. The base must be at least as new as the passes the report repos declare at `HEAD`: a report repo that imports a pass the base lacks fails with "does not provide an export" (the previous release against report repos already on the new pin does). Every side prints the ingest version and path it used (lesson mv1t); `pnpm ingest verify` prints the same on stderr.

Then it undoes everything: the link, the aggregated `reports/<id>/full.md`, the worktrees, and a final `pnpm prerender`. What it changes is written to `.rtm-try.lock` first, so `--restore` can undo a crashed run; `--keep` leaves the trial state in place for inspecting rendered pages (run `--restore` and `pnpm prerender` afterwards). Paste its output next to `pnpm quality report --diff origin/main` in an ingest PR. A report whose site copy differs from its repo's `full.md` is flagged, because the diff then includes that drift.

### Linking an unreleased ingest by hand

```bash
pnpm ingest link ../ingest-my-fix [<id>...]   # build if stale; link it into this site and into each report worktree under RTM_REPORT_DIRS
pnpm ingest link --status                     # what is linked, and what each link resolves to
pnpm ingest link --restore                    # put every link back
```

This is the documented link override, done for you and undone by one command: it replaces only the `node_modules/@rtm/ingest` symlinks (the site's, and each report worktree's where `RTM_REPORT_DIRS` names one; shared checkouts are never written), records what each pointed at in `.rtm-link.lock` (gitignored), and edits no `package.json` or lockfile, so there is nothing to commit by accident. `pnpm ingest preflight` passes with a linked override. Link the report repos as well as the site: a report's `ingest.ts` imports `@rtm/ingest` from its own `node_modules`, and a site-only link runs the new pipeline with the old definitions. `pnpm install` also undoes it, as it undoes any node_modules edit. Use `pnpm ingest try` for a one-off measurement (it links and restores itself); use `link` when you want to run several commands (`run`, `check`, `verify`, a dev server) against the unreleased ingest.

The pin-bump PR carries a quality report. After the re-ingest, run
`pnpm quality report --diff origin/main` and paste the table into the PR body:
it lists every report's count for every signal against
`reports/quality-last.json`, the counts recorded at the last release, with
regressions marked `▲`. A regression needs a bead; an improvement is locked in
with `pnpm quality ratchet`. Once the release has shipped, `pnpm quality ratchet
--record` and commit `reports/quality-last.json`. A new report's first ingest:
`pnpm quality report <id>` and read the excerpts.

**Integrator steps for an ingest release or pin-bump PR** (38s.6), after the re-ingest and `pnpm prerender`:

1. `pnpm scorecard --out scorecard.md` (about a minute: it runs `pnpm score` and `pnpm ingest verify`; `--base <ref>` for another base, `--verify-log <file>` to reuse a saved verify run). Paste the block into the PR body. It holds the quality diff, the layout-oracle counts and the golden-page table (against `reports/verify-last.json`), and the headline score diff (`docs/scores.json` against the base: page-break join accuracy over all, high-confidence and adjudicated rows as "ours wrong / judged", boundary P/R/F1, marker P/R, WER, the reference's error rate; development and held-out sets apart).
2. Read it. A `▲` or `▼` needs a bead or a sentence in the PR. A held-out score that fell means the pass was tuned on held-out or does not generalise: say which. A `pnpm score` warning about a reference over its ceiling means that report's numbers say little.
3. Commit the regenerated `docs/scores.json` with the re-ingest (it is what the next release is diffed against); `pnpm score` reads the site's `reports/<id>/full.md`, so re-score after the re-ingest and aggregate, not before.
4. After the release ships: `pnpm quality ratchet --record`, `pnpm scorecard --record --no-score`, `pnpm score`; commit `reports/quality-last.json`, `reports/verify-last.json`, `docs/scores.json`.
5. Append what the release taught to [`docs/design/lessons.md`](../../docs/design/lessons.md).
