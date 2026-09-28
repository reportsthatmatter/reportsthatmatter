# Processing notes — Report of Anton R. Valukas, Examiner (Lehman Brothers), Volume 1

How the text on Reports that Matter was made from the published PDF, and where it still falls short of the printed page. The text is a machine reading of a PDF. Nothing has been rewritten, but a reading can be wrong, and where we know it is, this page says so.

*Last reviewed 28 September 2026, built with `@rtm/ingest` v0.13.0.*

## The edition

- **Source:** *Report of Anton R. Valukas, Examiner, In re Lehman Brothers Holdings Inc., et al.*, filed with the U.S. Bankruptcy Court for the Southern District of New York (Chapter 11 Case No. 08-13555 (JMP)) on 11 March 2010, hosted by [Jenner & Block LLP](https://www.jenner.com/en/news-insights/news/lehman-brothers-holdings-inc-chapter-11-proceedings-examiner-s-report), counsel to the Examiner. A U.S. court record; no copyright restricts it. The PDF is kept in the [report's repository](https://github.com/reportsthatmatter/us-lehman-examiner) and pinned by SHA-256 (`ff68a50a…a402d`).
- **Covers:** Volume 1 of 9 only — Sections I and II (Introduction; Executive Summary of the Examiner's Conclusions; Procedural Background and Nature of the Examination) and Section III.A.1 (Risk: Business and Risk Management). The report's other eight volumes, covering valuation, survival, Repo 105, secured lenders, government communications, the Barclays sale and avoidance actions, and the supporting appendices, are not included. **The "Repo 105" accounting device this report is best known for is discussed in this volume's Executive Summary, but the Examiner's dedicated findings on it (Section III.A.4) are in Volume 3**, out of scope for this release. A Bead tracks ingesting the remaining volumes.
- **Size:** the official Volume 1 PDF is 239 pages. Its first 43 are a cover page and the master table of contents for the full nine-volume, roughly 2,200-page report (every volume's sections, down to sub-subsections, in that whole-report's own pagination) followed by a table of appendices and a repeated cover page — none of it Volume 1's own text, and it lists sections and pages in volumes this release does not have. This site's text is built from pages 44–239: Volume 1's own local contents page through the end of the volume, 196 pages, roughly 59,000 words and 690 footnotes.
- **Page numbers on this site are the report's own printed page numbers.** They match the PDF's own page count at the start of the volume (PDF page 44 = printed page 1) and run one higher by the end (PDF page 239 = printed page 195) — one page in the volume prints no number of its own.
- **Human corrections applied:** none.
- **Flagged for human review:** 41 places where a digit sits inside a word (page and section cross-references such as "2nd Quarter", "1Q 07", statute citations such as "15c3-1e") or where "rn"/"m" could be confused — all checked, none is a misreading.

## How the text was read

- **Structure.** The volume's own contents page (page 1 of this edition) lists every heading and subheading it contains; a body line matching an entry, letter for letter across its wrapped lines, is read as that heading. Numbered and lettered lines that are not listed there (this report quotes emails, deposition transcripts and board minutes at length, many opening on a number or a capitalised run-in) stay as text.
- **Footnotes.** All 690 notes are printed at the foot of the page they're cited on and numbered continuously through the volume; every citation resolves to a note.
- **Figures.** The PDF has no embedded images (checked with `pdfimages -list`) — it is a typeset legal filing throughout. One exhibit, a stock-price line chart (Introduction, discussing the week of 12–15 September 2008), extracts as a loose run of axis labels and dollar figures rather than a chart; it is left as printed.

## Known limitations

- **About one in seven footnote markers is not a clickable link.** Roughly 122 of the volume's 817 footnote citations stay as the plain digit the PDF prints (for example, "...for its fiscal year ending November 30, 2007.2 During January 2008...") instead of linking to the note. Every note itself is present and correctly numbered; only some in-text markers don't yet point to it. A few of these sit inside a financial table (the net-leverage table in the Risk section) where the marker is printed directly against the figure it follows, e.g. a leverage ratio of "16.1" with note "72" attached reads as "16.172" — read the note text to confirm which digits are the figure.
- **The stock-price chart in the Introduction extracts as text, not a chart.** Its axis labels and dollar figures ("70.00 $62.19 60.00 50.00...") appear as a loose block rather than a graph; the chart itself is not shown.
- **Volumes 2–9 are not yet on this site,** including the dedicated Repo 105 findings (Volume 3) and the appendices (Volumes 6–9, including the Examiner's exhibits and interview memoranda).

## Reporting a problem

If the text here differs from the printed report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/us-lehman-examiner/issues) with the page number and the passage. A confirmed fix is recorded as a correction, which is applied on every rebuild.
