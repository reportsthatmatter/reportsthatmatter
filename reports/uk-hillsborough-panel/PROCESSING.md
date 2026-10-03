# Processing notes — The Report of the Hillsborough Independent Panel

How the text on Reports that Matter was made, and where it still falls short of the printed page. Nothing has been rewritten. Where we know the text differs from the printed report, this page says so.

*Last reviewed 3 October 2026.*

## The edition

- **Text and structure:** the Panel's own website edition of the report (hillsborough.independent.gov.uk, one web page for every few printed pages), as the Internet Archive's Wayback Machine kept it; the site itself is no longer online. 140 of its pages are kept in the [report's repository](https://github.com/reportsthatmatter/uk-hillsborough-panel) under `reference/raw/`, each pinned by SHA-256 with the address and date of its capture.
- **Where the website is missing:** the Wayback Machine never captured some of the site's pages: most of chapters 4, 7 and 9, the end of chapter 8, parts of chapters 10 and 12 and of Part 3, and the title and contents pages. For those stretches the text is the PDF's own, read as the PDF reading reads it (below). About 43,000 of the report's 200,000 words, on some 90 of its 389 PDF pages, come from the PDF this way, in 10 stretches; each is listed in `fidelity.md` in the repository with the pages it covers.
- **Page numbers and checking:** HC 581 as published on [GOV.UK](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/229038/0581.pdf), 12 September 2012 (389 PDF pages, SHA-256 `8dbea5f6…0d8e`), also kept in the repository. The PDF stays the canonical citation target: page numbers on this site are its printed page numbers.
- **Licence:** Crown copyright, reused under the Open Government Licence v3.0, for both the PDF and the website.
- **Covers:** the whole report: the Foreword, the Report summary, Part 1, Part 2 (chapters 1 to 12), Part 3 and Appendices 1 to 5.
- **Size:** about 200,000 words, 1,015 notes, 371 printed pages marked.
- **Corrections applied:** none.

## How the text was made

Earlier versions of this page read the text out of the PDF, which lost most of the report's structure: its subsection headings ran into the paragraph after them, and its page-foot notes were read as paragraphs of the text, with every note number in the text left bare. The website has the same words with that structure marked: headings, paragraphs, quotations, lists, and each page's notes linked to their markers. So the text now comes from the website, and the PDF is used for what only it has, and for what the website lacks.

- **Printed pages.** Every word of the website is matched to the same word in the PDF, in order (99.5% of them find their place), and each block is given the printed page its first word sits on. A page that begins in the middle of a paragraph is marked after that paragraph.
- **Filling the missing pages.** Where a web page is missing, the text between the last word the website has before it and the first word after it is taken from the PDF, block by block, each block keeping the PDF page it came from. Its notes come with it, read from the foot of each PDF page. Running heads, stray page numbers and phrases the website already has next to the gap are left out. The headings of those stretches are read from the PDF's typography: the report sets its subsection headings in maroon sans-serif at two sizes, larger than the body, and each such line is a heading, at the level its size says, as on the website's pages. Those stretches keep the PDF reading's other limits (below).
- **Checking the words.** All of the website's words but 36 occur in the PDF. Every stretch where they disagree is listed for review in `fidelity.md`: 23 short stretches of the website not in the PDF (figure captions, which the PDF sets as part of the picture, and the Panel members' names in Appendix 2, which the PDF sets in a table), 20 notes whose text the PDF sets differently or the PDF reading did not find, and 2 stretches of PDF text the website lacks.
- **Notes.** The website numbers the notes through each chapter, as the printed report does, and links each to its marker; the PDF prints them at the foot of each page, numbered "104." with a full stop. Each note is kept on the page it is printed on.
- **Deletions.** Chapter 11 quotes police statements with the words that were deleted from them struck through; the website marks them, and so does this text.
- **Typography.** The website sets plain quotation marks and hyphens where the printed report has dashes; 179 dashes the PDF prints between the same two words are restored.

## Known limitations

- **In the stretches taken from the PDF** (most of chapters 4, 7 and 9, and the others listed in `fidelity.md`), 13 note numbers are left bare where the PDF reading did not find the note, and in a few places a run of numbered paragraphs is one block (a paragraph label after a full stop is not always a paragraph start in the PDF's text).
- **Photographs, maps and figures are not shown.** Their captions are kept where the website gives them.
- **The website's own slips are kept** where the PDF cannot settle them ("spokeperson", "situaton").

## Reporting a problem

If the text here differs from the printed report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/uk-hillsborough-panel/issues) with the page number and the passage.
