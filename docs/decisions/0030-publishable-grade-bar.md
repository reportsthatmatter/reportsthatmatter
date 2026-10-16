# 0030. What is the publishable quality bar, and are grades shown on the site?

- **Status:** decided (accepted: the recommended default) 2026-10-16
- **Date raised:** 2026-10-03 · **Date decided:** 2026-10-16
- **Decided by:** Rufus, 2026-10-16: recommended default accepted
- **Beads:** reportsthatmatter-38s.17 (this decision)

## Question

What is the publishable quality bar, and are grades shown on the site?

## Context

Quality-bar bead 38s.16 defines one per-report grade; today roughly 5 of 13 reports would meet B.

## Options

The recommended default was proposed in the bead and in `factory/handoffs/next-session-prompt-2026-10-10.md` ("Questions for Rufus"); no other option was adopted.

## Decision

Rufus, 2026-10-16: recommended default accepted. Thresholds: errors a reader meets per 10 pages, A <= 1, B <= 3, C <= 10, D <= 30, F above; no dimension below C. B or better is the publishable bar. Grades are not shown on the site yet: they stay in the repo (`pnpm grade`), not on /reports/<id>/processing.

## Consequences

Copy the thresholds into the quality-bar section of docs/scoring.md (bead filed). 38s.19 computes grades but does not publish them.

## Links

- `factory/protocols/agent-protocol-2026-10-16.md`, "Update (evening, 2026-10-16): launch decided"
