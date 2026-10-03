# Processing notes — The Report of the Bloody Sunday Inquiry, Volume I

How the text on Reports that Matter was made, and where it still falls short of the printed page. Nothing has been rewritten. Where we know the text differs from the printed report, this page says so.

*Last reviewed 3 October 2026 (reportsthatmatter-ivg.2).*

## The edition

- **Text and structure:** the Inquiry's own HTML edition of Volume I, one web page per part (the General Introduction, the Glossary, Chapters 1–9), as the Inquiry published it on report.bloody-sunday-inquiry.org and as the Internet Archive's Wayback Machine kept it (the National Archives' copy refuses scripted downloads). A copy of every page is kept in the [report's repository](https://github.com/reportsthatmatter/uk-saville-inquiry) under `reference/raw/`, each pinned by SHA-256.
- **Page numbers and checking:** HC 29-I as published on [GOV.UK](https://assets.publishing.service.gov.uk/media/5a7b7c8ced915d131105f8f4/0029_i.pdf), 15 June 2010 (493 PDF pages, SHA-256 `f979d05c…97ea`), also kept in the repository. The PDF stays the canonical citation target: page numbers on this site are its printed page numbers.
- **Licence:** Crown copyright, reused under the Open Government Licence v3.0. The GOV.UK publication page carries the OGL notice; the PDF's imprint allows reuse free of charge if the use is accurate, the title is given and the copyright acknowledged; the website's pages say only "© Crown Copyright 2010", for which the National Archives' default licence is the OGL. The imprint excludes third parties' copyright in quoted material and images; no image is reproduced here.
- **Covers:** Volume I only: the General Introduction, the Glossary, the Principal Conclusions and Overall Assessment (Chapters 1–5) and the Background to Bloody Sunday (Chapters 6–9), paragraphs 1.1 to 9.774. Volumes II–X are not included. The PDF's own front matter (title pages, the imprint and the 14-page Outline Table of Contents of all ten volumes) is not in the web edition and is not here.
- **Size:** about 168,000 words, 1,460 notes (every one linked to a place in the text), 472 printed pages marked (15–488).

## How the text was made

Earlier versions of this page read the text out of the PDF. The Inquiry's HTML has the same words with the structure the PDF only implies: numbered paragraphs, headings, boxed quotations, lists, tables, and each paragraph's notes directly beneath it. So the text now comes from the HTML, and the PDF is used for the two things only it has.

- **Printed pages.** Every word of the HTML is matched to the same word in the PDF, in order (99.97% of the HTML's 166,683 words find their place), and each block is given the printed page its first word sits on. A page that begins in the middle of a paragraph is marked after that paragraph. Of the 472 pages marked, 464 are found by their own words and 8 (full-page maps and photographs) take the place of the page after them. Checked against the PDF by a separate method (the paragraph's opening words located in the PDF's own text, the page read off its running head), all 1,652 paragraphs and quotations whose opening words occur on one page carry that page, and 89 more whose opening words occur on several pages carry one of them; the PDF reading this replaces had 12 wrong of 2,079 on the same test, and a hand check of 30 paragraphs drawn at random against the pages (one also on the page image) found none wrong. The PDF reading left 7 pages with no printed number (full-page figures, a header it did not read); where the pages on either side agree on the sequence they are numbered here.
- **Checking the words.** All of the HTML's words but 44 occur in the PDF in the same order, and none is absent from it. Every stretch where they disagree is listed for review in `fidelity.md` in the repository: 8 notes whose text the PDF reading did not place where the HTML has it, and 9 stretches of PDF text the HTML lacks (the labels on the maps and organisation charts, which the HTML has as pictures). The HTML's text stands; nothing is resolved silently.
- **Typography.** The HTML sets curved quotation marks and apostrophes, as the printed report does; the PDF reading had plain ones. The HTML puts a space before about 300 closing quotation marks that follow an italic or a name ("a “Sovereign Independent State ” which"); the printed page does not, and the space is removed.
- **Notes.** Each paragraph's notes are numbered from 1 again, in two columns that the HTML sets as table cells. The columns are put back in order (a note that runs from one column into the next is one note, and each second-column note, run into the first column's row, is read by its own number), and each note is paired with the marker of the same number in the paragraphs above it. Where the HTML left a marker as a plain digit after punctuation ("our ruling of 11th October 2004,1 we express"), 40 places, the digit is taken for the marker of the note that has none. Ten notes have no marker anywhere in the HTML (note 1 under paragraph 8.92, "G15.89", for one); each is linked at the end of the paragraph above it, which the notes sit under, though the printed marker may stand earlier in the paragraph. One paragraph numbers its third note "2" (under 9.38); it is read as note 3.
- **Quotations.** A boxed extract (a transcript, a document, an earlier report) is one quotation, a paragraph to each of its paragraphs. The HTML sets a quotation that runs over a page as one box a page, and a sentence stopped at the foot of one box goes on in lower case at the head of the next; 11 such quotations are joined up again.
- **Glossary.** Each term is set in bold at the head of its entry, as printed, rather than as a heading of its own; "Army units" and the list of Army ranks (a table) are as printed.
- **Headings.** The General Introduction, the Glossary, the Principal Conclusions and Overall Assessment and the Background to Bloody Sunday are parts; the chapters sit under them, with full titles ("Chapter 4: The question of responsibility for the deaths and injuries on Bloody Sunday"; the PDF reading had cut it at the line wrap), and each chapter's subsections under those. Each chapter's own contents list is kept, with its page or paragraph numbers.

## Known limitations

- **Photographs, maps and figures are not shown.** The web pages hold them as pictures; we do not reproduce them. The sentences that introduce them ("the following photograph and map", after paragraph 1.7) are kept, and so are the figures' titles where the HTML gives them.
- **Ten notes are linked to the end of a paragraph**, not to the word the printed marker follows (above).
- **Numbered items** in a paragraph's list ("1. fundamental changes in the system of local government elections", paragraph 7.47) are paragraphs of their own, as printed, and carry their numbers in the text.
- **The website's own slips are kept** where the PDF cannot settle them.
- **Corrections issued after publication** have not been compared with the PDF beyond the word check above.

## How this differs from the PDF reading it replaces

The PDF reading had run each chapter's contents list into 191 paragraphs, left 16 note texts in the body and 10 bare note numbers in the text (and 12 notes unlinked), kept 17 map labels and repeated glossary lines as paragraphs, cut 5 quotations at a page break, typed evidence extracts as paragraphs (309 by the Inquiry's own markup), left the General Introduction and Glossary without structure, and put 12 paragraphs on the wrong page. None of these remain. The PDF reading is still built on every run, as a check on the pipeline that reads reports with no HTML edition. Its review queue held 95 possible misreadings of the scan; the queue now lists the 17 places where the HTML and the PDF disagree.

## Reporting a problem

If the text here differs from the printed report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/uk-saville-inquiry/issues) with the page number and the passage.
