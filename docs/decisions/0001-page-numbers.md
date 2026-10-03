# 0001. When do we anchor printed page numbers, and when are paragraph numbers the citation?

- **Status:** proposed (supervisor recommendation below; Rufus decides)
- **Date raised:** 2026-10-03
- **Decided by:** —
- **Beads:** reportsthatmatter-qap0; related: ifb5.3 (the stage-3 proposal records the choice per report), i8en (how anchors are encoded), b78.10 (page-label scheme)

## Question

Rufus, 2026-10-03: why do we need page numbers, and do they matter for reports that were published online (e.g. the 9/11 report served from its HTML edition)?

## Context

- Today every report carries inline `%%page N%%` anchors taken from the PDF. For the 9/11 hybrid (ivg.1), page anchors are produced by aligning the HTML's words to the PDF; all 446 pages anchor automatically.
- Arguments for page anchors: people cite these reports by printed page ("9/11 Commission Report, p. 172"), as do courts and Parliament, and a reader holding a citation needs to find it. Page anchors also let a reader check our text against the official PDF.
- Arguments that they matter less: UK inquiries (Saville, Chilcot, Leveson, Litvinenko, Hillsborough) are cited by paragraph number ("para 3.120"), and their HTML editions carry paragraph numbers, not pages.
- The labels are not uniform: some reports use printed page numbers and some PDF page indexes (9/11 printed = PDF − 17; Chilcot = PDF − 4), and this isn't recorded (b78.10).
- Rare differences between an online edition and the PDF are listed in `fidelity.md` rather than silently resolved.

## Options

1. Page anchors for every report (status quo).
2. Per report: the primary citation unit (printed page or paragraph number) is chosen in the stage-3 proposal; the other is kept where cheap.
3. Paragraph numbers only where they exist; page anchors only for page-cited reports.

## Recommendation (supervisor, 2026-10-03)

**Principle: anchor to the canonical edition's own locators, never invent any.** Our primary citation unit is always our paragraph id (`?p=`), which works for every report. On top of that, carry whatever locator the canonical edition itself uses, because that's what people already cite:

1. **Paginated canonical edition** (every report we have today: all 13 live and the queued ones are official PDFs, and US reports like 9/11, Valukas and Philip Morris are cited by page): keep printed page anchors. They let a reader match an existing citation ("p. 172") and check our text against the official copy. Alignment makes them almost free (the 9/11 hybrid anchored all 446 pages automatically).
2. **Numbered paragraphs** (UK inquiries: Saville, Chilcot, Leveson, Litvinenko, Hillsborough): printed paragraph numbers are the main citation and should be shown prominently. Keep page anchors too while a PDF is the canonical edition, but give them less prominence.
3. **Web-native reports with no pagination** (likely as we take on more online-first publications): no page numbers. Don't invent them, and don't import pages from a print-on-demand PDF. Use the edition's own section and paragraph numbers if it has them, and our paragraph ids otherwise.

**What this implies:**
- Page anchors become optional per-report metadata, not a pipeline requirement. Record which locators a report carries, and its label scheme (printed vs. PDF index, b78.10), in the stage-3 proposal (ifb5.3).
- Show page numbers less prominently in the reading view (uk0) and print them in citations: "p. 172" where paginated, "para 3.120" where numbered, otherwise the link.
- How the anchors are encoded (inline `%%page%%` vs. a sidecar layer) is 0002/i8en. This recommendation favours a layer that can be absent.

**Evidence to gather before deciding:** how each live report is cited in the press, courts and Parliament (page vs. paragraph), and whether readers use the page markers (analytics on `#page-` anchors, if any).

## Decision

Not yet made: Rufus to decide on the recommendation above.

## Consequences

—

## Links

- docs/design/reference-editions.md §2.1 (hybrid: page anchors from the PDF)
- docs/design/<date>-report-preparation-pipeline.md (stage 3), once merged
