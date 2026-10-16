# 0018. How should the header navigation work on phones?

- **Status:** decided (accepted: the recommended default) 2026-10-16
- **Date raised:** 2026-10-09 · **Date decided:** 2026-10-16
- **Decided by:** Rufus, 2026-10-16: recommended default accepted
- **Beads:** reportsthatmatter-nupj

## Question

The six header links are 16 px high on a phone. Padding them to a 44 px tap target makes the header 290 px tall on a 664 px screen. What should phones get?

## Context

Measured in the 2026-10-09 launch audit with iPhone 13 and Pixel 7 emulation. Readers arriving from a social preview land mid-report and rarely need the nav; the Reports, Search and Highlights links matter most.

## Options

1. A menu button that opens the six links at full tap size.
2. Show three links (Reports, Search, Highlights) on phones, the rest in the footer.
3. Keep the row and accept small targets (fails WCAG 2.5.8 spacing only if targets sit closer than 24 px).

## Decision

Rufus, 2026-10-16: recommended default accepted. Option 2: phones show three header links (Reports, Search, Highlights) at full tap size; the rest move to the footer. The record stated no recommendation, so the clerk took the simplest reversible option (no script) as the agent's recommendation; a menu button (option 1) can replace it later.

Rufus, 2026-10-17: option 2 confirmed. Phones show Reports, Search and Highlights; the rest are in the footer. No change to the implementation (reportsthatmatter-f2qx).

## Consequences

## Links

- docs/research/2026-10-09-launch-audit.md
