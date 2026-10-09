---
name: burn-down
description: Use when asked to burn down, triage or verify-and-close the old open beads for one report (or one area) on Reports that Matter — reproducing each bead's defect on current main, closing the ones already fixed or obsolete with the evidence as the reason, and leaving the rest handoff-ready with today's numbers. The one case where a non-integrator agent closes beads.
---

# Burn-down: verify and close a report's old beads

**Level:** `level:specced` (Sonnet). **Rules:** [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) R8 allows closing here, and only with evidence. What a fixed text bug needs: AGENTS.md "House rules" ("A text bug closes on a failing check", "A bug bead closes with a golden page"). Commands that show a report's text: `pnpm paragraphs`, `pnpm quality`, `pnpm ingest verify`.

**Entry.** A report id (or area) and a site worktree from `origin/main` after `pnpm bootstrap` (`fix-agent` skill step 2). You change no code in a burn-down; a bead that needs code stays open.

## Procedure

1. **List.** `bd list --status open,in_progress --title-contains "<report name>" --limit 0` and `bd search "<report id>" --status open`; also `bd list --status open --desc-contains "<report id>"`. Skip epics and beads `in_progress` with a recent owner note.
2. **For each bead**, `bd show <id>` and find its example: a paragraph id, a page, a quoted phrase, a signal name, a count.
3. **Reproduce on current main**, cheapest first, and keep the exact output line:
   - Words or a paragraph: `pnpm paragraphs <report-id> <words from the bead>` (prints section, printed page, id, text).
   - A signal or count: `pnpm quality report <report-id>`; `pnpm quality check` excerpts.
   - Oracle or golden: `pnpm ingest verify <report-id> --findings` (needs `RTM_REPORT_DIRS` only for report repos you own; reading the shared checkout is fine).
   - Page anchors: `pnpm ingest anchors <report-id>`.
   - Rendered: `pnpm dev`, then `/reports/<report-id>/full?p=<id>`; production read-only: `curl -s https://reportsthatmatter.org/reports/<report-id>/full?p=<id>`.
4. **Classify** each bead, one of:
   - **Fixed**: the example now reads right. Close with the command and the line it printed, and the release or PR that fixed it if known.
   - **Obsolete**: the thing it describes no longer exists (removed feature, superseded plan, a duplicate). Close naming what superseded it (`bd close <id> --reason "Duplicate of <id>"`).
   - **Still open**: append today's evidence and make it handoff-ready (`bead-writing` skill: Goal/Where/Acceptance/Verify/Out of scope, `stream:*`, `level:*`, `handoff`).
   - **Unsure**: leave open, append what you checked and why it is not conclusive.
5. **Close**: `bd close <id> --reason "Verified fixed on main <sha>: \`<command>\` -> <line>. Fixed by <PR/release>."`. A fixed text bug whose class no check catches: also append a one-line example to `reportsthatmatter-b78.1` (R8).
6. `bd dolt push`. Final report: a table (bead, title, verdict, evidence), counts per verdict, and the retro (R13).

## Exit gate

- [ ] Every open bead for the report has a verdict and a note or close reason with a command and its output
- [ ] No bead closed on a reading alone ("looks fixed"): each close cites a command line or a URL
- [ ] Still-open beads are handoff-ready with `stream:*` and `level:*`
- [ ] `bd dolt push` done; no code changed

## Failure modes

- **`pnpm paragraphs` finds nothing**: the words were rewritten by a fix or never ingested; try fewer words, then the page (`pnpm ingest page <id> <vol> <pdfPage>`), before calling it fixed.
- **The example is a page number**: the bead may use PDF pages; the site uses printed pages (`pnpm ingest folios <id> --pages N-N` gives the offset).
- **Dry run requested**: do steps 1-4, report the verdicts as "would close", and run no `bd close` or `bd update`.
- **Database busy** (`bd` hangs while other agents write): wait and retry; never delete a lock file.
