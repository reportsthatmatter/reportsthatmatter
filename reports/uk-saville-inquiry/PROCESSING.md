# Processing notes — The Report of the Bloody Sunday Inquiry, Volume I

How the text on Reports that Matter was made from the published PDF, and where it still falls short of the printed page. The text is a machine reading of a PDF. Nothing has been rewritten, but a reading can be wrong, and where we know it is, this page says so.

*Last reviewed 20 September 2026, built with `@rtm/ingest` v0.12.16.*

## The edition

- **Source:** HC 29-I, published 15 June 2010, as hosted on [GOV.UK](https://assets.publishing.service.gov.uk/media/5a7b7c8ced915d131105f8f4/0029_i.pdf). Crown copyright, published under the Open Government Licence v3.0. The PDF is kept in the [report's repository](https://github.com/reportsthatmatter/uk-saville-inquiry) and pinned by SHA-256 (`f979d05c…97ea`).
- **Covers:** Volume I only: the General Introduction, the Glossary, the Principal Conclusions and Overall Assessment, and the Background to Bloody Sunday (Chapters 1–9). Volumes II–X, the detailed evidence and findings, are not included.
- **Size:** 489 PDF pages, roughly 170,000 words and 1,451 footnotes. Page numbers on this site are the report's printed page numbers. In the body of the report the PDF's own page numbers run five higher (printed page 46 is PDF page 51), and the review queue in the repository uses the PDF's.
- **Human corrections applied:** none.
- **Flagged for human review:** 95 places where the scan may have been misread (53 possible "rn"/"m" confusions and 42 digits inside words). None has been judged yet. The digit cases are largely dates such as "8th" and evidence reference codes such as "G3B.48.9", which are correct as printed.

## How the text was read

The report's layout defeats a generic PDF reader, so its build makes a few decisions of its own. The switches behind them are off by default in the shared pipeline, so no other report's text changed.

- **Footnotes.** Saville prints each paragraph's notes directly beneath it, in two columns, and starts again from 1 every time. The pipeline reads them where they are printed and links each note to the paragraph above it. Each note keeps its printed number as its label. Of 1,451 notes, 1,439 are linked to a marker in the text.
- **Facing pages.** Left- and right-hand pages set the body at different indents. Each page's own margin is measured, which brought paragraphs that end mid-sentence down from 1,043 to 188. Quoted documents, including the telegram on p. 275, come out as quotations.
- **Headings.** The chapters' own contents lists supply 157 subsection headings, and chapter titles cut off at a line wrap are completed. Numbered items and capitals inside quoted documents stay as text, with their numbers kept.
- **Stray glyphs.** 814 unmapped decorative marks after paragraph numbers, which the PDF text layer renders as "�", are removed.

## Known limitations

- **Photographs, maps and figures are not shown.** The pipeline does not yet extract images, so every figure in the report is missing. The text printed on them, such as the labels "Guildhall Square" and "William Street", appears as short loose lines where the figure should be. The clearest case is after paragraph 1.7, where the report refers to "the following photograph and map" (printed pages 46–47).
- **Some paragraphs are split at a page break.** About 50 long paragraphs that run over a page, where the next page starts with a capital letter, appear as two paragraphs, each with its own link. This affects other reports too, and the fix is not yet safe to apply to all of them.
- **About 140 paragraphs end mid-sentence.** Most of these are map labels and figure text that the PDF stores as ordinary text and that interrupt the paragraph they sit beside. They are left as printed rather than guessed at.
- **Twelve notes are not linked to the text.** Their marker is missing from the PDF's text layer, so they are listed together under "Notes not linked in the text" instead of beside a paragraph. Map legends numbered like notes (such as "1 Jackie Duddy") stay where they are printed.
- **Two note rows on p. 234 are plain text.** The source gives two different notes the number "2", so they cannot be told apart safely.

## Reporting a problem

If the text here differs from the printed report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/uk-saville-inquiry/issues) with the page number and the passage. A confirmed fix is recorded as a correction, which is applied on every rebuild.
