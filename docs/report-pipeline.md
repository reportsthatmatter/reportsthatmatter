# How a report ships: backlog, stages and status

Every report on Reports that Matter goes from an idea to a live, announced page through eight stages, and each stage ships on its own. This page says where each report stands is recorded, how a new idea gets in, and which guide covers each stage. Read it before starting work on any report.

**Status: rewritten 2026-11-22** for project 2601 ([`projects/2601-report-backlog-and-status.md`](../projects/2601-report-backlog-and-status.md)); it replaces the three-stage version of 2026-09-26. The stage design, gates and models: [`design/2026-10-03-report-preparation-pipeline.md`](design/2026-10-03-report-preparation-pipeline.md). Supervisors start with the `report-pipeline` skill.

## Where everything stands: one command

```sh
pnpm pipeline status --board            # Inbox, Backlog, In preparation, Live
pnpm pipeline status [--check]          # each unit's recorded stage against its artefacts
```

| Status | Where it is recorded |
| --- | --- |
| **Inbox**: an idea, not yet looked at | An open bead labelled `report-idea` (a triage task) |
| **Backlog**: triaged, scored, waiting | A row in [`reports/pipeline.yaml`](../reports/pipeline.yaml) at `reached: candidate`, with `title`, `score`, `hook`, `issue` |
| **In preparation** | The same row, `reached:` source (sourced), repo (repo ready), ingest (markdown done), evaluate (checked) or editorial (introduction done) |
| **Live** | `reached: publish` |
| **Announced** | `reached: announce`; most live reports are `state: waiting` for the launch (`y2t.6`) |

Posts queued for a report are read from `marketing/queue.yaml`; they are shown on the board, not recorded as a stage. A row is a report id plus a scope (a set of volumes); a further volume of a live report is its own row. A row is never one per PR or batch.

## A new idea: one step

From a terminal in the site repo: `bd q "Report idea: <report name>" -l report-idea` (add `-d "<link, why now>"` if you have it). From anywhere else, including a phone: tell any Claude session on the repo "log a report idea: <name>", and it runs that command. Only the name is needed. Report ideas are not GitHub issues (Rufus, 2026-11-22); the 19 older idea issues were moved into beads and closed.

## Triage: idea to backlog

An agent (the `report-pipeline` skill) takes an idea bead, checks the official source, licence and size, and scores it 1 to 5 on each of interest, source, size, licence and hook (out of 25; `null` where unchecked). Licence is recorded but is never on its own a reason to park or reject an idea (Rufus, 2026-11-22). If it is worth doing, it adds a `reached: candidate` row (`issue:` only for an idea that came from a GitHub issue); either way it closes the idea bead with a pointer to the row or the reason. The board orders the backlog: unblocked first, then fully scored, then the nearest hook date, then the score total.

## The eight stages

| # | Stage | Skill | Board label |
| --- | --- | --- | --- |
| 1 | Source | `report-source` | sourced |
| 2 | Repo | `report-repo` | repo ready |
| 3 | First ingest | `report-first-ingest` | markdown done |
| 4 | Evaluate and refine | `report-evaluate` ([`report-preparation.md`](report-preparation.md)) | checked |
| 5 | Editorial: introduction, highlights, plate, hero | `report-editorial`, `report-introduction` ([`report-introductions.md`](report-introductions.md), [`hero-images.md`](hero-images.md)) | introduction done |
| 6 | Publish (integrator only) | `report-publish` | live |
| 7 | Announce | `report-announce` | announced |
| 8 | Promote | `report-promote` | (posts queued) |

## Rules

- **Each stage is a complete release.** The text alone is a good page. The introduction ships when it is written, the hero image when it is found. A report can sit at "live" for months.
- **Ship without waiting for review.** An introduction ships `status: approved`; Rufus reads the live page and gives feedback later.
- **Stages run in order per unit, not across units.** Different units can be at different stages at once, each with its own agent.
- **Order by impact.** Take the unit whose next stage matters most now (a news hook, an anniversary, a launch post).
- **The owning agent updates its row** in the PR that meets the stage's gate; `pnpm pipeline status --check` checks the row against the artefacts, and drift fails `verify.sh`. A known gap is a `waive:` entry naming the bead that owns it.

## What Beads are for

Beads hold the *work*: an idea waiting for triage (`report-idea`), and on a unit one bead per stage task (labels `stage-source` … `stage-promote`, `stage-imagery` for the hero), with the unit's bead in its row's `bead:`. Beads never hold the backlog or a report's status. Close a stage bead when its work is live, not when it is merged.
