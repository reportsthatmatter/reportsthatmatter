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
pnpm ingest check           # has any report's output moved?
pnpm ingest baseline <id>   # accept a move, after reading the diff
```

Golden pages (`<report repo>/golden.yaml`) are verified ground truth for a few PDF pages per report: `verify` fails when a regeneration no longer matches one, and a page the pipeline is known to get wrong is marked `xfail: <bead>` so it stays visible without failing the run. Format, how to write an entry and the oracle's measured precision: [`docs/quality-harness.md`](../../docs/quality-harness.md). `RTM_REPORT_DIRS=<dir>` reads report repos from `<dir>/<repo>` (git worktrees) where they exist.

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
pnpm ingest try --restore                              # undo a trial that was interrupted
```

With no ids it runs every report. It snapshots the pages the pinned ingest renders, makes a throwaway git worktree of each report repo at its current `HEAD` (shared checkouts are never written; `reference/` and `.cache/` are linked, not copied), links the ingest into this site's `node_modules` and into each worktree (a report repo imports `@rtm/ingest` from its own `node_modules`, so a site-only link fails with "does not provide an export"), re-ingests, copies the result over the site's aggregate, prerenders, and prints per report:

- the join/move list: paragraphs joined, split, changed, added, removed, moved (aligned by text, not id), ids lost and new, sections gone and new, sidenotes and words, with excerpts;
- the quality counts as `pnpm quality report --diff` shows them, regressions marked `▲` (only when a count moved);
- the score decisions that flipped, for reports with a reference edition (`pnpm score --diff`; `--no-score` skips it).

Then it undoes everything: the link, the aggregated `reports/<id>/full.md`, the worktrees, and a final `pnpm prerender`. What it changes is written to `.rtm-try.lock` first, so `--restore` can undo a crashed run; `--keep` leaves the trial state in place for inspecting rendered pages (run `--restore` and `pnpm prerender` afterwards). Paste its output next to `pnpm quality report --diff origin/main` in an ingest PR. A report whose site copy differs from its repo's `full.md` is flagged, because the diff then includes that drift.

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
