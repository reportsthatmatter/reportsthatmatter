# Processing notes — Comprehensive Report of the Special Advisor to the DCI on Iraq's WMD, Volume I

How the text on Reports that Matter was made, and where it still falls short of the printed page. Nothing has been rewritten. Where we know the text differs from the printed report, this page says so.

*Last reviewed 12 November 2026.*

## The edition

- **Page numbers, words and checking:** Volume I of the Comprehensive Report with Addendums as printed by the Government Publishing Office in 2005 ([GPO-DUELFERREPORT-1.pdf](https://www.govinfo.gov/content/pkg/GPO-DUELFERREPORT/pdf/GPO-DUELFERREPORT-1.pdf), 453 PDF pages, SHA-256 `a62d23e5…a1713a0`), kept in the [report's repository](https://github.com/reportsthatmatter/us-duelfer-report). It is the citation target: page numbers on this site are its printed page numbers.
- **Structure:** the CIA's own web edition of the report (the reading-room pages on cia.gov, which no longer exist, as the Internet Archive's Wayback Machine captured them in 2007 and 2011): 23 pages, one for each part of Volume I. Copies are kept in the repository under `reference/raw/`, pinned by SHA-256.
- **Which version:** the two are not quite the same text. The web pages are the report as submitted on 30 September 2004. The 2005 printing says on its own note (printed p. 3) that it is "a slightly revised version": Arabic names respelled for consistency, grammar corrected, redundant statements deleted, awkward ones reworded, and the Niro Atomizer section of the Regime Finance and Procurement chapter's Annex I removed (the CIA removed that section from its web pages too, in April 2007). We serve the printed words, as described below.
- **Licence:** public domain, a work of the U.S. Government.
- **Covers:** all of Volume I: the Acknowledgements, the 2005 Note for the Comprehensive Report with Addendums, the Transmittal Message, the Scope Note, the Regime Strategic Intent chapter and its Annexes A to D, the Regime Finance and Procurement chapter and its Annexes A to L, and the Regime Strategy and WMD Timeline Events table. Each chapter opens with its own Key Findings. Volumes II and III and the Addendums are not yet here.
- **Size:** about 161,000 words, 398 printed pages marked. The report has no notes.

## How the text was made

The PDF sets the report in two columns with shaded boxes, tables and a chapter tab in the margin, and a program reading it gets the paragraphs, headings and boxes wrong in many places. The web edition has them marked up. So the structure comes from the web pages, and the PDF is used for the page numbers and the words.

- **Printed pages.** Every word of the web edition is matched to the same word in the PDF, in order: 93.6% of its 165,000 words find their place. (Most of the rest are boxes and tables the web pages set in a different place or order from the page.) Each paragraph is given the printed page its first word sits on; a page that begins in the middle of a paragraph is marked after that paragraph. The print numbers each part from 1 (the Acknowledgements, the Transmittal Message, the Scope Note and each chapter, whose annexes carry on its numbering), so a page number recurs; a link names which occurrence it means.
- **The printed words.** Where the web edition and the PDF disagree inside a paragraph, a list item or a table cell's spelling, the PDF's words are served: 753 places, about 700 words, such as "‘Abd" for "Abid", "UNSC" for "Security Council", "UNSCOM" for "UNMOVIC", "$1.5 billion" for "$990 million", and the web edition's run-together words ("Kamilsought") set apart as printed. Each is listed in `fidelity.md` in the repository, edition and PDF side by side. Where the printed text was rewritten at more length, or the web edition sets the passage somewhere else (most often a box), the web edition's words stand and the place is listed for review instead.
- **Headings.** Each part is a section, and each chapter's top-level parts, as its own contents lists them ("Who Made Iraq’s Strategic Decisions and Determined WMD Policy"), are sections of their own, with the subheads under them as the chapter contents nests them.
- **Boxes** (the shaded panels, such as "Note on Methodological Approach") are kept, their title in bold and their text as the report sets it, in italics.
- **Tables** are tables, a row at a time.
- **The chapter tab** printed in the margin of every page ("Regime Strategic Intent", "Regime Finance and Procurement") is not part of the text.

## Known limitations

- **Some passages are the 2004 text, not the printed one.** About 270 short disagreements, and every longer rewrite, are served in the web edition's words, because they sit inside emphasis, across a column or page break, or in a box the web edition places elsewhere. They are listed in `fidelity.md`. If a quotation matters, check it against the PDF page.
- **Boxes sit where the web edition puts them**, which is often after the page's running text rather than at the head of a column, so a box can be cited with the page after the one it is printed on, and a few page markers fall together.
- **A page that starts inside a long table** (Annex K's list of front companies) is marked before the table, so its first rows are cited with the next page.
- **The table on printed p. 6 of Regime Strategic Intent** ("Key Iraqi Organizations and Officials (2003)") follows the web edition's rows, which put the National Monitoring Directorate's director one row late.
- **The chapter contents pages and the Annexes lists are not shown** (the site lists the sections instead), nor the chapters' title pages.
- **Figures, photographs, maps and charts are not shown.** Their captions are kept where the web edition has them.

## Reporting a problem

If the text here differs from the printed report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/us-duelfer-report/issues) with the page number and the passage.
