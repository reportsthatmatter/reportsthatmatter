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

## What it does not replace

`pnpm ingest check` still gates the pipeline's own output, and `digitDensityCheck`, `losslessCheck`, `retentionCheck` and the structural checks in `@rtm/ingest` still gate. The 20% severed-sentence rate and the "document has headings" check there are informational (the severed count is budgeted per report as `severed-into-quote`).

Where a report has a reference edition (a clean independent text), `pnpm score <id>` measures against it instead of against known shapes, and reports each signal's precision and recall against those errors: [`scoring.md`](scoring.md).
