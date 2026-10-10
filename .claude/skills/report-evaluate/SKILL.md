---
name: report-evaluate
description: Use when checking and refining a report's ingested text on Reports that Matter before it ships — reading rendered pages, quality signals and budgets, golden pages, the layout oracle, scoring against a reference edition with adjudicated page breaks, fidelity review, corrections, registering the report, writing PROCESSING.md, and parking hard cases. Stage 4 of the preparation pipeline, after report-first-ingest.
---

# Stage 4: evaluate and refine

**Level:** `level:specced` (Sonnet); a new defect class is `level:judgement` (Opus). Rules for every agent: [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) (R1-R16).

Design: `docs/design/2026-10-03-report-preparation-pipeline.md` §2-3. The tools: `docs/quality-harness.md` (signals, budgets, golden pages, oracle), `docs/scoring.md` (score, adjudicated breaks, `--shadow`). Registration and PROCESSING.md: `docs/report-preparation.md` §3-6, §8. House rules on text bugs: AGENTS.md.

**Entry.** Stage 3's gate met: a first `full.md` with its quality numbers.

## Procedure

0. **Setup.** Your site worktree with `RTM_REPORT_DIRS` exported for the report you own (`pnpm ingest worktrees <id>`, as in stage 3). `pnpm pipeline status --check` checks the parts of this gate it can derive (golden pages, reference, PROCESSING.md, registry) for the report's row.
1. **Read the output.** The report-preparation.md §3 list: page-break splits, footnotes, headings, stray characters, facing-page margins, tables and figures leaking. `pnpm quality report <id>` gives the counts; `pnpm quality check` prints excerpts only for signals over budget; read each against the rendered page (`pnpm dev`, `/reports/<id>/full`).
2. **Golden pages.** `pnpm ingest outline <id>`, choose 5-8 hard pages, `pnpm ingest page <id> <vol> <pdfPage> --draft`, then look at the page image (`pdftoppm -f N -l N -r 100 -png ../<repo>/archive/<file>.pdf /tmp/p`) and correct the draft. A page the pipeline gets wrong is `xfail: <bead>`.
3. **Score** (where `reference/manifest.json` exists; `reference/raw/` alone needs `python3 scripts/score/reference.py build <id>` first, stage 2). `pnpm score <id> --adjudicate-draft`, decide the 30 breaks against the PDF, commit `reference/adjudicated.yaml`; `pnpm score <id>`, read `score-out/<id>/errors.md`. Held-out: score once and do not tune passes on what you read. Hybrid (`cleanEdition`): `pnpm score <id> --shadow` scores the PDF shadow against the served edition. No reference possible: a `waive:` entry in `reports/pipeline.yaml` naming the bead that owns it.
4. **Oracle.** `pnpm ingest verify <id>` (`--findings` to read them) fails only when a signal budgeted in `reports/oracle-budget.yaml` exceeds its budget or a golden page fails; unbudgeted oracle counts are information. Its first line names the `@rtm/ingest` version: check it is the one you meant.
5. **Fix.** A source property: a pass declared in `ingest.ts`. A corpus rule: an opt-in pass in an ingest PR (`pnpm ingest try`). A judgement about the text: `corrections.yaml` from `fidelity.md`. Never edit `full.md`.
6. **Converge** (AGENTS.md "Converge and ship"): keep a table in the PR body, pass added → `pnpm quality report <id>` deltas, and keep only passes that measurably help, each with a test or golden page. Stop adding passes and ship the best servable state when each fix surfaces a different quirk, after about 2-3 hours with no PR, or after three new passes without a PR; a stretch that will not converge (scanned pages, an appendix, a volume) is scoped out as a later unit or served with a Known limitations line, each with a bead. A whole report that meets a new defect class after one fix attempt: bead it (label `research`), hold its PRs, set `state: parked` in `reports/pipeline.yaml`, stop. Either way, list what is left (defect, count, pages, bead) in the stage bead's notes.
7. **Register** (site worktree): `reports/registry.yaml` entry with `ingested: true`; `pnpm ingest aggregate <id>` with `RTM_REPORT_DIRS` exported (copies only that report's `full.md` and `PROCESSING.md` into `reports/<id>/`); `pnpm prerender`; `pnpm aliases generate <id>`; `pnpm corpus accept <id>` after reading the diff; `reports/anchor-budget.yaml` from `pnpm ingest anchors <id>`. Propose budget lines in `reports/quality-budget.yaml` and `reports/oracle-budget.yaml` (hand edits with `# why:`); the integrator runs `pnpm quality baseline`.
8. **PROCESSING.md** in the report repo (template `../uk-saville-inquiry/PROCESSING.md`), numbers taken from `fidelity.md`, `pdfinfo` and `full.md`. Every known defect: a Bead and a Known limitations line.
9. `./scripts/verify.sh`.

## Exit gate

- [ ] `./scripts/verify.sh` exits 0 with the report registered
- [ ] `golden.yaml` has 5-8 pages; each passes or is `xfail: <bead>`
- [ ] Reference reports: `adjudicated.yaml` committed, `pnpm score` headline in the PR
- [ ] Quality within budget (or the median rate); oracle within budget
- [ ] `PROCESSING.md` written; every known defect beaded and listed under Known limitations
- [ ] Rendered pages read; the URLs looked at are listed in the PR
- [ ] your PR sets the unit's `reports/pipeline.yaml` row to `reached: evaluate` (if it is already at a later stage, leave it) (or `state: parked`)

**Hands on:** site PR, report-repo PR, ingest PR if any. **Gap:** `pnpm report ready <id>` (this gate as one command) does not exist yet (ifb5.12). Uncaught defect classes: agent protocol R8. Retro and lessons: agent protocol R13-R14.
