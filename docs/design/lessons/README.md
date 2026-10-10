# Lessons: one file per entry

What we learned about getting better faster on this pipeline. Reportsthatmatter-38s.6 started it; every agent adds to it. It is a log, not a design: short entries, each with the evidence (a bead or a doc) and what changed or is proposed. When a lesson becomes a check, a tool or a rule, link it in the entry and move on; do not rewrite history, add an entry.

**How to add one.** At the end of your task, after your final-report retro ("Getting better faster", agent protocol rule 13), add each lesson worth keeping as its own file in this directory, in the same PR as your work: `pnpm lessons new <slug> --theme "<theme>"` creates `docs/design/lessons/<YYYY-MM-DD>-<slug>.md` for you to fill in (`pnpm lessons themes` lists the themes in use; pick one, or name a new theme). Do not append to `docs/design/lessons.md`. A file is the frontmatter and one line, never hard-wrapped:

```
---
theme: Measuring
---
- **<lesson>** (YYYY-MM-DD, <bead or doc>, <who>) <evidence in a sentence>. <What changed, or the proposal>. [status: done in <PR> | proposed | open question]
```

Skip what is only about your report; keep what would have helped the next agent on a different one. `pnpm lessons` prints the entries by theme (newest first) and `pnpm lessons check` validates the files; `tests/lessons.test.ts` runs both checks in `pnpm test`.

**Why one file per entry (reportsthatmatter-r4q2).** One file of ~400 appended lines conflicted in every PR of every batch (the integrator hand-merged it at every release from 2026-10-03 to v0.26.0). The alternative, `.gitattributes` `docs/design/lessons.md merge=union`, only helps where the merge runs git's own driver: a local merge honours it, GitHub's merge button and squash-merge do not run custom merge drivers or read merge attributes as far as GitHub documents (not tested here with a throwaway PR), and every agent's clone would need the driver configured too, so it would fix the integrator's trial merges but not the PRs. Separate files cannot conflict, need no per-clone setup and work in the GitHub UI.

**The archive.** [`../lessons.md`](../lessons.md) holds the 406 entries written before the split, by theme, unchanged and frozen (`tests/lessons.test.ts` fails if it gains or loses an entry). Read it for history and search both: `grep -r "<words>" docs/design/lessons.md docs/design/lessons/`.

**A PR that appended to the old `lessons.md`.** Rebase onto main. The append will either conflict at the end of `lessons.md` or merge silently into the archive (the test then fails with a changed entry count). Either way: restore `lessons.md` from main (`git checkout origin/main -- docs/design/lessons.md`), then put each of your lines in its own file with `pnpm lessons new` (or copy the line under the frontmatter above; the theme is the `##` heading it sat under).
