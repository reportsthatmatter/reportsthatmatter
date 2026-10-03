# 0013. PDF-only mini-references: split each report's page breaks into dev and held-out, or assign whole reports?

- **Status:** proposed
- **Date raised:** 2026-10-03 · **Date decided:** —
- **Decided by:** — (proposed by the 38s.15 agent; applies until Rufus changes it)
- **Beads:** reportsthatmatter-9u69 (decision), reportsthatmatter-38s.15

## Question

The six PDF-only reports (Jack Smith, Deepwater, PSI, Challenger, Lehman, Leveson) now each have about 30 page breaks adjudicated from the page images (`<repo>/reference/adjudicated.yaml`). The development set had only 4 adjudicated page-break errors left at v0.21.0, too few to learn from; these references hold 28. How do they join the dev/held-out discipline (`reports/score-sets.yaml`, 38s.6), so that a pass can be developed on some of them and checked on the rest?

## Context

- The existing split is by report: three development reports (9/11, Saville, Philip Morris), four held-out (Columbia, Hillsborough, Chilcot, Duelfer). Held-out reports measure transfer to a publisher the pass never saw.
- Page-break behaviour is a property of the publisher's layout (first-line indent or block paragraphs, footnotes, OCR). A pass that fails on Challenger's scan fails on all of Challenger, not on a random half of it.
- Five of the six were already read while tuning ingest#57 (y7ix: "tuned on dev and on the PDF-only reports"), so none of them is clean held-out material as a whole report; PSI is the exception.
- 30 breaks a report is small: a whole report held out leaves 30 rows to check one publisher on; a split leaves 15.

## Options

1. **Split each report's breaks** (`set: dev | held-out` on every break, alternating within each sampling stratum by a seeded shuffle). Both halves cover every publisher and every confidence tier; the held-out half measures whether a pass generalises to new pages of a publisher it was tuned on, not to a new publisher.
2. **Assign whole reports**, e.g. Jack Smith, Lehman and Leveson to dev, PSI, Deepwater and Challenger held out. Keeps the transfer test, but three of the "held-out" reports were already read for #57, and the dev material shrinks to three layouts.
3. **All dev.** Most to learn from, nothing to check against beyond the existing held-out reports.

## Decision

Proposed: option 1. Each break carries its own `set`; `pnpm ingest referee eval` tallies them as `dev (PDF-only)` and `held-out (PDF-only)`, beside the report-level sets, and its held-out gate (no loss with a referee) covers the PDF-only held-out half too. `--dev` reads the dev halves, `--holdout` the held-out halves. Rules for agents: read and tune on dev-half breaks only; quote held-out-half counts, never their examples. Publisher transfer stays the job of the report-level held-out set (Columbia, Hillsborough, Chilcot, Duelfer).

## Consequences

- The PDF-only references add 86 dev and 86 held-out judged breaks at v0.21.0 (13 and 15 errors); with ingest#57, 10 and 11.
- A pass tuned on Challenger's dev half will look better on Challenger's held-out half than it would on a new scanned report. Say so when quoting the PDF-only held-out number; for transfer, quote the report-level held-out set.
- Extending a mini-reference (more breaks) keeps the scheme: draw more with a new seed, and the new breaks alternate within their strata as before (`pnpm ingest referee draft`, docs/scoring.md).

## Links

- `docs/scoring.md`, "Mini-references for reports with no clean edition"
- `reports/score-sets.yaml` (`mini_references`)
- `scripts/ingest/pagebreak-sample.ts`, `scripts/ingest/referee.ts`
- 38s.15, 38s.6 (dev/held-out split), y7ix (ingest#57)
