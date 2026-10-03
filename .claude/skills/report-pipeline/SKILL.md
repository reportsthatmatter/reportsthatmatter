---
name: report-pipeline
description: Use when supervising reports through the preparation pipeline on Reports that Matter — choosing which report or volume to work on next, opening stage Beads, assigning an agent to a stage, checking a stage's exit gate, or updating reports/pipeline.yaml. Also use to find which stage skill applies to a report task.
---

# Supervising the report pipeline

The design is **`docs/design/2026-10-03-report-preparation-pipeline.md`**. Read §2 (stages, gates, models, owners) and §5 (the supervisor's procedure) before assigning anything.

| # | Stage | Skill | Label | Model |
| --- | --- | --- | --- | --- |
| 1 | Source | `report-source` | `stage-source` | Sonnet |
| 2 | Repo | `report-repo` | `stage-repo` | Sonnet |
| 3 | First ingest | `report-first-ingest` | `stage-ingest` | Sonnet (Opus: new adapter format) |
| 4 | Evaluate and refine | `report-evaluate` | `stage-evaluate` | Sonnet (Opus: new defect class) |
| 5 | Editorial | `report-editorial` | `stage-intro`, `stage-imagery` | Sonnet |
| 6 | Publish | `report-publish` | `stage-publish` | Sonnet, integrator only |
| 7 | Announce | `report-announce` | `stage-announce` | Sonnet |
| 8 | Promote | `report-promote` | `stage-promote` | Sonnet |

## Loop

1. Read `reports/pipeline.yaml` and `bd list --label pipeline`. Pick the unit (report id + scope) whose next stage matters most now.
2. `bd create "Stage <n> <name>: <report> <scope>" --labels pipeline,stage-<name> --parent <unit bead>`; put the entry evidence in it.
3. Spawn one agent per unit per stage, on the stage's model, with its own site worktree and the session's protocol file. Prompt: "Use the `report-<stage>` skill for <unit>; Bead <id>; you own report repo <repo>." Stage 6 goes to the integrator only.
4. On its final report, check the PR against the skill's **Exit gate**, line by line; re-run the cheap commands. Unmet gate: reply to the agent.
5. Update the unit's row in `reports/pipeline.yaml` (`reached`, `state`, `evidence`). Close Beads only when live.
6. Copy retro lessons into `docs/design/lessons.md`; append uncaught defect classes to `reportsthatmatter-b78.1`; if a lesson is a missing gate, edit that stage's SKILL.md.
7. Stage 4 hit a new defect class after one fix attempt: `state: parked`, Bead labelled `research`, hold its PRs, move on.

Rules: stages 1-5 run in parallel across units; one owning agent per report repo at a time; stage 6 is serial. Two units of one report use separate branches; the supervisor orders their merges.
