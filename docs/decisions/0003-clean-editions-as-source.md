# 0003. Serve clean editions instead of cleaning PDFs?

- **Status:** decided
- **Date raised:** 2026-10-02 · **Date decided:** 2026-10-02
- **Decided by:** Rufus (direction); supervisor (design)
- **Beads:** reportsthatmatter-ivg (hybrid epic), 38s (training set), zphc (sourcing research)

## Question

Rufus: "if we do have clean texts why are we cleaning the original PDFs?"

## Context

38s.1 found clean editions for some reports (9/11 and Saville HTML; Hillsborough website plus tags; Duelfer CIA HTML; Philip Morris court text, a different version) and none for others (Leveson, Deepwater, Challenger, Lehman, PSI, Jack Smith). The hardest reports have no clean text.

## Decision

Hybrid: take structure and text from the clean edition, and printed page anchors from aligning to the PDF; the PDF stays the canonical citation target and the fidelity check. Keep the PDF ingest running as a shadow, scored against the clean text (Rufus: those reports are the training ground for PDF-only reports). Piloted on 9/11 (live 2026-10-03, ingest v0.19.0); Saville in progress (ivg.2).

## Consequences

A report served from its clean edition no longer counts as an independent score reference, but stays labelled data via the shadow run. Paragraph ids move on the switch (see 0008).

## Links

- docs/design/reference-editions.md §2
- docs/research/better-source-texts.md
