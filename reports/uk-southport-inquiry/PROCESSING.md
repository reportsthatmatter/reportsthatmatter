# Processing notes — The Southport Inquiry: Phase 1 report, Volume 1

How the text on Reports that Matter was made, and where it still falls short of the printed page. Nothing has been rewritten. Where we know the text differs from the published report, this page says so.

*Last reviewed 25 October 2026 (reportsthatmatter-gqsy.15.3, evaluation; @rtm/ingest v0.33.0).*

## The edition

- **Text and structure:** the GOV.UK "accessible" HTML edition of Volume 1 (HC 1768-I), fetched from the GOV.UK content API on 25 October 2026. The raw record and its extracted body are kept in the [report's repository](https://github.com/reportsthatmatter/uk-southport-inquiry) under `reference/raw/`, the body pinned by SHA-256 (`f0e37690…5b15`).
- **Page numbers and checking:** the Inquiry's PDF, version 2 (268 pages, SHA-256 `c27fdbfc…c87bcf`), also kept in the repository. The PDF stays the canonical citation target: page numbers on this site are its printed folios (PDF page − 7; the cover, title, imprint and contents, PDF pp.1 to 7, carry none).
- **Superseded original:** the 13 April 2026 upload (267 pages, SHA-256 `91631b77…15afc`) was replaced by version 2 without a note on GOV.UK. A word-by-word comparison finds one difference, the cover page v2 adds. It is recorded here and not used.
- **Licence:** Crown copyright 2026, Open Government Licence v3.0.
- **Size:** about 95,600 words including the notes; 641 notes, every one linked to its marker; 696 numbered paragraphs (Foreword 12, Chapters 1 to 6: 68, 2, 102, 237, 216, 59), all present once and in order; 1,029 citable paragraph ids; 260 printed pages marked.

## How the text was made

- **Words.** From the HTML. Every word of it is matched to the same word in the PDF, in order (99.0% of the HTML's words find their place), and each block is given the printed page its first word is on. No word of the HTML is absent from the PDF.
- **Headings.** The HTML marks a chapter as "Chapter 3" over its title; they are served as one heading, "Chapter 3: The victims and the impact of the attack". Sections and subsections follow its h4 to h6. All 75 entries of the PDF's contents (pp.4 to 7) are headings here. One heading, "Child J Child S", is set by the HTML as one and by the PDF (and its contents) as two; it is served as two.
- **Numbered paragraphs.** Kept at the head of the text ("31. Following…"), numbered afresh in the Foreword and each chapter, as the report prints them. Numbered items inside a paragraph (the parts of an offence, a list of sections) and the numbered points inside a boxed recommendation are not paragraphs of the report and are served as a list or inside the box.
- **Paragraph breaks.** The HTML starts a new paragraph wherever the PDF has a forced line break inside one (Chapter 5, paragraph 32, PDF p.186: "...manufacture ricin. / He also ordered..."). The PDF's own tags (its structure tree, kept as `reference/blocks.jsonl`) mark each such stretch as one paragraph, and those are rejoined: 107 places, among them ten where the HTML broke a sentence in two. A paragraph that opens with a number or a list label is never joined.
- **Notes.** 641 page-foot notes in the PDF, 641 in the HTML's list, linked one to one. Twenty-five notes in the HTML sit on a heading (the section names in Chapter 3 and elsewhere); a marker cannot sit on a heading, so it is served at the end of the first paragraph that follows. Seven more sit on figure titles and stay on the caption.
- **Recommendations.** The report's boxed recommendations (24 in this volume) are served as quotations, each box one block.
- **Front matter.** The HTML carries the title page and imprint but not the contents or the PDF's note on the two volumes; those two stretches are taken from the PDF (pp.4 to 7).
- **The chronology** (Chapter 2) is one table of 201 rows in three columns (date, event, Inquiry reference). It is served as a table, split at each page turn so that the page markers can stand in it.

## How it was checked

- Seven golden pages (`golden.yaml`, PDF pp.8, 12, 20, 40, 121, 183, 186), each read against the page: all pass.
- Scored against the PDF's tags as a held-out reference: paragraph boundaries P 79.3% R 95.6%, headings P 100% R 94.4%, word error 1.3%. Of 30 page breaks adjudicated against the page (`reference/adjudicated.yaml`), ours is wrong on 2 and the tag reference on 12 (it splits the chronology's rows). The reference's notes carry no text, so its marker score says nothing.
- `pnpm quality check`: no severed sentences, no unlinked or stray note markers, no furniture in the text.

## Known limitations

- **Figures are not shown.** The volume has 22 figures (photographs, plans, maps, CCTV stills). They are not served; the captions are. Any words drawn inside them (labels on a plan, PDF p.116) are in the PDF only.
- **Chronology page anchors.** The third column of the table (the Inquiry references) is read by the PDF's layout in an order that does not match the HTML, so 186 short stretches of it are listed in `fidelity.md` as unmatched (all reported at the table's first page, PDF p.30), and some of the table's page markers sit a row or two off. The text is the HTML's (reportsthatmatter-mws2).
- **A passage on PDF p.236** (Chapter 5, after paragraph 191) is in a different order in the HTML and the PDF; it is listed in `fidelity.md` (reportsthatmatter-k2ro).
- **The chronology's header** is printed on every page of the table but shown here only on its first part; each later part (one per page) opens with a blank header row (reportsthatmatter-ucp9).
- **Emphasis in notes** is not shown.
- **Markers on headings.** Twenty-five note markers the HTML sets on a heading are served at the end of the next paragraph, a paragraph or so from where the PDF prints them.

## Reporting a problem

If the text here differs from the published report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/uk-southport-inquiry/issues) with the page number and the passage.
