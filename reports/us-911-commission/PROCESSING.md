# Processing notes — The 9/11 Commission Report

How the text on Reports that Matter was made, and where it still falls short of the printed page. Nothing has been rewritten. Where we know the text differs from the printed report, this page says so.

*Last reviewed 2 October 2026 (reportsthatmatter-ivg.1).*

## The edition

- **Text and structure:** the Commission's own HTML edition of the report, one web page per chapter plus the notes, as archived from 9-11commission.gov by the University of North Texas CyberCemetery (`govinfo.library.unt.edu/911/report/`). A copy of every page is kept in the [report's repository](https://github.com/reportsthatmatter/us-911-commission) under `reference/raw/`, each pinned by SHA-256. The executive summary is a separate publication and is not included.
- **Page numbers and checking:** the authorised full-text PDF published by the Commission (`911Report.pdf`, 585 pages, SHA-256 `6fa7e90a…62d8`), also kept in the repository. The PDF stays the canonical citation target: page numbers on this site are its printed page numbers.
- **Licence:** public domain, a work of the United States Government.
- **Size:** about 306,000 words, 1,742 endnotes (every one linked to its marker in the text), 446 printed pages marked.

## How the text was made

Earlier versions of this page read the text out of the PDF. The Commission's HTML has the same words with the structure the PDF only implies: paragraphs, headings, quotations, lists and tables are marked up, and each note number is tagged. So the text now comes from the HTML, and the PDF is used for the two things only it has.

- **Printed pages.** Every word of the HTML is matched to the same word in the PDF, in order (99.9% of the HTML's words find their place), and each paragraph is given the printed page its first word sits on. A page that begins in the middle of a paragraph is marked after that paragraph. Checked against the PDF, 2,213 of 2,214 paragraphs located there carry the right page; the one exception repeats a sentence printed twice in the report, so the check cannot tell the two apart.
- **Checking the words.** Ten of the HTML's 308,000 words do not occur anywhere in the PDF (typing slips such as "comparisonn", or text the web pages added, such as "Rendering by Marco Crupi" under the World Trade Center drawings). Every stretch where the HTML and the PDF disagree is listed for review in `fidelity.md` in the repository: 72 short stretches of HTML text the PDF does not print in the same order (most are the staff list, which the PDF sets in two columns, and the flight timelines, which the PDF prints as a drawing), and 2 stretches of PDF text the HTML lacks (the labels on the map of air traffic control centers). The HTML's text stands; nothing is resolved silently.
- **Typography restored from the PDF.** The HTML was typed with plain hyphens and quotation marks. Where the PDF prints an em or en dash between the same two words, the dash is restored (1,202 places: "a hand wand—a procedure", "1988–1992"). Where the PDF prints a space after punctuation that the HTML runs on, the space is restored (77 places: `"Hijackers Timeline," Dec. 5`). Where the HTML kept the hyphen of a word the PDF broke at the end of a line ("air-line's"), it is closed up if the report prints the word whole elsewhere (80 places).
- **Notes.** Each note marker in chapter C opens note N of chapter C in the Notes, as the HTML lays them out. Where the HTML runs two notes into one paragraph or starts a note's second paragraph with a number ("April / 30."), the note sequence decides, and 26 markers the HTML left as plain digits after a full stop ("training.52", "General.86We") are linked because each is the next number in its chapter.
- **Figures and boxes.** The web pages placed each photograph, drawing and boxed text where the PDF page had room for it, often in the middle of a sentence. A paragraph interrupted that way is joined up again, and the caption or box follows it.
- **Section headings** follow the report's contents ("1.1 Inside the Four Flights"); the HTML sets them in capitals. Section 2.5, which the HTML marks only in bold, is a heading like the others. The heading of section 3.2 is taken from the PDF, because the HTML dropped its dashes and ellipsis.
- **Transcripts.** Lines of radio and telephone transcript that open with the speaker in bold ("**American 11:** We have some planes") are paragraphs, as the HTML sets most of them, so each line can be linked and marked on its own.

## Known limitations

- **Photographs, maps and drawings are not shown.** Their captions are kept.
- **Notes have no italics.** Titles of books and newspapers in the notes are italic in the printed report and plain here.
- **The staff list and Appendix C** are laid out as the HTML has them (one name per line), not as the PDF's columns.
- **Bold run-in heads** ("**Military Notification and Response**. Boston Center did not…") stay at the start of their paragraph, as printed, rather than becoming headings of their own.
- **The HTML's own slips are kept** where the PDF cannot settle them, and listed in `fidelity.md`.

## How this differs from the PDF reading it replaced

The PDF reading had split 34 paragraphs at page breaks with their second half set as a quotation, left 12 note markers that opened no note, run the staff list and appendix tables into paragraphs, and lost the drop cap of the first sentence ("Tue sday, Se ptembe r 11"). None of these remain. The PDF reading is still built on every run, as a check on the pipeline that reads reports with no HTML edition.

## Reporting a problem

If the text here differs from the printed report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/us-911-commission/issues) with the page number and the passage.
