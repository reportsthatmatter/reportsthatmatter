# `pnpm ingest` — running the library over this corpus

The pipeline itself lives in **[`@rtm/ingest`](https://github.com/reportsthatmatter/ingest)**,
pinned in `package.json`. This directory holds only `cli.ts`, which runs it
over the reports in `reports/`.

```bash
pnpm ingest run <id>        # rebuild one report from reports/<id>/ingest.ts
pnpm ingest verify          # fidelity gates against the real source PDFs, the layout oracle (measure-only; --no-oracle, --findings), then each report's golden pages (golden.yaml; --no-golden, --explain)
pnpm ingest page <id> <vol> <pdfPage> [--draft] [--fixture <name>]   # one page's layout lines beside the blocks made; a draft golden entry; a test fixture
pnpm ingest outline <id>    # one line per PDF page (headings, block counts) to choose golden pages from
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

The pin-bump PR carries a quality report. After the re-ingest, run
`pnpm quality report --diff origin/main` and paste the table into the PR body:
it lists every report's count for every signal against
`reports/quality-last.json`, the counts recorded at the last release, with
regressions marked `▲`. A regression needs a bead; an improvement is locked in
with `pnpm quality ratchet`. Once the release has shipped, `pnpm quality ratchet
--record` and commit `reports/quality-last.json`. A new report's first ingest:
`pnpm quality report <id>` and read the excerpts.
