# Processing notes — Committee Study of the Central Intelligence Agency's Detention and Interrogation Program

How the text on Reports that Matter was made, and where it still falls short of the printed page. Nothing has been rewritten. Where we know the text differs from the printed report, this page says so.

*Last reviewed 10 October 2026 (reportsthatmatter-gqsy.6).*

## The edition

- **Source:** Senate Report 113-288, as printed by the Government Publishing Office and held on govinfo ([CRPT-113srpt288.pdf](https://www.govinfo.gov/content/pkg/CRPT-113srpt288/pdf/CRPT-113srpt288.pdf), 712 PDF pages, SHA-256 `4989f2fb…c8090bb3`). A copy is kept in the [report's repository](https://github.com/reportsthatmatter/us-senate-cia-torture-report). It is the canonical citation target: page numbers on this site are its printed page numbers.
- **What kind of PDF it is:** apart from the GPO's own title, letter and contents pages, every page is a scan of the declassified typescript, with a text layer made by optical character recognition (OCR). There is no born-digital or HTML edition: the Committee's own release of 9 December 2014 (intelligence.senate.gov) is the same kind of scan, and govinfo's HTML version is images only. So the words here are the OCR's.
- **Licence:** public domain, a work of the U.S. Government.
- **Covers:** the whole printed report: the letter of transmittal, Chairman Feinstein's foreword, the Findings and Conclusions, the Executive Summary (pages 1 to 499, with its appendices), the additional views of Senators Rockefeller, Wyden, Udall, Heinrich, King and Collins, and the three sets of minority views. The full study, of more than 6,700 pages, remains classified and is not part of this report.
- **Size:** about 400,000 words, 3,260 notes, 709 page markers, 150 headings, and 9,947 redactions shown.

## How the text was made

- **Redactions.** The declassified report prints each redaction as a solid black box. The OCR reads a box as stray characters ("H ^ H", "B I H I H", "|") or as nothing at all, so the text layer alone cannot say where a redaction is. Each page image was searched for solid dark rectangles (11,680 of them), and the characters the OCR read inside each box were replaced by one marker, **[Redacted]**, or a marker was put where a box sits with nothing read inside it. One marker stands for one printed box, however long. Words the report itself prints in brackets are its own and are kept: "[REDACTED]" in capitals, its pseudonyms ("[CIA OFFICER 1]") and its substitutions ("[DETENTION SITE GREEN]", "Country J").
- **Classification markings.** Every page carries struck-through classification banners ("UNCLASSIFIED", "TOP SECRET//[box]//NOFORN") and most paragraphs open on a struck-through portion marking ("(TS//[box]//NF)", "(U)"). These are control markings from declassification, not text, and are left out, as are each part's own "Page 21 of 499" counters and the printer's slugs. A paragraph that opened on a marking is shown as an ordinary paragraph.
- **Notes.** Notes are printed at the foot of each page (the Findings and Conclusions print theirs at the end). Where the OCR lost or misread a note's number (a raised number printed against a box, "so" for 50, "I2H" for 128, a number read as stray marks glued to the note's first word), the number is restored from the order of the notes: each page's notes are numbered in sequence, checked against the numbers the OCR did read and against the last note of the page before and the first of the page after. 494 numbers were put back and 342 lines corrected. A note's text that runs over to the next page is joined to its note.
- **Headings.** The report's parts (foreword, findings, summary, each set of views) are read from the GPO contents page, and the Executive Summary's sections and subsections from its own six-page contents; 127 of its 135 contents entries are matched to their headings, despite OCR differences between the contents and the text.
- **Page numbers.** The GPO's folios at the foot of each page: roman for the front matter (i to xxviii), then 1 to 683.

## Known limitations

- **The words are OCR.** The scan is clean and most of the text reads well, but there are OCR errors throughout ("inclucfc" for "include", "arc" for "are"), some words spaced letter by letter ("i n t e r v i e w"), and around some redactions a few characters of garble. They are listed for review in `fidelity.md` in the repository; none has been corrected by hand yet.
- **Where a redaction sits is approximate.** A marker is placed from the box's position on the page and the OCR's word positions. A letter beside a box is sometimes taken into it ("DIRECTO [Redacted]"), and where the OCR dropped a whole line that held boxes (a few appendix pages), the markers stand on a line of their own without the words around them.
- **About 270 notes are merged into the note before them** (of about 3,500 printed; 230 of them in the Executive Summary, 23 in the minority views). Where neither a number, the layout nor the page's sequence shows that a new note begins, its text is shown at the end of the previous note, and the marker that cites it in the text stays a plain number. No note text is lost, but these notes are not under their own numbers. A few notes restored from the sequence where two were lost together may carry their neighbour's number. On a few pages (for example printed pp.267-268) the notes were read into the body text as a paragraph. Overall about 84% of the note markers printed in the text are linked.
- **Some paragraphs are split or run together.** About 57 paragraphs break mid-sentence, and about 100 have a line or two set as a quotation that is not one, mostly where a quotation's first line was read into the paragraph before it, or where letter-spaced OCR garble split a line.
- **Headings in the minority views.** The minority views have their own contents, which is not read: some of their sub-headings are shown as paragraphs, and a few as sections of their own.
- **A few classification markings remain** where the OCR garbled the marking together with the first word of the paragraph.
- **Tables and charts** (the list of detainees in Appendix 2, the minority views' charts) are shown as text as the OCR read them.

## Reporting a problem

If the text here differs from the printed report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/us-senate-cia-torture-report/issues) with the page number and the passage.
