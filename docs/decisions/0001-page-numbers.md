# 0001. When do we anchor printed page numbers, and when are paragraph numbers the citation?

- **Status:** open
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

## Decision

Not yet made. A per-report policy (option 2) was suggested in the session; it needs evidence of how each report is actually cited, and Rufus's decision.

## Consequences

—

## Links

- docs/design/reference-editions.md §2.1 (hybrid: page anchors from the PDF)
- docs/design/<date>-report-preparation-pipeline.md (stage 3), once merged
