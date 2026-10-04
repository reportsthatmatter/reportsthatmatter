# Processing notes — Post Office Horizon IT Inquiry Report, Volume 1

How the text on Reports that Matter was made, and where it still falls short of the printed page. Nothing has been rewritten. Where we know the text differs from the published report, this page says so.

*Last reviewed 4 October 2026.*

## The edition

- **Source:** the Inquiry's own PDF of Volume 1 (HC 1119, ISBN 978-1-5286-5867-6), as published on [postofficehorizoninquiry.org.uk](https://www.postofficehorizoninquiry.org.uk/volume-1-post-office-horizon-it-inquirys-final-report): 166 A4 pages, SHA-256 `ebdd61c6…308e`, kept in the [report's repository](https://github.com/reportsthatmatter/uk-post-office-horizon-inquiry). It is the canonical citation target.
- **Which upload:** the Inquiry published the volume on 8 July 2025 and replaced the file on 9 July 2025. The two have the same text except one word: the earlier file spells the Chair's name "Sir Wyn Willams" at the signature on p.163. This is the corrected file.
- **Not used:** the Inquiry's "Accessible Version" (a 466-page large-print reflow of the same text, so its page numbers are different), and the separate Rapid Read summary and Welsh translation of the recommendations.
- **Licence:** Crown copyright 2025, reused under the Open Government Licence v3.0, as the PDF's imprint (p.4) and the Inquiry's website both state.
- **Covers:** Volume 1 only: the Introduction, the 19 Recommendations, the Human Impact (with 17 case illustrations), Financial and Other Redress, the Submissions, the Conclusions and Recommendations relating to redress, and the Postscript. Volumes 2 to 5 had not been published when this was made.
- **Size:** about 82,000 words, 345 notes, 164 pages marked (pages 1, 3 to 164 and 166; page 2 is blank and page 165 carries only the running head).

## How the text was read

- **Born-digital, so the words are the PDF's own.** The PDF was made from InDesign and its text layer is clean; no OCR is involved. 98.4% of the PDF's words are in the text here; the rest are almost all the running head ("Post Office Horizon IT Inquiry Report: Volume 1", on every page from p.5), which is removed.
- **Page numbers.** The printed pages carry no page numbers. The report's own contents refers to pages by their place in the PDF ("1. INTRODUCTION 6" is the PDF's sixth page), so the page numbers here are PDF page numbers, and they match the contents. An independent check that reads each page's opening words in the PDF places all 160 located markers on the right page.
- **Paragraphs.** The report numbers its paragraphs ("1.10.", "4.293.") and its 19 recommendations; each is one citable paragraph, with its number.
- **Headings.** The headings are set by typeface only, not by any text convention, so they are read from the PDF's layout: the six chapters, the lettered sub-sections the contents lists ("a. Introduction", "b. The Horizon Shortfall Scheme - HSS"), and the topics and case-illustration names under them ("Martin Griffiths (Deceased)", "Late Claims"), 89 in all.
- **Page breaks.** Where a paragraph runs over a page turn, the paragraph is joined. Of 30 page turns checked by hand against the page images (29 drawn at random), 28 were right and 2 were wrong, both cases of a paragraph's last sentence continuing on the next page (see below). Against the tagged edition of the same PDF (the reference this text is scored against), the paragraph boundaries agree at 95.1% F1 (precision 99.0%, recall 91.5%); the reference itself is wrong at 1 of the 30 page turns.
- **Notes.** The 345 notes at the page feet are linked to their markers in the text: 344 of them (see below).
- **Control characters.** The PDF's text carries an invisible layout character before every note's text (InDesign's "indent to here"); it is removed.

## Known limitations

- **One note marker is not linked.** In paragraph 4.293 (p.107) the marker for note 265 is printed at the start of a line, and the paragraph is cut in two there: the marker shows as a bare "265" and the paragraph's last two sentences ("Mr Staunton received a letter from her…") stand as a paragraph of their own. Note 265 is in the notes, with no link to it.
- **Two paragraphs are cut at a page turn.** At the foot of p.25 to the top of p.26, paragraph 3.71's last sentences ("Mrs McDonald had anticipated seeing her daughter…") stand as a paragraph of their own between 3.71 and 3.72. At p.102 to p.103 the Department's quoted response in 4.273 is cut after "…individual cases." before "However, the department endorses…" (a judgement from the content; the page alone does not settle it).
- **The Select Committee's ten-point plan (p.104)** is a quoted numbered list whose items wrap onto a second line. Each item's second line ("through the HSS.", "administrators.") is set as a paragraph of its own, outside the quotation, and item 8 is not shown as quoted. The words are all there and in order.
- **Chapter headings drop their numbers.** The chapters read "INTRODUCTION", "THE HUMAN IMPACT" and so on, without the "1." to "6." the page prints; the contents keeps the numbers.
- **The Postscript** (not listed in the contents) is shown as a sub-section of chapter 6 rather than as a part of its own, and the back cover's ISBN line (p.166) is set as a quotation.
- **Images.** The PDF's only images are the Inquiry's wordmark on the cover pages; nothing else is missing.

## Reporting a problem

If the text here differs from the published report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/uk-post-office-horizon-inquiry/issues) with the page number and the passage.
