# Processing notes — The Report of the Iraq Inquiry, Executive Summary

How the text on Reports that Matter was made from the published PDF, and where it still falls short of the printed page. The text is a machine reading of a PDF. Nothing has been rewritten, but a reading can be wrong, and where we know it is, this page says so.

*Last reviewed 28 September 2026, built with `@rtm/ingest` at commit `2d823b5` (pending the v0.13.0 tag).*

## The edition

- **Source:** HC 264, published 6 July 2016. The Inquiry issued two editions on the same day: an HC print edition (a prepress file carrying InDesign job-slug lines and ligatures in its text layer) and the Inquiry's own A4 web edition, originally hosted at `iraqinquiry.org.uk` and preserved by the UK Government Web Archive. This report is built from the web edition, which has neither of the print edition's artefacts; the two are otherwise identical. See the [report's repository](https://github.com/reportsthatmatter/uk-chilcot-inquiry) for both PDFs' details. The archived PDF is pinned by SHA-256 (`2be8c438…82cc4`).
- **Covers:** The Executive Summary only — a 150-page digest of the Inquiry's findings. The full report runs to 12 further volumes, plus separate volumes of contemporaneous records and media transcripts, roughly 2.6 million words in total. Whether and how to ingest any of that is a separate scoping decision, tracked in `reportsthatmatter-0a7`.
- **Size:** 150 PDF pages (148 carry text); roughly 61,000 words and 283 footnotes, all linked to a marker in the text. Page numbers on this site are the report's printed page numbers, which run four lower than the PDF's own (printed page 6 is PDF page 10).
- **Human corrections applied:** 8, all the same kind — see below.
- **Flagged for human review:** 34 places where the scan may have been misread (7 digits inside words such as postcodes and sums of money, 27 possible "rn"/"m" confusions). Every one was checked by eye against the PDF for this report and reads correctly as printed; none has been formally judged in `corrections.yaml` yet.

## How the text was read

- **Running heads.** The Executive Summary alternates "The Report of the Iraq Inquiry" (verso) and "Executive Summary" (recto) at the top of each page, with a bare page number beneath. Both are stripped as repeated page furniture.
- **Quotations.** Cabinet papers, telegrams and Inquiry correspondence are quoted at four columns in from the body — the same depth as the Bloody Sunday Inquiry's report.
- **Paragraphs.** Numbered "19.", "104." paragraphs, continuous through the whole Executive Summary (never restarting).
- **Headings.** The Executive Summary opens with a single front contents (pp. 1–3) listing every section and subsection to a page number, rather than a contents at each chapter's start (Bloody Sunday) or a numbered-section scheme (the 9/11 Commission Report). A heading stands only if that contents names it. 75 of its entries carry no capital, number or "Part"/"Chapter" label of their own ("UK policy before 9/11"), so nothing about their shape says they are headings; `unmarkedHeadings` reads one anyway, wherever the line matches a contents entry letter for letter and the line before it, on the same page, ends cleanly. `recoverListedHeadings` extends that to the cases it leaves: a heading that opens a PDF page (accepted when it starts with a capital, ends on no stop and is followed by a numbered paragraph or another listed heading, so a sentence tail such as "reconstruction." is still refused), a heading after a line ending on a footnote marker, a title the body sets over two lines, and a caps title ending in a number ("…RESOLUTION 1483"). All 88 contents entries now come out as headings. Two nested bulleted lists (p. 89, p. 111) set their second-level bullet in a font this PDF's text layer maps to `{{` rather than a bullet glyph — visible because the first-level bullets around them extract correctly as `•`. All 8 are corrected to `•` in `corrections.yaml`.

## Known limitations

- **Footnote markers are not linked in the text.** The Executive Summary's 283 notes are printed at the foot of each page, but the markers in the body are bare digits set flush against the word before them ("…UK dossier on Iraq's WMD programme.47", "…nine positive votes98"), which the pipeline does not link. The notes are all kept, listed at the end under "Notes not linked in the text", but 280 of 283 carry no link from the passage they annotate. Tracked in `reportsthatmatter-b94`.
- **No photographs, maps or figures.** Unlike the full report, the Executive Summary's own text does not appear to reference or rely on any embedded image, so this is a limitation of the edition rather than something missing from this reading of it.
- **Scope.** Only the Executive Summary is ingested; the Inquiry's twelve further volumes of detailed findings are not. See `reportsthatmatter-0a7`.

## Reporting a problem

If the text here differs from the printed report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/uk-chilcot-inquiry/issues) with the page number and the passage. A confirmed fix is recorded as a correction, which is applied on every rebuild.
