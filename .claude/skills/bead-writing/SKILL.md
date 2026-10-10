---
name: bead-writing
description: Use when filing or rewriting a bead (task, bug, research, decision, needs-user) on Reports that Matter, including turning a retro's proposals or a review's findings into beads — the handoff-ready standard (Goal, Where, Acceptance, Verify, Out of scope), the stream and level labels, dependencies, and the commands. Any agent, Claude or Codex, should be able to do the bead from the repo, AGENTS.md and the bead alone.
---

# Writing a handoff-ready bead

**Level:** `level:specced`. The standard itself: AGENTS.md "Bead levels and handoff-ready beads"; the stream labels: AGENTS.md "Work streams"; `needs-user` and decisions: AGENTS.md "Beads" and "Decisions and open questions". This skill is the procedure; those sections are the source.

**Entry.** Something to file: a defect you found, a retro proposal, a review finding, a gap in a skill.

## Procedure

1. **Search first**: `bd search "<key words>"` searches titles and ids (closed included); descriptions need `bd list --all --desc-contains "<report id, command or file>"` (and `--notes-contains`). If it exists, `bd update <id> --append-notes "<new evidence>"` instead. If the proposal is already done in the code (read the script; run its `--help`), file nothing and record the lesson as done.
2. **Choose** one type (`-t bug|task|feature|decision|chore`), one stream (`stream:marketing|reports|quality|product|platform`), one level (`level:specced|judgement|design`; none for epics and decisions), and `handoff` when the description meets step 3. Priority `-p 0-4` (2 is normal; 1 blocks launch or loses readers' links).
3. **Write the description** with these headings, each concrete:
   - **Goal:** one or two sentences on what changes for a reader or a maintainer.
   - **Where:** repos, files, commands, report ids, and the example (paragraph id, printed page, the quoted words).
   - **Acceptance:** checkable criteria, each with the command or URL that shows it and the before → after number (e.g. "`pnpm quality check` shows `numbered-paragraph-glued` 3 → 0 for uk-leveson-inquiry"); for behaviour with no count, the command and the line it must print (and a test that covers it).
   - **Verify:** what to run before the PR (`pnpm typecheck`, `pnpm test`, `pnpm ingest check`, `pnpm corpus check`, `./scripts/verify.sh`, as relevant).
   - **Out of scope / risks:** what not to touch; beads it could collide with; reports it could move.
4. **Create** (description from a file avoids shell-quoting trouble):
   ```bash
   bd create "<title: the defect or outcome, with the report id>" -t task -p 2 \
     -l stream:platform,level:specced,handoff --body-file /path/to/desc.md \
     --deps discovered-from:<the bead you were working on>
   ```
   No bead you were working on: leave `--deps` off and name the source (retro, review file, lessons line) in Where.
   Child of an epic: `--parent <epic id>`. Blocked by another: `--deps blocked-by:<id>`. Rehearse with `--dry-run`.
5. **Needs Rufus?** Only if work truly cannot proceed: a separate bead labelled `needs-user` with the exact request, then `bd dep <needs-user-id> --blocks <blocked-id>`. Direction questions: a `docs/decisions/` record plus a `-t decision` bead.
6. `bd dolt push`.

## From a retro or review

- One bead per proposal that is not done in your PR; skip proposals already beaded (step 1).
- The title states the outcome ("`pnpm ship --plan` offers `--reset` when the state is for an older pin"), not the complaint.
- Evidence (what slowed you, the log line) goes in Where; the lesson goes in its own file in `docs/design/lessons/` (`pnpm lessons new`) with the new bead id as its evidence.
- An uncaught defect class: agent protocol R8 (catalogue example plus a `stream:quality` bead for the check).

## Exit gate

- [ ] `bd show <id>` shows Goal, Where, Acceptance (each with a command), Verify, Out of scope
- [ ] Exactly one `stream:*` and one `level:*` label (none for epics/decisions); `handoff` only if the five parts are there
- [ ] `discovered-from` link to the bead it came from (when there is one); `bd dolt push` done
