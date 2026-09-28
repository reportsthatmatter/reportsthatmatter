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
- **Headings.** The Executive Summary opens with a single front contents (pp. 1–3) listing every section and subsection to a page number, rather than a contents at each chapter's start (Bloody Sunday) or a numbered-section scheme (the 9/11 Commission Report). A heading stands only if that contents names it. 75 of its 88 entries carry no capital, number or "Part"/"Chapter" label of their own ("UK policy before 9/11"), so nothing about their shape says they are headings; `unmarkedHeadings` reads one anyway, wherever the line matches a contents entry letter for letter and the line before it, on the same page, ends cleanly. 69 of the 88 are recovered this way. Two nested bulleted lists (p. 89, p. 111) set their second-level bullet in a font this PDF's text layer maps to `{{` rather than a bullet glyph — visible because the first-level bullets around them extract correctly as `•`. All 8 are corrected to `•` in `corrections.yaml`.

## Known limitations

- **19 of the Executive Summary's 88 contents-listed headings are still not recovered.** `unmarkedHeadings` only matches a single physical line, and only where the page's own text before it ends cleanly — a heading opening a new PDF page has nothing on that page to check against, so it is conservatively left as running text rather than risk mistaking a sentence carried over from the page before for a heading (which happened, on this report, exactly once: "reconstruction.", the tail of a sentence wrapped from the previous page, coincides with a genuine heading elsewhere in the Executive Summary). A few titles also wrap over two lines ("The gap between the Permanent Members of the Security Council / widens", several of the Key Findings entries), which the pass does not join. One more ("The predicted increase in the threat to the UK as a result of military action in Iraq") is fused with the entry after it in the contents itself — see below. Tracked in `reportsthatmatter-ixe`.
- **One contents entry is fused with the next.** The entry "The predicted increase in the threat to the UK as a result of military action in Iraq" ends, like every entry, on its own page-number leader — in this case "47" — which the pipeline mistook for an inline footnote marker, rendering it as `[^47]` and running the entry into the one below it ("The UK's relationship with the US"). Also tracked in `reportsthatmatter-ixe`.
- **No photographs, maps or figures.** Unlike the full report, the Executive Summary's own text does not appear to reference or rely on any embedded image, so this is a limitation of the edition rather than something missing from this reading of it.
- **Scope.** Only the Executive Summary is ingested; the Inquiry's twelve further volumes of detailed findings are not. See `reportsthatmatter-0a7`.

## Reporting a problem

If the text here differs from the printed report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/uk-chilcot-inquiry/issues) with the page number and the passage. A confirmed fix is recorded as a correction, which is applied on every rebuild.
