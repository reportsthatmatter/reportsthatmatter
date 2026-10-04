# Processing notes — Final Report of the Select Committee to Investigate the January 6th Attack on the United States Capitol

How the text on Reports that Matter was made, and where it still falls short of the printed page. Nothing has been rewritten. Where we know the text differs from the printed report, this page says so.

*Last reviewed 4 October 2026 (reportsthatmatter-gqsy.3).*

## The edition

- **Text and structure:** the Select Committee's own HTML edition of the report, as the Government Publishing Office holds it in the report's package on govinfo (GPO-J6-REPORT, the `html-submitted` folder). A copy is kept in the [report's repository](https://github.com/reportsthatmatter/us-jan6-committee) under `reference/raw/`, pinned by SHA-256.
- **Page numbers and checking:** House Report 117-663 as printed by GPO, from the same govinfo package ([GPO-J6-REPORT.pdf](https://www.govinfo.gov/content/pkg/GPO-J6-REPORT/pdf/GPO-J6-REPORT.pdf), 845 PDF pages, SHA-256 `132c8833…9f69ced`), also kept in the repository. The PDF stays the canonical citation target: page numbers on this site are its printed page numbers.
- **Which printing:** govinfo also holds the same report in its Congressional Reports collection (CRPT-117hrpt663): the same words, with the printer's slug on every page. The committee's own release on 22 December 2022 was a pre-print with placeholders ("House Report 117-000", "December 00") and otherwise the same words. Neither is used.
- **Licence:** public domain, a work of the U.S. Government. The photographs printed in the report carry third-party credits and are not shown here.
- **Covers:** the whole printed report: the committee and staff lists, the forewords of the Speaker, the Chairman and the Vice Chair, the Executive Summary, chapters 1 to 8, the Recommendations and Appendices 1 to 4.
- **Size:** about 371,000 words, 4,287 notes (every one linked to its place in the text), 522 printed pages marked (iii to xxiii and 1 to 811, less the pages that print only notes; see below).

## How the text was made

The report was published as a PDF with no structure a program can read reliably, and as the committee's HTML, which has every heading, quotation and note marked up, and every note linked to its place in the text. So the text comes from the HTML, and the PDF is used for the two things only it has.

- **Printed pages.** Every word of the HTML is matched to the same word in the PDF, in order: 98.7% of the HTML's 391,000 words (text and notes) find their place. Each paragraph is given the printed page its first word sits on; a page that begins in the middle of a paragraph is marked after that paragraph. Front-matter pages carry their roman numbers.
- **Checking the words.** Every stretch where the HTML and the PDF disagree is listed for review in `fidelity.md` in the repository (about 340, almost all the staff list, which the PDF sets in two columns, the photograph captions, which the PDF prints where the page had room, and the Executive Summary's two-column table). The HTML's text stands; nothing is resolved silently.
- **Notes.** The report numbers its notes afresh in each part (the Vice Chair's foreword, the Executive Summary, each chapter, the Recommendations, each appendix) and prints them as endnotes at the part's end. Each note is linked to its marker by the HTML's own link, not by its number, and is set beside the paragraph that cites it.
- **Headings.** Each part is a section: the forewords, the Executive Summary, "Chapter 1. THE BIG LIE" (the chapter titles as the HTML's own contents gives them) to chapter 8, the Recommendations and each appendix, with the report's numbered sections ("1.6 President Trump’s Campaign Team Told Him He Lost the Election and There Was No Significant Fraud") and subheads under them.
- **Quotations.** Testimony and documents the report sets as extracts are quotations, one to each paragraph or speaker's turn, as printed.
- **Photograph captions** are kept as paragraphs, with their credits ("(Photo by Samuel Corum/Getty Images)"), where the HTML places them; a credit printed without a caption (a chapter's opening photograph) is left out with the photograph.
- **The Executive Summary's table** (what officials told President Trump, set beside what he said afterwards) is a table, a row to each pair.

## Known limitations

- **Pages that print only endnotes have no page marker.** About 300 of the report's pages are the endnotes at the end of each part. The notes are shown beside the paragraphs that cite them, so there is no place for those pages in the text; a link to one of those page numbers goes to the nearest page before it.
- **The contents and the Letter of Transmittal are not shown.** The HTML's contents has no page numbers (the site lists the sections instead), and the HTML does not have the one-paragraph Letter of Transmittal to the Clerk of the House (p. v).
- **About 40 page markers sit a paragraph late.** Where a photograph's caption is printed at the top of a page but the HTML places it before a paragraph that began on the page before, the caption is shown under the earlier page.
- **The front matter's title pages** (the cover and the House report title page) are not shown, and the committee page (p. ii) has no marker.
- **Photographs and graphics are not shown.**

## Reporting a problem

If the text here differs from the printed report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/us-jan6-committee/issues) with the page number and the passage.
