# Reference editions: independent clean texts to score the pipeline against

Research for bead reportsthatmatter-38s.1 (epic 38s, "Get better faster"). Date: 2026-10-02. Research only: no pipeline change, no release. Samples were downloaded to a scratch directory and are not in git; section 8 says how to fetch each one. The small prototype scripts used for the measurements are in `docs/design/reference-editions/tools/`.

## 1. Summary

Of the 13 live reports, **five** have a clean independent edition that is the same text as our PDF, and **five more** have a tagged PDF whose structure tree gives headings, paragraphs and footnotes straight from the publisher's layout. Three have nothing better than the PDF we already ingest, and one has a clean edition of a different document.

| report | best reference | format | usefulness 1-5 | use as source? | tagged PDF |
|---|---|---|---|---|---|
| us-911-commission | Commission archive, one HTML file per chapter plus Notes (UNT/NARA CyberCemetery) | HTML | **5** | yes (hybrid) | no |
| uk-saville-inquiry | Inquiry website HTML, volumes 1-10 (UKGWA; Wayback copy fetched) | HTML | **5** | yes (hybrid) | no |
| us-v-philip-morris | Caselaw Access Project (static.case.law) / CourtListener, 449 F. Supp. 2d 1 | HTML/JSON | **4** | partly | no |
| uk-hillsborough-panel | The PDF's own structure tree; the panel website HTML (Wayback) as cross-check | tagged PDF + HTML | **4** | yes (tags) | **yes** |
| us-duelfer-report (queued) | CIA reading-room site, chapters 1-6 (Wayback copy) | HTML | **4** | yes | no |
| columbia-accident | The PDF's own structure tree (InDesign styles) | tagged PDF | 3 | partly | **yes** |
| uk-chilcot-inquiry | The PDFs' own structure trees (executive summary and every section PDF) | tagged PDF | 3 | partly | **yes** |
| uk-leveson-inquiry | The PDFs' own structure trees (volume I sampled) | tagged PDF | 3 | partly | **yes** |
| litvinenko-inquiry | The PDF's own structure tree | tagged PDF | 2 | no | **yes** |
| jack-smith-vol1 | none (DOJ PDF only; its tags are OCR-generated) | PDF | 1 | no | yes (weak) |
| us-psi-financial-crisis | none (govinfo hearing text omits the report: images only) | none | 1 | no | no |
| challenger-accident | none for this document (NASA's HTML is the Rogers Commission report, a different text) | none | 1 | no | no |
| us-deepwater-horizon | none (GPO and commission PDFs only) | none | 1 | no | no |
| us-lehman-examiner (and queued Valukas volumes) | none (Jenner PDFs only) | none | 1 | no | no |

The scale used: 5 = same text as our PDF, full coverage, paragraph numbers, footnotes and headings explicit, easy to fetch and reuse. 4 = same text and structure but a caveat (version risk, OCR noise, coverage of part, only available through a web archive). 3 = structure only, from the PDF's tags, with known gaps. 2 = tags give little beyond paragraphs. 1 = nothing independent.

Headline findings:

- Alignment is easy where an edition exists. Against the 9/11 HTML, 99.7% of our paragraphs (40 words or more) find an anchor, character similarity of aligned paragraphs is 96-99%, and only 0.16% of our body tokens are outside the reference vocabulary.
- A first alignment already finds defects our signals miss: on 9/11 it reports 195 spurious paragraph starts (our page-break splits) and 960 reference paragraph boundaries we do not reproduce; on Saville 183 and 1,262. It also found a drop-cap defect no check catches (`Tue sday, Se ptembe r 11,[^20] 01`, the opening paragraph of 9/11 chapter 1).
- The publisher's own tags are a free, independent structure for six of the PDFs, and for two of them (Hillsborough and, partly, Chilcot) they carry real paragraph numbers, heading levels and footnotes. Tags attach to the very file we ingest, so there is no version risk and the page number of every element is known.
- Two sources are fragile: the UK Government Web Archive (UKGWA) answers scripted requests with an AWS WAF "Human Verification" page (HTTP 405), and the Wayback Machine refuses connections under load. Anything we depend on must be copied locally once, under its licence.

## 2. Why this matters for "use the clean text as the source"

Rufus asked: if we have clean texts, why clean the PDFs? The answer per report is in the "use as source?" column above and in section 3. The design is a hybrid.

### 2.1 Hybrid design: clean text for structure, the PDF for page anchors and fidelity

*Built as `cleanEdition` in @rtm/ingest (reportsthatmatter-ivg.1, piloted on us-911-commission): see the library README, "A clean edition as the source", and the report repo's `PROCESSING.md` for the measurements.*

1. **Structure and text come from the clean edition.** Paragraph boundaries, heading levels, paragraph numbers, block quotes, tables and footnotes are authored in the HTML (or tags), so the whole severed-paragraph, furniture, contents-without-heading and bare-footnote-marker families disappear for that report.
2. **Page anchors come from the PDF.** Our readers cite printed page numbers, which none of the HTML editions carry (9/11 HTML: none; Saville HTML: paragraph numbers only; Hillsborough website: "page 3 of 11" web pages; CAP: reporter star pages, not the PDF's). The PDF text layer is the same words, so we align the clean words to the PDF's per-page word stream (the same monotone anchor alignment as the scorer, `tools/pbound2.py`) and stamp each paragraph with the printed page it starts on. Where the HTML and PDF disagree in more than a few words, that is flagged, not silently resolved.
3. **The PDF stays as the fidelity check.** Every build compares the clean text with the PDF text layer: containment, out-of-vocabulary tokens, missing paragraphs. This is also the only guard against a clean edition that is a different version (see Philip Morris, below).
4. **Provenance.** The report repo records both artefacts, each with its SHA-256, the licence of each, and the date it was fetched. The PDF stays the canonical citation target.

### 2.2 The trade-off, and the shadow run

A report served from its clean edition loses that edition as an independent score reference. It does not lose its value as labelled data: we keep running the PDF ingest on it as a shadow, scored against the clean text. That tells us which conversion decisions fail and what to look for in PDF-only reports (38s.8). So the six references are best treated as a labelled training and evaluation set for the PDF pipeline first, and as a served source second. Section 7 proposes the development and held-out split.

### 2.3 How much of the cleaning defect load a clean source removes

Counts are `pnpm quality report` (b78.2), summing the PDF-cleaning families (severed-into-quote, severed-paragraph, bare-footnote-marker, note-text-in-body, furniture-paragraph, contents-entry-without-heading, heading-*, printed-page-reversal, rendered-h1; the advisory capital signal is excluded). The last column is what a clean source would remove.

| report | defect count | dominant classes | removed by a clean source |
|---|---:|---|---|
| uk-leveson-inquiry | 8,320 | bare-footnote-marker 6,456; contents-entry 1,233; severed-into-quote 408 | no clean source; tags would help headings only |
| us-deepwater-horizon | 1,368 | bare-footnote-marker 1,021; note-text-in-body 269 | no clean source |
| challenger-accident | 804 | furniture 372; bare-footnote-marker 119; severed-into-quote 97 | no clean source (scan) |
| litvinenko-inquiry | 484 | severed-paragraph 139; severed-into-quote 103; bare marker 92 | tags: partly |
| columbia-accident | 495 | bare marker 179; severed-paragraph 74; furniture 75 | tags: markers still bare, notes separated |
| us-v-philip-morris | 482 | severed-into-quote 248; note-text-in-body 48; heading-long 60 | most, if the CAP version matches |
| uk-hillsborough-panel | 478 | bare-footnote-marker 453; severed-into-quote 20 | tags and HTML footnote links: nearly all |
| uk-saville-inquiry | 266 | contents-entry 191; severed-into-quote 23; note-text-in-body 16 | nearly all |
| uk-chilcot-inquiry | 203 | bare-footnote-marker 185; severed-into-quote 12 | tags: most |
| lehman-examiner | 157 | severed-paragraph 22; heading-long 34; contents 46 | no clean source |
| us-psi-financial-crisis | 122 | severed-into-quote 44; severed-paragraph 41; bare marker 16 | no clean source |
| us-911-commission | 53 | contents 12; severed-into-quote 35 | nearly all, plus the classes the signals do not see (below) |
| jack-smith-vol1 | 29 | contents 9; note-text-in-body 9 | no clean source |

The signal counts under-state the benefit for 9/11: its count is the smallest of all, yet the reference alignment shows 195 spurious paragraph starts and a drop-cap defect. The signals only find shapes we already know; the reference finds the rest.

## 3. Per-report findings

Source PDF identities (SHA-256 prefix, pages, `pdfinfo` Tagged) are in section 4. Licences: US federal works are public domain; UK inquiry reports are Crown copyright and are published on gov.uk under the Open Government Licence v3.0 (the gov.uk site-wide licence; the original inquiry sites carry Crown copyright, so confirm before redistributing a derived edition).

### 3.1 us-911-commission (score 5; use as source: yes, hybrid)

| field | finding |
|---|---|
| best reference | The Commission's own HTML in the UNT CyberCemetery archive: `https://govinfo.library.unt.edu/911/report/911Report_{Exec,FM,Pref,Ch1..Ch13,App,Notes}.htm` (index: `.../911/report/index.htm`). Same site also serves the per-chapter PDFs and the full `911Report.pdf` we ingest. |
| alternatives | `govinfo.gov/content/pkg/GPO-911REPORT/pdf/GPO-911REPORT.pdf` (PDF only; the govinfo html/xml endpoints return the error page). |
| format, licence | Hand-authored HTML 4 (`<p>`, `<h2>`, `<h4>`, `<sup>`). Public domain (US government). |
| coverage | Whole report: executive summary, front matter, preface, chapters 1-13, appendix, notes. 210,339 words excluding notes. |
| structure | Chapter titles `h2`, section headings `h4` ("1.1 Inside the Four Flights"), one `<p>` per paragraph, bold run-in headings, footnote markers as `<sup>N</sup>`. Endnotes in `Notes.htm`, one `h2` per chapter and numbered paragraphs 1..n (1,863 `<p>` elements; ours has 1,749 definitions). The marker-to-note link is positional (marker N under chapter C is note N under that chapter's heading), not an anchor, but it is deterministic. No printed page numbers. |
| match with our full.md | 99.7% of our paragraphs (40+ words) have an anchor; six sampled paragraphs aligned at 96.3-98.9% character similarity; 6-gram containment: 93.9% of the reference is in ours (the 6% gap is our defects), 64.9% of ours is in the reference (our endnotes and front matter are not in the body files). Only 329 of 201,052 body tokens (0.16%) are outside the reference vocabulary. |
| same text as the PDF? | Yes by the alignment above (the Commission published both). Not checked: whether the later W. W. Norton "authorized edition" differs; it is not ours. |
| flaws | Archive banner and navigation tables around every file (strip with the content table); a few `<p><h4>` malformed nestings (parse with a tolerant parser); page numbers absent. |
| defects it exposes | Page-break severed paragraphs (195 spurious starts, e.g. "had received a simulator schedule to train from / august 13 through august 20 ..."); 960 reference boundaries we do not reproduce (some are headings counted as paragraphs in this first pass, some genuinely merged); the opening paragraph's drop-cap loss. |

### 3.2 uk-saville-inquiry (score 5; use as source: yes, hybrid)

| field | finding |
|---|---|
| best reference | The Inquiry's report website, `report.bloody-sunday-inquiry.org/volume01/chapter001/` ... `chapter009/`, plus `general-introduction/` and `glossary/`; volumes 02-10 follow the same pattern (chapter list: `https://cain.ulster.ac.uk/events/bsunday/inquiryreport.htm`). Hosted now at `webarchive.nationalarchives.gov.uk/20101103103930/http://report.bloody-sunday-inquiry.org/`. |
| fetchability | UKGWA returns the AWS WAF "Human Verification" page (HTTP 405) to curl, so the fetched copies came from the Wayback Machine (`web.archive.org/web/2011/http://report.bloody-sunday-inquiry.org/volume01/chapterNNN/`). |
| format, licence | Server-generated HTML with semantic class names (`maintextnu` numbered paragraph, `ahead`, `bhead-now-c`, `chead-now-d`, `x-contents-*`). Crown copyright / OGL. |
| coverage | Volume I chapters 1-9 fetched (general introduction and glossary failed to download under Wayback load; refetch). Every volume is available in the same form. 164,001 words in the nine chapters fetched. |
| structure | Paragraph numbers explicit in text ("3.71 It was submitted ..."), chapter and section headings by class, contents blocks, block quotes. Footnotes: marker `<sup>`, note text in `<p class="inparaendnotes...">` immediately after the paragraph with the footnote number, a `<span class="footnote">` for the text and an evidence hyperlink (e.g. `G0.pdf#page=11`) for the source. Footnote-to-paragraph pairing is therefore explicit, and so are the evidence links. No PDF page numbers. |
| match with our full.md | 96.2% of our paragraphs have an anchor; six samples 95.8-99.5% (one block quote 32.6%, an alignment artefact: the quote text repeats elsewhere); 6-gram containment 88.6% of the reference in ours, 84.5% of ours in the reference (our front matter and the chapters/glossary not fetched). Our boundary precision is 93.8% (183 spurious paragraph starts), recall 70.2% (heading and footnote paragraphs not yet separated). |
| same text as the PDF? | Both are TSO products of 15 June 2010 (HC 29-I and the Inquiry website). The alignment says yes; the chapter-level differences (corrections issued after publication) were not checked. |
| flaws | Site pages carry wrapper navigation; `class="styleoff"` spans; the 1 MB chapter 9 page is the whole chapter in one file (good for us). Single points of failure: UKGWA WAF and Wayback load. |

### 3.3 us-v-philip-morris (score 4; use as source: partly)

| field | finding |
|---|---|
| best reference | Caselaw Access Project: `https://static.case.law/f-supp-2d/449/cases/0001-01.json` (and `.../html/0001-01.html`), 449 F. Supp. 2d 1 (D.D.C. 17 Aug 2006). CourtListener has the same text (cluster 2509111, via `https://www.courtlistener.com/api/rest/v4/search/?q=...`). Justia returns 403 to scripts. |
| format, licence | Per-case JSON (`casebody.opinions[0].text`) and HTML with `data-blocks` coordinates and page labels. CAP data and the underlying opinion are public domain (no use restrictions at static.case.law). |
| coverage | Whole opinion, reporter pages 1-987. 531,006 words (CAP) against 507,234 words of ours. |
| structure | Parties, court and date as head matter; paragraphs; star pagination (`*15`, `*16` ...) as `page-label` anchors, giving the West reporter page of every passage; 94 footnotes with explicit two-way links (`<a class="footnotemark" href="#footnote_1_1" id="ref_footnote_1_1">`, `<aside class="footnote" id="footnote_1_1">`), the best footnote linking of any reference found. Our full.md has 56 footnote definitions against CAP's 94, a gap the scorer should explain (the amended opinion may have dropped notes, or we lost some). Findings are numbered ("878\. In another study ..."). |
| match with our full.md | 99.7% of our paragraphs find an anchor; sampled paragraphs align at 91-98% (and one repeated-boilerplate mis-anchor at 27%, a lesson for the scorer: align globally and monotonically, not by first anchor). 6-gram containment is only 88.4% / 85.3% each way, so about 12-15% of the words differ. |
| same text as the PDF? | **Not guaranteed.** Our PDF is docket document 5750, the amended opinion filed 8 September 2006 (1,682 pages). The reporter prints the 17 August 2006 opinion with corrections; `449 F. Supp. 2d 988` is a separate order dated 28 September 2006. The gap between the two (CAP reports a mean OCR confidence of 0.664 for the case, so noise is also present) must be separated into OCR noise, version differences and our own defects before this becomes a source. |
| flaws | OCR from a library scan of the print reporter (Harvard), so character errors in tables and figures; reporter pagination is not the PDF's pagination; no coverage guarantee for the amended passages. |
| defects it exposes | 248 `severed-into-quote` and 158 advisory capital signals: the reference lets us score block-quote boundaries directly. |

### 3.4 uk-hillsborough-panel (score 4; use as source: yes, via the PDF's tags)

| field | finding |
|---|---|
| best reference | The source PDF's own structure tree (below), cross-checked with the panel's website HTML (`hillsborough.independent.gov.uk/report/main-section/part-2/chapter-1/page-1/` etc., Wayback `20131210101206` snapshot; the site is no longer live and UKGWA's copy is WAF-blocked). |
| tagged PDF | **Yes.** 779 `/P`, 194 `/H3`, 155 `/H2`, 23 `/H1` (role-mapped InDesign styles), 28 `/Part`, 12 figures. Producer Adobe PDF Library 9.9. |
| coverage | Whole report (389 pages). Website HTML: summary, parts 1-3, chapters, as ~100 numbered web pages; 39 pages fetched for the sample. |
| structure | Tags: headings with levels, numbered paragraphs ("1.66 The 1988 match passed ..."), per-element page number. The panel's own paragraph numbering is in the text. Website: headings and paragraphs; footnotes are links to the disclosed documents ("click on the relevant footnote"), the only footnote-to-document linking found for a UK report. |
| match with our full.md | Tagged text vs ours: 97.1% of ours in the tags, 97.6% of the tags in ours; 100% of our paragraphs find an anchor; samples 93.6-98.7%. Website sample (39 of about 74 fetched pages): 96.4% of its words are in ours. |
| same text as the PDF? | Tags: identical by construction. Website: its paragraph numbering ("2.1.1" in chapter 1) was not reconciled with the PDF's, and it is reachable only through Wayback, so the website is a cross-check, not a source. |
| flaws | The tag tree puts every page-bottom fragment in its own `/P` (0 of 779 paragraph elements span pages), so a paragraph that continues over a page break appears as two elements: the tags do not solve the severed-paragraph problem, they only measure it. Footnotes are plain `/P`; no explicit marker links. |

### 3.5 us-duelfer-report (queued; score 4; use as source: yes)

| field | finding |
|---|---|
| best reference | CIA reading-room site: `https://www.cia.gov/library/reports/general-reports-1/iraq_wmd_2004/{chap1..chap6,contents,glossary,acknowledgements}.html` (Wayback `20110202012150`; the cia.gov URL now returns 404). |
| format, licence | HTML with `h3` headings, `a name` section anchors and real tables. US government work (public domain). |
| coverage | Chapters 1-6 of the Comprehensive Report (all three volumes). Volume 1 (our PDF) is chapters 1 and 2; chapters 1-4 were fetched, 5-6 failed under load. |
| structure | Headings, paragraphs, tables, figures; footnote-free except table notes (`<sup>a</sup>`). |
| match | Chapters 1-2 against our unreleased `rtm-duelfer` full.md: 92.1% of the reference is in ours; 68% of our paragraphs find an anchor (our full.md also holds the key findings, annexes and the notes the HTML omits, so this figure under-states). |
| tagged PDF | No (Apogee Series3 Pilot, untagged). |
| value | Blind test set: the pipeline has not been tuned on it. |

### 3.6 columbia-accident (score 3; partly)

| field | finding |
|---|---|
| best reference | The PDF's tag tree. NASA's `nasa.gov/columbia/home/CAIB_Vol1.html` and `caib.nasa.gov` link to the same PDFs (and, per chapter, PDFs); there is no HTML edition. |
| tagged PDF | **Yes** (Adobe PDF Library 5.0, InDesign styles, role-mapped): 4,258 `Body`, 1,080 `Body_-_Sidebar`, 555 `Heading_3`, 192 `Heading_2`, 39 `Heading_1`, 544 `Caption`, 375 `note`, 365 `Recommendations`, 41 `Part`, tables with `TR`/`TD`. |
| match | Tagged text vs ours: 85.3% of the tags in ours, 74.6% of ours in the tags; 89.2% of our paragraphs find an anchor; samples 98.1-99.7%. |
| structure | Heading levels, sidebars, captions, recommendation blocks, 375 notes as separate elements. 82 of 1,367 body elements span pages, so tags do join some page-break paragraphs. Soft hyphens remain in text ("reso-lution"). |
| flaws | About a quarter of our text is not in the tags (figures, tables, parts of the front matter); the style names are role-mapped to `/P` so a heading is distinguishable only by the custom style name (read `Heading_3`, not `H3`). |

### 3.7 uk-chilcot-inquiry (score 3; partly)

| field | finding |
|---|---|
| best reference | The PDFs' structure trees. The report is published as PDFs only (executive summary and about 40 section PDFs, volumes 1-12, on `iraqinquiry.org.uk/the-report/`, Wayback `20170106112536`; UKGWA's copy is WAF-blocked). Checked: the executive summary and section 1.1 (`section-11.pdf`) are both tagged. |
| tagged PDF | **Yes** (Adobe PDF Library 11.0, InDesign styles, role-mapped): `LI` with `Lbl` (the paragraph number) and `LBody` (937 paragraphs in the executive summary), `Heading_C/D/E` plus `H1`, `Quoted_Text`, `Box_*`, and footnotes as `Reference` (marker) and `Note` (text), 283 in the executive summary. |
| match | Tagged text vs ours: 85.2% of the tags in ours, **65.0% of ours in the tags**; 88% of our paragraphs find an anchor. The shortfall is the tag tree itself: text marked up as names and links is not in marked content (page 30: `Sirthat there was ...` for "Sir Jeremy Greenstock reported that ..."), so tags give roughly 85% of the words. |
| structure | Real paragraph numbers as separate `Lbl` elements; footnotes as paired `Reference`/`Note` elements; heading levels by style. 25 of 954 paragraphs span pages. |
| flaws | Names missing from marked content (see above): a source needs the tags for structure and the text layer for words. |

### 3.8 uk-leveson-inquiry (score 3; partly)

| field | finding |
|---|---|
| best reference | The four volume PDFs' structure trees (`0780_i.pdf` to `0780_iv.pdf`; official-documents.gov.uk, now `assets.publishing.service.gov.uk`). No HTML or Word edition was found: the report is PDF-only on gov.uk, the National Archives copy of the Inquiry site, and the official-documents page; `discoverleveson.com` is a third-party index. |
| tagged PDF | **Yes** (all four volumes; volume I sampled): 671 `/P`, 277 `/H3`, 23 `/H2`, 7 `/H1`, 7 tables with `TH`/`TD`, 7 figures. No role map. |
| match | Volume I only (253,112 words against our 1.07 M for four volumes): 91.5% of the volume I tags are in our text; 0 of 671 paragraph elements span pages. |
| structure | Heading levels, paragraph numbers in text; footnotes are plain `/P` and no `Link` annotations exist, so markers stay unlinked (6,456 `bare-footnote-marker`, our largest defect load). |
| flaws | Tags give headings (which the 1,233 `contents-entry-without-heading` and the heading checks need) but not the footnote linking. Volumes II-IV not checked. |

### 3.9 litvinenko-inquiry (score 2; no)

| field | finding |
|---|---|
| best reference | The PDF's tags. The report is PDF-only: `litvinenkoinquiry.org/files/Litvinenko-Inquiry-Report-{web,print}-version.pdf` and the gov.uk attachment we ingest (HC 695). The inquiry site (Wayback `20170130033218`) offers a web-optimised and a print-ready PDF of the same text, an easy two-rendition consistency check. |
| tagged PDF | **Yes** (Adobe PDF Library 11.0): 2,775 `/P`, 290 `/LI` with `Lbl`/`LBody` (footnotes), 8 `H1`, 8 `H2`, tables, 1,373 `Link`. |
| match | 91.9% of the tags in ours, 86.9% of ours in the tags; 98.1% of our paragraphs anchor; samples 95.1-99.1%. |
| structure | Only 16 headings in the tree. Paragraphs are split across elements at line and page breaks. Footnote markers are not linked internally, but every footnote is an external hyperlink to the cited document (`litvinenkoinquiry.org/files/HMG000308x.pdf`), which could be preserved. |
| flaws | Little structure beyond paragraphs; the print version differs in pagination. |

### 3.10 jack-smith-vol1, us-psi-financial-crisis, challenger-accident, us-deepwater-horizon, us-lehman-examiner (score 1)

| report | what was found | tagged |
|---|---|---|
| jack-smith-vol1 | DOJ PDF only (`justice.gov/storage/Report-of-Special-Counsel-Smith-Volume-1-January-2025.pdf`). The PDF is a scan processed with Acrobat Paper Capture, so the tags are generated from OCR: 1,433 `/P`, 9 `/H4`, three other headings, footnotes as `/P`. Agreement with our text is 92% both ways but not independent (same OCR text layer). No other edition was found. | yes (OCR-derived, weak) |
| us-psi-financial-crisis | govinfo hearing record CHRG-112shrg66051 etc. (Senate Hearing 112-675 parts and volumes) holds the report only as 1,500+ `[GRAPHIC] [TIFF OMITTED]` page images; no text. The report PDF on hsgac.senate.gov is the same PDF as ours. | no |
| challenger-accident | govinfo `GPO-CRPT-99hrpt1016` has the House Committee on Science and Technology report as a scan (PDF only; html/xml endpoints return the error page). NASA hosts a clean HTML edition (`nasa.gov/history/rogersrep/genindex.htm`, `v1ch1.htm` ...) but of the Rogers Commission report, a different document: 6-gram containment with our text is 2.6% and 3.6%, 6.4% of paragraphs. It is a useful clean sample of 1986 shuttle prose but not a reference for ours. | no |
| us-deepwater-horizon | govinfo `GPO-OILCOMMISSION/pdf/GPO-OILCOMMISSION.pdf` and the commission's chapter PDFs (Wayback of `oilspillcommission.gov/final-report`); no HTML or XML. | no |
| us-lehman-examiner (and queued Valukas volumes) | Jenner & Block's `lehmanreport.jenner.com` (Wayback) offers nine volume PDFs only; their footnotes hyperlink to over 8,000 cited documents (a footnote-link source we could keep, but only from the PDFs). Volumes 1 and 3 are untagged but born-digital (Word through PScript5 and Distiller; embedded Palatino fonts, no page images), so their text layer is exact (corrected by zphc, see `docs/research/better-source-texts.md`). | no |

### 3.11 Queued: Chilcot volumes

The 12 volumes are separate section PDFs (`the-report-of-the-iraq-inquiry_section-NN.pdf`), all from the same InDesign pipeline as the executive summary; `section-11.pdf` (166 pages) was checked and has the same tag vocabulary (`LI`/`Lbl`/`LBody`, `Footnote`/`Reference`/`Note`, `Heading_A..E`). Treat the tags as the reference for every volume.

## 4. Source PDF identities and the tagged-PDF check

`pdfinfo` "Tagged" for every source PDF in the sibling repos' `archive/` (SHA-256 prefix from the repo's `ingest.ts`/file):

| report | file | pages | SHA-256 | Tagged | what the tree gives |
|---|---|---:|---|---|---|
| jack-smith-vol1 | Report-of-Special-Counsel-Smith-Volume-1-January-2025.pdf | 174 | d0d26b1ff6fb | yes | OCR-generated: `P` 1433, `H1-H5` 12, `TOCI`, `Link`; weak |
| us-psi-financial-crisis | PSI REPORT ... (FINAL 5-10-11).pdf (+ four CHRG volumes) | 646 | 3dec3dfa6938 | no | none |
| challenger-accident | GPO-CRPT-99hrpt1016-challenger-accident-1986.pdf | 450 | eb04493120fe | no | scan |
| litvinenko-inquiry | The-Litvinenko-Inquiry-H-C-695-web.pdf | 329 | 236c70da1823 | yes | `P`, `LI/Lbl/LBody`, `H1/H2` (16), `Link`; paragraphs split at lines |
| uk-leveson-inquiry | 0780_i.pdf, _ii, _iii, _iv | 445 / 571 / 492 / 515 | b7f26f7cc27f (vol I) | yes | `H1-H3`, `P`, tables; footnotes plain `P` |
| columbia-accident | CAIB_lowres_full.pdf | 248 | 7b95608d7cbf | yes | `Heading_1-3`, `Body`, `note`, `Caption`, `Body_-_Sidebar`, `Recommendations` |
| us-911-commission | 911Report.pdf | 585 | 6fa7e90a750a | no | none |
| us-deepwater-horizon | deep-water.pdf | 398 | f0a242909914 | no | none |
| us-v-philip-morris | final-opinion.pdf | 1,682 | 45b74f67a415 | no | none (docket document 5750) |
| uk-hillsborough-panel | hillsborough-panel-report.pdf | 389 | 8dbea5f6fa8c | yes | `H1-H3`, `P` with numbers; no footnote structure |
| uk-saville-inquiry | bloody-sunday-inquiry-vol1-hc29-i.pdf | 493 | f979d05c5472 | no | none |
| uk-chilcot-inquiry | the-report-of-the-iraq-inquiry-executive-summary.pdf | 150 | 2be8c4385850 | yes | `LI/Lbl/LBody`, `Footnote/Reference/Note`, `Heading_C-E`, `H1`; names missing |
| us-lehman-examiner | valukas-report-volume-1.pdf (+ -body, volume 3, -body) | 239 / 196 / 336 / 327 | ff68a50a00cf (vol 1) | no | none |
| us-duelfer-report (queued) | duelfer-report-vol1.pdf | 453 | a62d23e5107b | no | none |

How the structure trees were read: `tools/sttree_summary.py` (pikepdf: counts of structure types and the `RoleMap`) and `tools/ttfull.py` (pikepdf walks the tree; pdfplumber supplies the characters keyed by marked-content id; output is one record per element with its tag, page set and text). On a handful of pages the output was read directly. Only the six PDFs from InDesign (or Acrobat OCR) pipelines are tagged; the older Distiller and Pilot outputs are not, and tagging is the exception for scans and court documents.

Which tags matter in practice: paragraph, heading level, list label (paragraph number), footnote/reference pairing (Chilcot only), sidebars and captions (Columbia). What tags do not give: footnote marker links (no internal `GoTo` link annotations exist in any of the tagged PDFs sampled; Litvinenko's links are external URLs to evidence), reliable paragraph joins across page breaks (0 of 779 in Hillsborough, 0 of 671 in Leveson, 82 of 1,367 in Columbia, 25 of 954 in Chilcot), and complete text (Chilcot omits roughly 15% of words from marked content).

## 5. What a sample alignment looked like

The prototype (`tools/align.py`, `tools/pbound2.py`) is deliberately small:

1. Normalise both texts to lowercase alphanumeric words (footnote markers dropped).
2. Measure 6-gram containment both ways (coverage and extras).
3. For paragraph metrics, take 7-grams that occur exactly once in each text, order them with a longest-increasing-subsequence over the reference positions (a patience-diff skeleton), and map every paragraph start of ours to a reference word offset by interpolation from the nearest anchor.
4. Compare boundaries within four words: reference boundaries we do not reproduce (merged or dropped paragraphs) and our paragraph starts that are not reference boundaries (spurious splits).

Results on the two HTML editions:

| edition | anchors | reference paragraphs in span | ours | boundary recall | boundary precision | missing | spurious |
|---|---:|---:|---:|---:|---:|---:|---:|
| 9/11 HTML | 143,063 | 2,669 | 2,167 | 64.0% | 91.0% | 960 | 195 |
| Saville HTML | 135,674 | 4,236 | 2,955 | 70.2% | 93.8% | 1,262 | 183 |

Recall is lower than it will be once headings, footnote paragraphs and list items are matched to our block types (the first pass counts a reference heading as a paragraph we should have). Precision is the more trustworthy number. Spot checks on 9/11, eight random spurious starts, were all page-break severed sentences ("... and by / 9 11 there were 34", "... to san diego two weeks in los angeles / why hazmi and mihdhar came to california ..."), i.e. the metric finds the defect the `severed-paragraph` signal is meant to find, and finds more of them: the signal reports 4 for 9/11, the alignment 195. Eight random "missing" examples were headings, contents entries and our merged paragraphs.

An example the signals miss entirely (9/11, chapter 1, first paragraph):

- ours: `Tue sday, Se ptembe r 11,[^20] 01, dawned temperate and nearly cloudless in the eastern United States.`
- reference: `Tuesday, September 11, 2001, dawned temperate and nearly cloudless in the eastern United States.`

An out-of-vocabulary check (words in our body that never occur in the reference) finds 329 such tokens in 201,052 words on 9/11 (`sday`, `ptembe`, `chapte`, `exacer`, `afte`, `deci` ...): a cheap, general metric, cleaner than any regex we have.

## 6. Recommendation: the top three reports to prototype the alignment scorer (38s.2)

1. **us-911-commission.** Same text as the PDF (99.7% anchored), cleanly authored HTML, per-chapter endnotes keyed by number, no licence or availability risk (public domain, still on an archive that answers scripts). It is the easiest report to align and already exposes defect classes no signal sees. Build the scorer here first.
2. **uk-saville-inquiry.** HTML with explicit paragraph numbers and footnotes immediately after their paragraph, plus evidence links: it tests footnote pairing, numbered-paragraph recovery and heading levels. It is also the UK inquiry layout (shared with Chilcot, Hillsborough, Leveson, Litvinenko), so what we learn transfers to the largest group of PDF-only reports. Mirror it locally first (the source is WAF-blocked and the Wayback copy rate-limits).
3. **us-v-philip-morris.** The largest and hardest case: a court opinion of 1,682 pages, quote-heavy (248 severed-into-quote), with thousands of numbered findings and footnotes, and a reference with explicit two-way footnote links and reporter star pages. It stresses the scorer's robustness (OCR noise in the reference, a possibly different version, repeated boilerplate that breaks first-anchor alignment). Use it second, after the scorer works on the clean HTML.

Hillsborough (tagged PDF plus HTML, 97% containment) is the best fourth, and is a better validation of the tagged-PDF extractor than any other report.

### Ranking as labelled training and evaluation data for the PDF pipeline (38s.8)

Criteria: layout diversity, footnote heaviness, quotation heaviness, and how far the reference reaches (whole report versus structure only).

| rank | report | layout | footnotes | quotes | why |
|---|---|---|---|---|---|
| 1 | us-v-philip-morris | US court opinion, 1,682 pp, running heads, numbered findings | heavy, linked | very heavy | covers block quotes, numbered findings, footnote links in one document |
| 2 | uk-saville-inquiry | UK inquiry, numbered paragraphs, boxed evidence | heavy, paired | heavy | the UK inquiry layout, with explicit pairing to learn from |
| 3 | us-911-commission | US commission, endnotes by chapter | endnotes | medium | easy full coverage; the benchmark for regressions |
| 4 | uk-hillsborough-panel | UK panel, InDesign, tagged | footnotes (website links) | light | two independent references (tags and HTML) |
| 5 | us-duelfer-report | CIA report, tables and figures | almost none | light | different house style, tables; blind |
| 6 | columbia-accident | NASA board, sidebars, captions, e-mail blocks | notes | medium | structure only (tags), rich block types |
| 7 | uk-chilcot-inquiry | UK inquiry, numbered paragraphs, boxes | footnotes (paired tags) | heavy | structure only (tags) |
| 8 | uk-leveson-inquiry, litvinenko-inquiry | UK inquiry | very heavy | heavy | headings only (tags) |

### Proposed split

- **Development set (tune heuristics against these):** us-911-commission, uk-saville-inquiry, us-v-philip-morris.
- **Held-out test set (never tuned on; report scores only):** uk-hillsborough-panel (UK, tagged and HTML), us-duelfer-report (CIA, HTML; queued, so no pipeline decision has seen it), columbia-accident (NASA, tags) and uk-chilcot-inquiry (UK, tags with footnote pairs).
- **Target set (no reference; where the learning has to generalise):** jack-smith-vol1, us-psi-financial-crisis, challenger-accident, us-deepwater-horizon, us-lehman-examiner and, for footnotes, leveson and litvinenko. The synthetic benchmark (38s.4) and a vision-model gold set (38s.3) are the ways to label these.

## 7. Open points and risks

- **Version drift.** Each reference must be shown to be the same edition as the PDF before it is used as a source. Philip Morris is the open case (amended opinion filed 8 September 2006 versus the reporter text); Saville's post-publication corrections were not compared; 9/11's Norton edition is not ours.
- **Availability.** UKGWA blocks scripts (HTTP 405 with a WAF challenge); the Wayback Machine refuses connections under load and needed several retries and `https://`. Copy once, record the SHA-256 and the licence, keep the copy in the report repo's `archive/` as the PDF is.
- **Licences.** US federal works and court opinions are public domain. UK Crown copyright material is reusable under OGL v3.0 where published on gov.uk; the inquiry-site HTML (Saville, Hillsborough, Chilcot) should be treated as Crown copyright with the same OGL intent, to be confirmed before we redistribute a derived edition.
- **Not found.** No independent clean edition exists for Jack Smith, PSI, Challenger (House report), Deepwater, Lehman/Valukas, Leveson or Litvinenko beyond the tags; the next step for those is the vision-model gold pages (38s.3).
- **Limits of this research.** Hillsborough HTML was sampled (39 pages of about 74 fetched; the Wayback crawl was throttled), Saville's general introduction and glossary and Duelfer chapters 5-6 failed to download, Leveson volumes II-IV and Chilcot volumes beyond section 1.1 were not run through the tag extractor.

## 8. How to fetch the samples (nothing is committed)

Scratch directory: any temporary directory; the scripts in `docs/design/reference-editions/tools/` take paths from arguments or the `RTM_SITE` environment variable (the site repo root).

```
# 9/11: one file per chapter (public archive; plain curl works)
for c in Exec FM Pref Ch1 Ch2 Ch3 Ch4 Ch5 Ch6 Ch7 Ch8 Ch9 Ch10 Ch11 Ch12 Ch13 App Notes; do
  curl -sL -o 911_$c.htm https://govinfo.library.unt.edu/911/report/911Report_$c.htm; done

# Philip Morris: Caselaw Access Project (JSON has casebody.opinions[0].text; HTML has page labels and footnote links)
curl -sL -o pm.json  https://static.case.law/f-supp-2d/449/cases/0001-01.json
curl -sL -o pm.html  https://static.case.law/f-supp-2d/449/html/0001-01.html

# Saville: UKGWA blocks scripts; use the Wayback Machine over https, python urllib retries (tools/fetch.py)
python3 tools/fetch.py "https://web.archive.org/web/2011/http://report.bloody-sunday-inquiry.org/volume01/chapter001/=>ch001.html"   # ... chapter009, general-introduction, glossary

# Hillsborough website: breadth-first crawl of /report/ (tools/crawl_hills.py; slow, retries needed)
python3 tools/crawl_hills.py

# Duelfer: CIA site via Wayback
python3 tools/fetch.py "https://web.archive.org/web/20110202012150/https://www.cia.gov/library/reports/general-reports-1/iraq_wmd_2004/chap1.html=>chap1.html"   # chap2..chap6, contents

# Challenger sanity reference (different document): NASA's Rogers Commission report
curl -sL -o v1ch1.htm https://www.nasa.gov/history/rogersrep/v1ch1.htm   # v1ch2 ... v1ch9, v1recomm, v1appa, v1appc

# Chilcot section PDF (tag check)
python3 tools/fetch.py "https://web.archive.org/web/20170106112536id_/http://www.iraqinquiry.org.uk/media/247883/the-report-of-the-iraq-inquiry_section-11.pdf=>chilcot-s11.pdf"

# Tagged-PDF structure: summary and a full text dump keyed by element
python3 -m venv v && v/bin/pip install pikepdf pdfplumber rapidfuzz
v/bin/python tools/sttree_summary.py <pdf> 0
v/bin/python tools/ttfull.py <pdf> out.json

# Scorer prototype (from the site repo root)
RTM_SITE=. python3 tools/pbound2.py 911      # after fetching the 9/11 files into ref/911/
```

Note: `tools/` files are prototypes for 38s.2, not pipeline code. Nothing in this branch changes the ingest or the site.
