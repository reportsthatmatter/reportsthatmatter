# Beads as the Sole Work Entry Point

**Date:** 2026-09-18

## Purpose

Retire GitHub issue #77 as the project's parallel work map. Beads is the sole
source for active work, priority, status, dependencies, blockers, acceptance
criteria, and the next task to pick up.

## Entry point

Every active onboarding document directs a returning contributor or agent to:

```bash
git pull
bd dolt pull
bd ready
```

`AGENTS.md` remains the source for house rules and the done condition.
`docs/ARCHITECTURE.md` remains the source for how the system works. GitHub
issues remain useful for public discussion, report candidates, and broad
context, but they do not duplicate active task state.

Historical plans and specifications keep their references to issue #77 because
those references describe the workflow at the time. Generated report content
that happens to contain “#77” is unrelated and is not changed.

## Work requiring Rufus

When progress requires a decision or action from Rufus:

1. Create a separate Bead labelled `needs-user`.
2. State the exact decision or action in its description.
3. Give it acceptance criteria that make completion unambiguous.
4. Add it as a dependency of every Bead it blocks, so `bd ready` excludes the
   blocked work and `bd dep tree` explains why.

A note saying that input would be useful is not enough. If work can safely
continue under a reasonable assumption, it does not need a `needs-user` Bead.

## Autonomous work loop

After the migration, take the highest-priority unblocked Bead, preferring work
already in progress over new work at the same or lower priority. Follow each
repository's verification and publishing rules, update the Bead with durable
findings, and continue to the next ready item. Do not wait for routine approval.

The first resumed task is `reportsthatmatter-agk`, the P0 OCR-suspect review,
starting with Challenger's remaining appendix-prose suspects before deciding
whether its code-heavy appendix region admits a safe bulk classification.

## Verification

- Issue #77 is closed with a migration comment.
- Active onboarding docs contain no instruction to use #77 as a task map.
- `AGENTS.md` documents `bd ready`, `needs-user`, and explicit blocking
  dependencies.
- Historical material remains unchanged.
- `./scripts/verify.sh` exits successfully.
