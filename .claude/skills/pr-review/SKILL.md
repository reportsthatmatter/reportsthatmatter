---
name: pr-review
description: Use when you are the reviewer agent gating PRs on Reports that Matter before the integrator merges and ships them — trial-merging the PRs onto main, running the checks and the ratchet, reading the diffs and rendered pages, pushing fixups, and writing the review file with verdicts and the integrator's steps. Rufus does not review PRs; this review is the gate.
---

# Reviewer: gate PRs before the integrator ships them

**Level:** `level:judgement`. **Rules:** [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) (R1-R15) apply, except that a reviewer may push fixup commits to the PR branches. Why the review is the gate: AGENTS.md "Working conventions" ("Rufus does not review PRs"). What the integrator then does: the `integrate-and-ship` skill and `docs/release-checklist.md`. House format: the files `~/src/reportsthatmatter/review-*-2026-10-0*.md` (outside git; `review-v0.24.0-2026-10-04.md` is the model).

**Entry.** A list of PRs (site, ingest, report repos) and their beads. Read each PR's body and `gh pr diff <n>`.

## Procedure

1. **Record heads.** `gh pr view <n> --json headRefOid,baseRefName,mergeable,files` for each PR; note the short sha at review start.
2. **Trial worktrees** (R1): site `rtm-review<slug>-<MMDD>` (slug: the PR numbers or batch name, e.g. `review299-1009`) on a branch `trial<slug>-<MMDD>` from `origin/main`, then `pnpm bootstrap` (checks refuse without `node_modules` and a prerender); merge each PR branch into it in the order you propose (`git merge --no-ff origin/<branch>`), then `pnpm prerender` again if a merge touched `reports/`, the pin or `scripts/prerender.mjs`. Reviewing an already-merged PR (a rehearsal): base on the merge commit's first parent and merge the pre-merge head (`gh pr view <n> --json headRefOid,mergeCommit`). Ingest PRs: an `ingest-review<slug>-<MMDD>` worktree, same merges, `pnpm build && git status --porcelain -- dist` (must be empty) and `pnpm test`. A conflict here is a finding: write its resolution down for the integrator.
3. **Which checks apply**: report text or ingest: all of steps 3-7; editorial: 4, 6, 7; site code or tooling: 4 and 7, plus grep every documented `pnpm <script> …` invocation in AGENTS.md, `docs/` and `.claude/skills/` against a changed CLI parser (`pnpm vitest run tests/skills.test.ts` checks the script names). **Corpus effect of an ingest change**: from the site trial, `pnpm ingest try ../ingest-review<slug>-<MMDD>` (all reports) and paste its join/move list, quality deltas and score flips. "Opt-in" claims are checked here: every report that does not declare the pass must be unchanged.
4. **Checks on the trial**: `pnpm typecheck`, `pnpm test`, `pnpm quality check`, `pnpm corpus check`, `pnpm editorial`, `pnpm aliases check`; for report text, `RTM_REPORT_DIRS=… VERIFY_SHARED=1 ./scripts/verify.sh` and save the log to `~/src/reportsthatmatter/rtm-review<slug>-<MMDD>-verify.log`. Read every diff; never `accept`/`baseline` to quieten one.
5. **Ratchet**: `pnpm quality ratchet --dry-run`; if anything would fall, run `pnpm quality ratchet`, commit it to the PR branch (ship's `committed` gate refuses a dirty tree otherwise).
6. **Read the product**: `pnpm dev` and open the pages the PR changes (the bead's examples, the new report's landing page, `?p=` links). Editorial: check every quotation verbatim and every background fact against a source (`docs/report-introductions.md` checklist). Imagery: rights recorded in `sources.yaml`.
7. **Ship rehearsal**: `pnpm ship --plan --state build/review-ship-state.json` (a scratch state file; `--plan` runs nothing). New reports: `pnpm publish-report <id> --dry-run --offline` for the object count; D1 cost from `pnpm publish-report <id> --dry-run` (reads D1 read-only) or reasoned from the last ship (`docs/design/lessons.md`).
8. **Fixups**: commit small, clearly-scoped fixes to the PR branch with a message naming the finding; anything larger is a finding with a bead (`bead-writing` skill).
9. **Write the review file** `~/src/reportsthatmatter/review-<scope>-<YYYY-MM-DD>.md`, sections in this order:
   - Title; "Reviewer: <model> agent. I did not touch production: …" (list what you did not run); **Verdict:** one bold line.
   - **Scope**: each PR, branch, head at start and after fixups.
   - **Trial**: worktrees, what was merged, each check with its result and log path.
   - **Verdicts** table: PR | verdict (MERGE / SHIP / HOLD / MERGE after X) | reason.
   - **Findings, by severity** (fixed on the branch, with commit; not fixed, with bead) or **Fixups pushed**.
   - **What moves** (reports, ids lost), **D1 estimate**, **Found only by the trial merge**, as relevant.
   - **Integrator steps**: numbered, exact commands, merge order, conflict recipes, beads to close on ship.
   - **Beads** filed or noted; **Lessons**; **Getting better faster** (R13).
10. **Beads and lessons**: append the verdict line and the review file path to each PR's bead (`bd update <id> --append-notes`); lessons on the PR branch (R14); `bd dolt push`.

## Exit gate

- [ ] Every PR has a verdict, the head sha it applies to, and the trial-merge result
- [ ] Checks run on the trial merge, not on each branch alone; logs named
- [ ] Ratchet committed if it moved; no unread `accept`/`baseline`
- [ ] Integrator steps are exact commands in order; a fresh integrator could follow them
- [ ] Review file written; beads noted; nothing merged, released, deployed, published or seeded

## Failure modes

- **Trial merge conflicts on derived files** (`marketing/queue.yaml`, `reports/corpus-baseline.json`, `src/generated/*`): take main's and regenerate (`pnpm posts`, `pnpm corpus accept <id>`, `pnpm editorial`), as the integrator will.
- **`pnpm install` in a linked trial undoes the link** (irfs): `pnpm ingest link --restore`, then link again.
- **A check passes only in your worktree** because you seeded local D1 or have a stale cache: re-run in a fresh worktree before writing "pass".
- **A state value or field the tests reject** (e.g. `state: done` in `reports/pipeline.yaml`): run the test before writing it into the integrator steps.
