# 0004. Where do quality budgets start, and how do they move?

- **Status:** decided (accepted plan defaults; Rufus may revisit)
- **Date raised:** 2026-10-02 · **Date decided:** 2026-10-02
- **Decided by:** supervisor, accepting the quality-harness plan §7 defaults under Rufus's "decide and proceed" instruction
- **Beads:** reportsthatmatter-b78, b78.2, b78.3, b78.9

## Decision

Budgets start at each report's counts on the day they are introduced, not zero, so verify is green on day one. They only go down (`pnpm quality ratchet`). Raising one needs a `# why: <bead>` comment. New reports get the corpus median rate. Signals live in the site; the layout oracle lives in ingest. About $5 per release plus about $100 per quarter of model review. Agents verify golden pages and Rufus spot-checks. No second extraction engine for now.

## Links

- docs/design/2026-10-02-quality-harness-plan.md §7
- docs/quality-harness.md
