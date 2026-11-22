---
title: "Report backlog and status: implementation plan"
created: 2026-11-22
status: draft
parent: "[[2601-report-backlog-and-status]]"
---

Plan for [the SCQ](../2601-report-backlog-and-status.md), drawing on [the Fable critique](critique-fable-2026-11-22.md). It is written for one agent working in one session, on a branch of the site repo. Live state on 2026-11-22: 36 rows in `reports/pipeline.yaml`; `pnpm pipeline status --check` reports 17 problems; 10 candidate beads are open or deferred under the epic `gqsy`; about 33 of the 51 open GitHub issues are report suggestions.

## 1. Decisions

| Question | Answer | Reason |
| --- | --- | --- |
| Report or unit? | A row is a report id plus a scope (a set of volumes), and nothing finer. Report-level status is worked out from its rows: live if any unit has reached publish, announced if any has reached announce. Stern's five "Full report, batch N" rows become one row, "Full report", with every PR kept in its evidence. | The check and as31 already work this way. Rows per batch turn the record into a shipping log. |
| States | Keep the nine `reached` values and the four `state` values as they are. The board shows them in Rufus's words: candidate → **backlog**, source → sourced, repo → repo ready, ingest → markdown done, evaluate → checked, editorial → introduction done, publish → **live**, announce → **announced**. | Renaming would break the code, eight skills and the tests for no gain. |
| Inbox | The inbox is open GitHub issues labelled `report-idea`, never YAML rows. | Capturing an idea then needs no commit, and stray ideas don't clutter the record. |
| Promote | Promote is not a status a unit reaches before it is announced. The board shows "posts queued: N" from `marketing/queue.yaml`. Duelfer Volume I and Covid Volume I go back to `reached: publish`. | Promotion is a fact the queue already holds. Two of the 17 problems are this mistake. |
| Waiting for the launch | Keep the existing `state: waiting` with the note "Announce: launch y2t.6". The board's Live section has a "waiting" column. | No new field is needed. |
| Where the record lives | `reports/pipeline.yaml`, with candidates as `reached: candidate` rows (sketch C). | Three such rows already exist and the check is quiet on them. A second file would duplicate the identity fields. |
| Quick capture | A "Report idea" issue form with only the title required, labelled `report-idea`. It works from the GitHub app on a phone, the web and the `gh` CLI, and readers can use it too. | It is one step from anywhere, and it is the only intake the public can use. |
| Triage test | The five scores already used on the epic `gqsy` (interest, source, size, licence, hook), each 1 to 5, out of 25. An unchecked score is `null`. The good-reports brief is not the test. | These scores are in use already. The brief was a one-off pick of a flagship report. |
| What comes next | The board orders the backlog by unblocked first, then hook date, then score total. Unscored rows go last. There is no hand-kept rank. | This is the order the report-pipeline skill already uses. Ranks kept in titles drift. |
| What Beads are for | The work on a unit: stage beads, and the unit's bead once it is picked. Never the backlog or a status. A row's `bead:` names a work bead, open or closed, as history. | Owner rule. |
| How it stays true | The owning agent updates its row in the gate PR, as now. Legacy gaps are waived with an owning bead, and then `--check` becomes a failure in `verify.sh`. | A check that always shouts gets ignored. Nothing new to run. |
| View | `pnpm pipeline status --board`, in the terminal. as31 renders the same data later. | One source of data, and no Markdown page to drift. |

## 2. Changes

Do these in order on branch `backlog-status-1122`. Steps marked **[yes]** are outward-facing; leave them until Rufus says yes.

1. **Schema.** In `scripts/lib/pipeline-status.ts`, add four optional keys to the `Unit` type. `title` is required on a candidate row whose id is not in the registry. `score` is `{interest, source, size, licence, hook}`, each a whole number from 1 to 5 or `null`. `issue` is a GitHub issue number. `hook` is a short string that starts with an ISO date when there is one. Validate them in `readRecord`: a bad value is a problem, as a bad `reached` is now. Document the keys in the header comment of `pipeline.yaml`. Accept: `readRecord` tests for one valid and three invalid cases.
2. **Board view.** Add `STAGE_LABEL` and a pure `formatBoard(result, { inbox? })` to `pipeline-status.ts`, and a `--board` flag (with `--json`) to `scripts/pipeline.mjs`. The board has four sections:
   - **Inbox:** the count and titles of open `report-idea` issues, fetched with `gh issue list --label report-idea --json number,title` only under `--network`, through an injected probe like the `publish` one. Otherwise it prints the command to run.
   - **Backlog:** candidate rows, with score total, hook, issue number and state, in the order set above.
   - **In preparation:** the stage in Rufus's words, the state and the next action.
   - **Live:** one line per report, with the number of units, live or announced, posts queued and whether it is waiting.

   Accept: new cases in `tests/pipeline-status.test.ts` for backlog order (hook, score, unscored last), the label map, a two-unit report counted once under Live, posts-queued counts, and the inbox probe both present and absent. `pnpm vitest run tests/pipeline-status.test.ts` passes.
3. **Legacy policy (17 problems down to 0).** Edit only `pipeline.yaml`. Create one bead, "Legacy gate gaps on reports shipped before the gate", for the ten `repo.reference-manifest` gaps (Jack Smith, PSI, Challenger, Litvinenko, Leveson, Deepwater, Lehman, Jan 6, Mueller, CIA) and the two `evaluate.adjudicated` gaps (Jan 6 and CIA, both sourced from HTML). Waive each of these gaps against that bead. Then:
   - waive the CIA report's `evaluate.registered` against the same bead;
   - waive Post Office's `evaluate.registered` against `gqsy.2`, which owns the ingest release it is waiting on;
   - move Duelfer Volume I and Covid Volume I to `reached: publish`;
   - remove Hillsborough's stale waiver.

   In `scripts/verify.sh` (lines 148-157), make a failed `pnpm pipeline status --check` a failure rather than a warning. Accept: `pnpm -s pipeline status --check` exits 0.
4. **Migrate the candidate beads into rows.** Add `reached: candidate` rows, each with `title`, `score` (copied from the bead text, `null` where it was not checked), `hook` and `issue`:
   - Infected Blood (`gqsy.7`, issue #91)
   - IICSA (`gqsy.8`)
   - Mid Staffordshire (`gqsy.10`, #89)
   - Stephen Lawrence (`gqsy.11`, #88)
   - Hurricane Katrina (`gqsy.12`, #86)
   - South Africa TRC (`gqsy.1`, `state: parked`)
   - US Commission on Civil Rights voting report (`gqsy.17`, `state: parked`)
   - Grenfell Phase 1 (from `gqsy.4.2`)

   Score the three further-volume rows that already exist (Lehman `94u`, Chilcot `0a7`, Saville `wdt`) where their beads support it. Merge the Stern batch rows. Close each migrated bead with the reason "Moved to reports/pipeline.yaml as <id>; the backlog lives there, not in Beads". Close `gqsy.4` too: Phase 2 is live, and the hero work stays open in `gqsy.4.1`. Leave `gqsy.2` open as Post Office's work bead. Add the same pointer to the description of the epic `gqsy`, and close the epic once its open children (`gqsy.2`, `gqsy.4.1`) are closed. Accept: the board lists 11 backlog rows, and `bd list --label candidate --status open` returns only `gqsy.2`, which loses that label in step 6.
5. **GitHub intake.** Add `.github/ISSUE_TEMPLATE/report-idea.yml` with:
   - the title (required);
   - a link (optional);
   - why it matters (optional);
   - `labels: ["report-idea"]`.

   Then run `gh label create report-idea`, and add the label to the suggestions not yet triaged: #19, 20, 21, 22, 23, 25, 26, 27, 35, 38, 58, 59, 60, 61, 62, 63, 64, 65 and 84. Adding a label notifies no one and is easy to undo. Accept: `gh issue list --label report-idea` lists 19 issues, and the board's Inbox under `--network` shows the same 19.
6. **Label cleanup.** Remove `candidate` and `candidates` from every bead that carries them, and `stage-text` from its nine closed beads: `bd label remove <ids…> <label>`. Accept: `bd list --label <each> --all` returns nothing.
7. **Docs.**
   - `docs/report-pipeline.md`: rewrite it as the short entry point: the eight stages, the record, idea → candidate row → units, the board, and what Beads are for. Remove the three-stage table and `stage-text`.
   - `docs/report-preparation.md`: rewrite the candidate paragraph in §1 to point at the board and the five scores; in the table at line 99, change "report candidates" to "report ideas (`report-idea`)".
   - `AGENTS.md`: lines 20 and 73 get the same correction; re-point the `PROGRESS.md` citation at line 626.
   - The `report-pipeline` skill: step 1 reads the board instead of `bd list --label candidate`. Add a short "Triage the inbox" step: score the idea, add a row with `issue:`, then close or comment on the issue. Comments and closes are [yes] until Rufus approves the routine. In step 2, a unit bead is created when a candidate row is picked, and the `candidate` label is no longer mentioned.
   - Design §6 (and lines 11-13): add the new keys, the intake, the board, the check as an error, and promote as derived.
   - `report-introduction` skill line 18 and `docs/report-introductions.md`: change "stage 2 of report-pipeline.md" to "the editorial stage".
   - `docs/v2-features.yaml` `more-reports`: replace the sentence "curated as GitHub issues" with a pointer to the board.
   - Delete `docs/INBOX.md` (a stale Markdown task list; nothing links to it).
   - Delete `docs/PROGRESS.md`. Re-point its three citations (AGENTS.md, `scripts/e2e.mjs:107` and `docs/design/2026-09-27-hero/README.md:59`) to a GitHub permalink at the commit before the delete.

   Accept: `grep -rn "label candidate\|stage-text\|INBOX.md\|docs/PROGRESS.md" AGENTS.md docs .claude scripts` finds nothing outside dated history.
8. **[yes] Close stale public issues**, each with a one-line comment:
   - the seven live reports (#24, 34, 39, 66, 67, 68, 92): the comment links the report page;
   - the four now in the backlog (#86, 88, 89, 91): "Tracked as a candidate in reports/pipeline.yaml";
   - #57 FCIC: not taken, because its PDF drops digits (#102 stays open);
   - #93: superseded by the backlog.
9. **Close out.** `pnpm verify`, then a changelog entry, a PR, `bd dolt push`, and a push.

## 3. Done-check

- `pnpm -s pipeline status --check; echo $?` prints `0`.
- `pnpm -s pipeline status --board --network` shows the Inbox (19), the Backlog (11, in order), In preparation, and Live (24 reports).
- `pnpm vitest run tests/pipeline-status.test.ts` and `pnpm verify` pass, with the pipeline step now a failure when there is drift.
- `bd list --label candidate --all`, `bd list --label candidates --all` and `bd list --label stage-text --all` all return nothing.
- `test ! -e docs/INBOX.md && test ! -e docs/PROGRESS.md` succeeds, and the grep in step 7 is clean.
- After the yes: `gh issue list --state open --search "Duelfer OR Lehman OR Litvinenko OR Chilcot OR Saville OR Challenger OR Grenfell in:title"` returns nothing.

## 4. Risks and asks for Rufus

1. **Yes to closing 13 public issues (step 8).** I recommend yes: seven are for reports that are already live, and every one gets a comment with a link. Backup: comment and label them, and leave them open.
2. **A hard error in `verify.sh`.** From now on, drift on main fails every agent's verify until the owner fixes the row. I recommend accepting this; the waivers keep today's check at 0. Backup: fail only in `pnpm ship`.
3. **Triage closes the idea issue.** Readers lose an open issue to follow, but the inbox stays a true list of what has not been triaged. I recommend closing with a link to the row. Backup: keep the issue open until the report is live.
