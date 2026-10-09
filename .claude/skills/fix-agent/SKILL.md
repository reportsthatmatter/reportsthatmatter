---
name: fix-agent
description: Use when you are one of several agents on Reports that Matter and have been handed a bead to fix (an ingest pass, a text defect, a site or tooling change) — sets up worktrees, measures before and after, opens PRs without releasing, and ends with notes, lessons and the "Getting better faster" retro. The per-agent procedure for docs/agent-protocol.md.
---

# Fix agent: one bead, worktrees, measure, PR, retro

**Level:** the bead's own `level:*` label. **Rules:** [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) (cited below as R1-R15); read it and AGENTS.md first. Where the fix goes: `scripts/ingest/README.md`. Text-bug closing rules: AGENTS.md "House rules" ("A text bug closes on a failing check", "A bug bead closes with a golden page").

**Entry.** A bead id, the report repos you own, and a branch slug. If the bead is not handoff-ready (no Goal/Where/Acceptance), write the missing parts into its notes before starting (`bead-writing` skill).

## Procedure

1. **Read the bead.** `bd show <id>`; note its acceptance commands and the examples (pages, paragraph ids).
2. **Worktrees** (R1), with absolute paths; `<MMDD>` is today, e.g. `1009`:
   ```bash
   cd ~/src/reportsthatmatter
   git -C reportsthatmatter fetch -q origin
   git -C reportsthatmatter worktree add ~/src/reportsthatmatter/rtm-<slug>-<MMDD> -b <branch> origin/main
   cd rtm-<slug>-<MMDD> && pnpm bootstrap            # ~2 min; never symlink node_modules
   pnpm ingest worktrees <id…>                        # only for report repos you own
   export RTM_REPORT_DIRS=<the value it printed>      # in every later shell: env does not persist
   ```
   An ingest fix also needs `git -C ~/src/reportsthatmatter/ingest worktree add ~/src/reportsthatmatter/ingest-<slug>-<MMDD> -b <branch> origin/main` and `CI=true pnpm install` there.
3. **Measure before.** The bead's acceptance command on `origin/main` (e.g. `pnpm quality report <id>`, `pnpm ingest verify <id> --findings`, `pnpm score <id>`). Save the output to a file beside the worktree (`../rtm-<slug>-<MMDD>-before.log`).
4. **Make the failing check first** for a text bug: a quality signal or golden page (`pnpm ingest page <id> <vol> <pdfPage> --draft`) that fails on the current output. If none can see the defect, that is the first change.
5. **Fix** where `scripts/ingest/README.md` says it goes (R2): a pass the report declares in `ingest.ts`, an opt-in pass in ingest, or `corrections.yaml`. Never edit `full.md`.
6. **Measure after.** Ingest change: `pnpm ingest try ../ingest-<slug>-<MMDD> [<id>…]` from the site worktree (all reports for a shared default). Then `pnpm ingest check`, `pnpm corpus check`, `pnpm quality check`; read every diff (R5). A lowered count: `pnpm quality ratchet <id>`, commit it. Open the rendered page for each example (`pnpm dev`, then `/reports/<id>/full?p=<para-id>`).
7. **Gate.** `pnpm typecheck && pnpm test`; for report text also `./scripts/verify.sh` (with `RTM_REPORT_DIRS` set; add `VERIFY_SHARED=1` so aggregate reads the shared checkouts you do not own). Failures only in reports you do not own are peer noise (R6).
8. **Editorial** (R7): if your report's ids moved, `pnpm prerender && pnpm editorial`; fix `editorial/<id>.yaml`, then `git checkout src/generated/editorial.ts`.
9. **Lessons** (R14): append one-line entries to `docs/design/lessons.md` in the format at its top.
10. **PRs** (R4): commit, `git push -u origin <branch>`, `gh pr create` per repo (ingest, report repo, site). The PR body: before/after numbers, `pnpm ingest try` output or `pnpm quality report --diff origin/main`, the pin bump needed, the passes a report must declare. Never merge, release or deploy.
11. **Beads** (R8): `bd update <id> --append-notes "<what changed, PR URLs, numbers>"`; new defects via the `bead-writing` skill; uncaught defect classes to `reportsthatmatter-b78.1`; `bd dolt push`. Do not close.
12. **Final report** (R9) ending with the retro (R13).

## Exit gate

- [ ] Before/after numbers for the bead's acceptance command, in the PR body
- [ ] `pnpm typecheck` and `pnpm test` pass; `verify.sh` passes or its failures are named peer noise
- [ ] Every diff from `ingest check` / `corpus check` / `quality check` read and explained; ratchet committed if a count fell
- [ ] PRs open; nothing merged, released, deployed or published
- [ ] Bead notes appended; lessons appended; retro in the final report

## Failure modes

- **`ingest run` refuses "shared checkout"**: you skipped `pnpm ingest worktrees` or `RTM_REPORT_DIRS` is not exported in this shell.
- **"Run: pnpm prerender"** from `corpus`/`quality`/`typecheck`/`test`: an input changed; run `pnpm prerender`.
- **Missing export / version mismatch** from `ingest`: `pnpm ingest preflight` prints the `pnpm -C <repo> install` to run.
- **`pnpm install` undid your link** (irfs): `pnpm ingest link --restore`, then `pnpm ingest link <dir>` again.
- **A different defect appears after one fix attempt on a hard report**: stop, bead it with label `research`, hold the PRs (AGENTS.md "Park hard reports").
- **Cut off by usage limits**: R15, commit `WIP:` and push.
- **Never** `git stash`, switch branches or edit in a shared checkout; after `cd`, check `pwd` before editing.
