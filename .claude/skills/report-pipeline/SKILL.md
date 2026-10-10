---
name: report-pipeline
description: Use when supervising reports through the preparation pipeline on Reports that Matter — choosing which report or volume to work on next, opening stage Beads, assigning an agent to a stage, checking a stage's exit gate, or updating reports/pipeline.yaml. Also use to find which stage skill applies to a report task.
---

# Supervising the report pipeline

**Level:** `level:judgement` (the supervisor). Rules for every agent: [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) (R1-R16).

The design is **`docs/design/2026-10-03-report-preparation-pipeline.md`**. Read §2 (stages, gates, models, owners) and §5 (the supervisor's procedure) before assigning anything.

| # | Stage | Skill | Label | Model |
| --- | --- | --- | --- | --- |
| 1 | Source | `report-source` | `stage-source` | Opus (Sonnet when the stack is settled) |
| 2 | Repo | `report-repo` | `stage-repo` | Sonnet |
| 3 | First ingest | `report-first-ingest` | `stage-ingest` | Sonnet (Opus: new adapter format) |
| 4 | Evaluate and refine | `report-evaluate` | `stage-evaluate` | Sonnet (Opus: new defect class) |
| 5 | Editorial | `report-editorial` | `stage-intro`, `stage-imagery` | Opus (introduction); Sonnet (plate, cards) |
| 6 | Publish | `report-publish` | `stage-publish` | Sonnet, integrator only |
| 7 | Announce | `report-announce` | `stage-announce` | Sonnet |
| 8 | Promote | `report-promote` | `stage-promote` | Sonnet |

## Loop

1. Run `pnpm pipeline status` (add `--network` for the served-hash gate, `--verbose` for every gate item): the table gives each unit's recorded and derived stage and its next action. `--check` exits 1 on drift; drift rows already on main are backlog for you, not a reason to stop. New candidates: `bd list --status open --label candidate`; units already held: `bd list --status in_progress --label pipeline` and the candidates `in_progress` (claim yours by setting its stage bead `bd update <id> --status in_progress` when you spawn the agent). Hooks are in each candidate's description ("Hook:"). Pick the unit (report id + scope) by, in order: not blocked (no open `needs-user`/`decision` dependency; `bd show` it), a hook date it can still meet, then the candidate's score. Candidates about affected communities: check the open decisions (`bd list --status open --type decision`) before choosing. A new report id follows the existing pattern `<country>-<body or common name>` (`uk-grenfell-tower-inquiry`, `us-jan6-committee`); stage 2 confirms it.
2. `bd create "Stage <n> <name>: <report id> <scope>" --labels pipeline,stage-<name>,stream:reports,level:<the stage's level> --no-inherit-labels --parent <unit bead> -d "<entry evidence: the previous stage's PR or notes>"` (the unit bead is the report's candidate or ingest bead; without `--no-inherit-labels` it copies `candidate`/`handoff` from the parent).
3. Spawn one agent per unit per stage, on the stage's model, with its own site worktree and `docs/agent-protocol.md` (plus the session's dated note, if any). Prompt: "Use the `report-<stage>` skill for <unit>; Bead <id>; you own report repo <repo> (or none); work in site worktree `rtm-<slug>-<MMDD>`; follow `docs/agent-protocol.md`; do not close beads; end with the retro." Stage 6 goes to the integrator only.
4. On its final report, check the PR against the skill's **Exit gate**, line by line; re-run the cheap commands. Unmet gate: reply to the agent.
5. The stage agent's PR sets the unit's row in `reports/pipeline.yaml` (stage 1, which has no other PR, adds the row with `reached: source` in a small site PR); check it (`reached`, `state`, `evidence`), then `pnpm pipeline status --check` must agree; a known gap is a `waive:` entry naming its Bead, not a lower `reached`. Close Beads only when live.
6. Copy retro lessons into `docs/design/lessons/` (one file each, `pnpm lessons new`); handle uncaught defect classes per agent protocol R8; if a lesson is a missing gate, edit that stage's SKILL.md.
7. Stage 4 hit a new defect class after one fix attempt: `state: parked`, Bead labelled `research`, hold its PRs, move on.

Rules: stages 1-5 run in parallel across units; one owning agent per report repo at a time; stage 6 is serial. Two units of one report use separate branches; the supervisor orders their merges.
