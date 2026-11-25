---
title: Report backlog research
description: A good backlog of 10-15 scored candidate reports and an inbox of about 50 ideas, without building any.
created: 2026-11-22
status: done
phase: sharing
completed: 2026-11-22
parent: "[[reports-that-matter]]"
github: https://github.com/reportsthatmatter/reportsthatmatter
workspace: ~/src/reportsthatmatter/reportsthatmatter
follows: "[[2601-report-backlog-and-status]]"
---

Rufus (2026-11-22): "get a good backlog of at least 10-15 good options with perhaps an inbox of 50"; don't build them. Follows [2601](2601-report-backlog-and-status.md), which set up the record (`reports/pipeline.yaml`), the inbox (beads labelled `report-idea`) and the view (`pnpm pipeline status --board`).

## Goal and done-check

- **Backlog:** at least 10-15 active candidate rows in `reports/pipeline.yaml`, each fully scored (interest, source, size, licence, hook; 1-5 each) from a checked official source, with a named first unit and a hook where there is one.
- **Inbox:** about 50 open `report-idea` beads, each with a link and a line on why, so later triage has material.
- **Triage:** the 19 ideas moved from GitHub issues are each promoted to a row, kept in the inbox, or closed with a reason.
- **Check:** `pnpm pipeline status --check` exits 0 and the board shows the backlog in order.

## Scoring (from the epic gqsy, 2026-10-03)

Each 1-5, 5 best: **interest** (public interest and citation demand); **source** (5 = official HTML or tagged PDF covering everything, 1 = poor scan); **size** (5 = a small first unit); **licence** (5 = public domain or OGL); **hook** (5 = a strong anniversary or news hook in the next six months, here December 2026 to June 2027). `null` where not checked.

## Out of scope

Building any report (no repos, ingests or stage beads); the public progress page (as31).

## Log

- 2026-11-22: research run by four agents in parallel (Opus): triage of the 19 ideas, rescoring of the partly scored rows, and new candidates (38 UK and international, 38 US). Raw results: [2602-report-backlog-research/](2602-report-backlog-research/) (`triage19.json`, `rescore.json`, `new-uk-intl.json`, `new-us.json`).
- 2026-11-22: merged. **Backlog:** 26 candidate rows, 23 active and fully scored, 22 of them at 17/25 or more; 15 new rows (Dobbs, Uvalde, the Potomac midair collision, Manchester Arena, the Fed's SVB review, the DOJ IG Epstein custody report, the Hillsborough Bishop report, Covid Module 1, the Camp Fire report, the ICJ Myanmar genocide judgment, the Casey audit, the Enron Powers report, Hutton, Al-Sweady, the 2014 Gaza commission) and the 11 existing rows rescored (Grenfell Phase 1 now 24, IICSA 21, Francis 17; the civil rights voting report down to 16 and parked; the South African TRC stays parked: its licence needs permission). **Inbox:** 52 open `report-idea` beads (46 new, each with its source, provisional score and hook; 6 of the 19 kept after triage). **Closed:** 5 ideas promoted to rows, 8 rejected with reasons (settlements, hearings, too vague or niche; Rettig: Spanish only, licence). Candidates scoring under 17 were not logged; they stay in the JSON files.
- Decided (agent, reversible): single court opinions count as reports (US v. Philip Morris is already live); hooks whose date has passed no longer sort first.

## Status

Done-check met: 23 active, fully scored backlog rows (target 10-15), 52 inbox ideas (target about 50), the 19 triaged, `pnpm pipeline status --check` exits 0.
- 2026-11-25: systematic sweep of the Senate Permanent Subcommittee on Investigations (PSI), 1995-2026: 105 substantial reports scored in [psi.json](2602-report-backlog-research/psi.json) (sources: archived PSI clerk lists 1999-2014 and 1947-2017, HSGAC activity reports 2017-2024, govinfo committee prints; 2025-26 by web search, patchy). 9 added as backlog rows (`us-psi-*`: Enron board 25, Backpage 23, Medicare Advantage denials, Russia chips, ICE detention of women, four Enron transactions 22, citizen detentions, Butler 21, London Whale 20); the next 11 (all 20/25) logged as inbox ideas; the rest stay in the JSON. The South African TRC unparked: licence is noted, never a reason to park or reject (Rufus, 2026-11-22).
