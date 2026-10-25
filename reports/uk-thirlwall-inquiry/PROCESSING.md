# Processing notes — Thirlwall Inquiry: Summary report

How the text on Reports that Matter was made, and where it still falls short of the printed page. Nothing has been rewritten. Where we know the text differs from the published report, this page says so.

*Last reviewed 25 October 2026.*

## The edition

- **Source:** the Summary report of the Report of the Public Inquiry into events at the Countess of Chester Hospital, 2015 to 2018 (HC 601, ISBN 978-1-5286-6790-6), by the Chair of the Thirlwall Inquiry, the Rt Hon. Lady Justice Thirlwall DBE, ordered to be printed on 15 September 2026: the Inquiry's accessible PDF, 76 A4 pages, SHA-256 `a1e1a50e…c2db2`, kept in the [report's repository](https://github.com/reportsthatmatter/uk-thirlwall-inquiry).
- **Licence:** Crown copyright 2026, reused under the Open Government Licence v3.0, as the imprint on the PDF's third page states.
- **Covers:** the Summary report only: Chapter 1 (Introduction), Chapter 2 (The babies), Chapter 3 (Concerns, reviews, errors) and Chapter 4 (Part Two, summaries of chapters 31 to 44 of Volume III). Volumes I to III are not here yet.
- **Size:** about 38,200 words; 433 numbered paragraphs.
- **Anonymised names** (Baby A, Mother A, Dr U and the like) are kept exactly as the report prints them.

## How the text was read

- **Born-digital, so the words are the PDF's own.** The text layer is clean; no OCR is involved. About 98% of the PDF's words are in the text here; the rest are the running heads on every page.
- **Page numbers** are the printed ones: roman on the contents (iii), arabic from the Introduction (1). A printed page is the PDF page less 5.
- **Paragraphs.** The report numbers its paragraphs in each chapter ("3.67"); each is one citable paragraph, with its number. All 433 are present, once each, in order (1.1 to 1.27, 2.1 to 2.153, 3.1 to 3.210, 4.1 to 4.43).
- **Page breaks.** A page that opens without a paragraph number continues the numbered paragraph above it, even after a full stop (four such pages, PDF pp.8, 10, 51 and 64). Scored against the PDF's own tag tree, 30 page breaks were checked by hand against the PDF: our text is wrong at 1 of 30, the tags at 2 (the cover and title pages).
- **Headings** are read from the typeface: the four chapter banners and the sub-headings. The tagged structure has 50 and 15 sub-headings at two levels; both are set in one face, so the text serves them at one level.
- **Checked against the Inquiry's HTML edition** in stage 1: no difference in wording, apart from the stray spaces inside about 60 words in the HTML.

## Known limitations

- **Two stacked sub-headings read as one**, and two headings that are only a year are lost or run into the paragraph below: "Context" and "The Countess" (PDF p.7), "Further reports" and "Dr Hawdon" (p.50), "2016" with "Thematic Review" (p.35; both read as one paragraph), and "2018" (p.66; the word is missing from the text). Bead reportsthatmatter-e9im.
- **Sub-headings are all at one level**, where the tags have two (15 at the lower level), and that level is served one deeper than printed (h4 under the chapter's h2), so that the site's sections are the four chapters; at the printed level the site's section split filed each chapter's opening under the section before. Bead reportsthatmatter-o1jj.
- **Chapter 4's title** is served as a sub-heading ("Part Two") rather than a chapter heading, and the contents' fourth entry is a heading of its own. The site's first section, which holds the cover pages, the contents and all of Chapter 1, is therefore headed "Contents"; Chapter 4's section is headed "Part Two". Bead reportsthatmatter-hy63.
- **Block quotations are served as paragraphs.** The tags mark 15 inset italic quotations (four in Chapter 2, eleven in Chapter 3); the pipeline reads none as a quotation, so their paragraphs are unnumbered and not set apart. Bead reportsthatmatter-vsd2.
- **The one footnote** (an asterisk note at the foot of printed p.39, to paragraph 3.67) stands as a paragraph beginning "*", unlinked from its marker. Bead reportsthatmatter-b1za.
- **Italics are not shown.** The report sets quoted evidence in italic; the text here does not carry italics.
- **Cover and imprint pages** are served as plain paragraphs before the contents.
