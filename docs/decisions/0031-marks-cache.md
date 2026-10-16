# 0031. Do readers see mark counts from a short-lived cache, or exact counts from a table?

- **Status:** decided (accepted: the recommended default) 2026-10-16
- **Date raised:** 2026-10-03 · **Date decided:** 2026-10-16
- **Decided by:** Rufus, 2026-10-16: recommended default accepted
- **Beads:** reportsthatmatter-6kky (this decision), PR #294

## Question

Do readers see mark counts from a short-lived cache, or exact counts from a table?

## Context

`markCounts()` read every mark row of a report per view. PR #294 puts an edge cache in front (TTL scaled to rows read, 2-30 min, evicted by the author's own mark). Measured: 2,000 marks and 2,500 views/day go from 11.25M to 275k rows/day.

## Options

The recommended default was proposed in the bead and in `factory/handoffs/next-session-prompt-2026-10-10.md` ("Questions for Rufus"); no other option was adopted.

## Decision

Rufus, 2026-10-16: recommended default accepted. Accept the cache for launch: other readers see new marks 2 to 30 minutes late, which protects D1 reads at launch traffic. A counts table is a follow-up only if reads matter after launch (the highlights feed's `feed_passages` could serve it).

## Consequences

Nothing further to build now.

## Links

- `factory/protocols/agent-protocol-2026-10-16.md`, "Update (evening, 2026-10-16): launch decided"
