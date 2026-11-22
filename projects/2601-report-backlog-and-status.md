---
title: Report backlog and status
description: One record and one view of every report, from proposed to announced, and a good backlog of reports to add next.
created: 2026-11-22
status: in-progress
phase: shipping
parent: "[[reports-that-matter]]"
github: https://github.com/reportsthatmatter/reportsthatmatter
workspace: ~/src/reportsthatmatter/reportsthatmatter
---

Rufus asked (2026-11-21) whether Reports that Matter has a systematic backlog of reports to add, and how a report's status is tracked from inbox to announced. An audit found the parts exist but are split and disagree. This project settles how the backlog and status are recorded and viewed, then builds a good backlog.

## SCQ

Status: signed off 2026-11-22 by Rufus ("overall scq is good"), with the quick-capture question added; drafted by the agent from the 2026-11-21 audit
Source: conversation in the `rtm-pipeline` session (2026-11-21 to 22); audit detail in the Appendix

### Situation

**Reports go through an eight-stage pipeline, defined and machine-checked from sourcing onwards; candidate reports are kept in Beads and GitHub issues.**

- 24 reports are live on the site, several in more than one unit (a further volume is its own unit): 36 units in all.
- Each unit goes through eight stages, one skill each: source, repo, first ingest, evaluate, editorial, publish, announce, promote ([design, 2026-10-03](../docs/design/2026-10-03-report-preparation-pipeline.md)). Agents do the stages; one integrator publishes.
- `reports/pipeline.yaml` records the last stage each unit reached, and `pnpm pipeline status --check` checks the record against the files in the site and report repos.
- Candidate reports sit in two places: about 25 Beads under the "More reports (2026-Q4)" epic, 12 of them open or deferred, scored in their description text; and about 35 of the 51 open GitHub issues, from 2018 on, unlabelled.
- Beads is the repo's task queue ([AGENTS.md](../AGENTS.md)).

### Complication

**Nobody can see in one place where each report stands, from idea to announced, or what should come next; and the backlog that should feed the pipeline is thin, scattered and partly stale.**

- Answering "where are we?" took an audit across five docs, two trackers, a YAML file and a check script (2026-11-21).
- The backlog is split and stale: GitHub still has open candidate issues for seven live reports (Duelfer, Lehman, Litvinenko, Chilcot, Saville, Challenger, Grenfell); the Beads candidates carry two labels (`candidate` on 25 beads, `candidates` on 26), both leaked onto child beads such as hero images, so a label query returns non-candidates; scores and ranks live in prose and titles.
- There is no line between a raw suggestion and a vetted, prioritised candidate: everything is "candidate".
- Status is half in Beads and half in the YAML: per-stage beads were used for only 2 of 24 reports (Southport, Thirlwall), an old `stage-text` label survives from the three-stage model, and the candidate beads double as the backlog.
- The records disagree, and nothing catches it: Grenfell's candidate bead is open though both its units are published; Post Office is recorded at editorial while the registry does not mark it ingested; the pipeline check fails with 17 problems and has been left failing.
- The docs contradict each other: `docs/report-pipeline.md` describes the superseded three-stage model, `docs/report-preparation.md` says candidates live in GitHub issues, and `docs/INBOX.md` and `docs/PROGRESS.md` are stale (January and 5 September 2026).
- Why it hasn't been fixed (guess): the pipeline was built from the ingest end, stage by stage; choosing reports was treated as an input to it, and nobody owned the front end or the overview.

### Question

How should Reports that Matter record each report's status as one sequence of states, from first suggestion (the backlog) to announced, so that Rufus and the agents can see where everything stands and what to take next?

Criteria:

- For: Rufus (the overview), the supervising agent (choosing the next unit), and later readers through a public progress page (bead `as31`).
- By when: the model agreed and in place by 2026-11-29 (guess), so the backlog research can start on it.
- Effort: a day or two of agent work (guess); reuse `reports/pipeline.yaml` and `pnpm pipeline status` where they fit.
- Off the table: Beads as the store for the backlog or report status (Rufus, 2026-11-22: Beads are for tasks, not for tracking overall report processing); a separate project-management repo (Rufus, 2026-11-22: projects live in this repo's `projects/`); redesigning the eight stages or their gates; fixing the 17 current drift problems inside this project (they get their own beads).

Issue tree:

- What is the thing being tracked: a report or a unit (a volume)? — open
  - How do a report-level candidate and its unit-level progress relate, and when is a report with several volumes "published"? — open
- What are the states, and what does each mean? — proposed: inbox, triaged, processing (sub-states: sourced, repo ready, markdown done, checked, introduction done), published, announced (Rufus, 2026-11-21)
  - Is "promote" (in the posting queue) a state after announced, or a separate activity? — open
  - How is "waiting for the launch" shown? — open
- Where does the record live, given it is not Beads? — open
  - In `reports/pipeline.yaml`, in a separate backlog file, or elsewhere? — open
- How do suggestions come in (GitHub issues, Rufus, agents' research, readers), and where do they land? — open
  - How does Rufus log a new report idea in one quick step, from wherever he is, and where does an agent then pick it up to investigate it? — open (Rufus, 2026-11-22)
- What makes a candidate triaged? — open
  - Is the existing score (interest, source, size, licence, hook, out of 25) and the [good-reports brief](../docs/plans/brief-2026-01-13-good-reports.md) the right test? — open
- What happens to what exists now: the GitHub issues, the candidate beads, the two labels, the stage beads? — open
- What view or views are needed, and where are they read: terminal, a generated page in the repo, or the site? — open
- How does it stay true: who updates which record, and what check catches disagreement? — open
  - What are Beads for in this flow? — proposed: the work on a unit (stage tasks), not its status (Rufus, 2026-11-22)

## Ideas offered (parked)

- Three sketches from the first playback (2026-11-21): A, Beads for the backlog and `pipeline.yaml` for progress; B, Beads only; C, `pipeline.yaml` only with candidates as rows at inbox or triaged. A is ruled out by the criterion on Beads.
- A board view as a flag on the existing command (`pnpm pipeline status --board`) rather than a new command (review agent, 2026-11-21).
- Research which other reports to add, to build a good backlog (Rufus, 2026-11-22): the follow-on once the record is in place.

## Next

No LTP run (Rufus, 2026-11-22: a Fable critique of the SCQ, then a plan, then implement). Critique: [critique-fable-2026-11-22.md](2601-report-backlog-and-status/critique-fable-2026-11-22.md). Plan: [plan.md](2601-report-backlog-and-status/plan.md) (written by Opus; the Fable planner hit its usage limit).

Built 2026-11-22 (branch `pipeline-1121`): candidate rows with `title`, `score`, `hook`, `issue` in `reports/pipeline.yaml`; `pnpm pipeline status --board`; report ideas as `report-idea` beads (the 19 GitHub idea issues moved into beads and closed; Rufus, 2026-11-22: no GitHub issues for this); the 17 check problems cleared (legacy gaps waived against `reportsthatmatter-i6i2`); 8 candidate beads migrated and closed; the `candidate`, `candidates` and `stage-text` labels removed; the docs rewritten. How it works now: [`docs/report-pipeline.md`](../docs/report-pipeline.md).

Rufus said yes (2026-11-22) to closing the 13 stale issues (done), to the check failing `verify.sh` (done) and to triage closing the idea (now the idea bead).

Follow-on (Rufus, 2026-11-22: "what I really want ... is get a good backlog of reports"): few vetted candidates are waiting (11 backlog rows, 5 fully scored), so research which reports to add and fill the backlog. That gets its own brief.

## Appendix: audit, 2026-11-21

- `reports/pipeline.yaml`: 36 rows across 24 report ids; 23 rows carry a `bead:`. Further volumes point at beads that are not candidates (for example `d0h`, `94u`). Three rows sit at `reached: candidate` (further volumes of Lehman, Chilcot, Saville).
- `pnpm pipeline status --check`: 17 problems. Ten older reports lack `reference/manifest.json`, a gate added after they shipped; Duelfer Volume I and Covid Module 2 Volume I claim promote with no announcement; Post Office and the CIA report lack `ingested: true`; Jan 6 and the CIA report lack `reference/adjudicated.yaml`; one stale waiver (Hillsborough).
- Registry, manifest and pipeline record list the same 24 ids; all 24 report repos are checked out and clean.
- Stage labels in Beads (all time / open): stage-text 9/0, stage-source 0, stage-repo 2/0, stage-ingest 2/0, stage-evaluate 3/1, stage-intro 16/0, stage-imagery 22/3, stage-publish 1/0, stage-announce 0, stage-promote 0.
- Open candidate beads: Post Office Horizon (Vol 1, in progress), Grenfell (published), Infected Blood, IICSA, Mid Staffordshire (Francis), Stephen Lawrence (Macpherson), Hurricane Katrina; deferred: South Africa TRC, US Civil Rights Commission voting report.
- GitHub candidate issues not yet in Beads include Iran-Contra, Enron, Hutton, Al-Sweady, FCIC (ruled out: its PDF drops digits), Gaza 2014 Commission, Rettig Commission, Senate money-laundering and dividend-tax investigations, Healthcare.gov, PG&E Paradise fire, John Smyth review.
