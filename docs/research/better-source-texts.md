# Better than bad PDFs: where cleaner source texts come from, and how to get them

**Bead:** reportsthatmatter-zphc. **Date:** 2026-10-02. **Builds on:** [`reference-editions.md`](../design/reference-editions.md) (38s.1, the inventory of clean editions for the live reports), the hybrid-ingest epic reportsthatmatter-ivg, and [`2026-10-02-learning-from-aligned-pairs.md`](../design/2026-10-02-learning-from-aligned-pairs.md) (38s.8). **Experiment files:** [`better-source-texts/`](better-source-texts/). Research only: nothing here changes the pipeline or the site, and no request has been sent to anyone. The drafts in Appendix A are for Rufus to send.

## 1. The question

Reports that Matter turns long public reports into readable, searchable, citable web editions. Almost every report reaches us as a PDF, and most of the engineering effort so far has gone into getting a faithful text back out of those PDFs: rejoining paragraphs that a page break cut in two, telling a heading from a short sentence, separating footnotes from body text and linking them to their markers, dropping running heads and page numbers.

Rufus put the obvious question: **can we find better source texts to work with than "bad PDFs"?** If the publisher has a Word file, if a web edition exists, if a library has already proofread the text, we should start from that, not from the PDF.

The previous inventory (38s.1) answered that for the 13 live reports: clean HTML exists for 9/11 and Saville, court text for Philip Morris, useful structure tags inside the PDFs for Hillsborough, Columbia, Chilcot, Leveson and Litvinenko, and nothing for Jack Smith, PSI, Challenger, Deepwater and Lehman. The hybrid epic (ivg) is building the path that uses those clean editions.

This note asks the general question for every report, current and future: where do better sources come from, how do we get them, and what is each worth? It covers six places to look, runs a small extraction experiment on the two scanned reports, and ends with a per-report plan and an opinionated recommendation.

The short answer: **yes for some reports, and in more places than we had looked, but the bigger lesson is that for most of our reports the words are already right. What a PDF loses is structure, and structure is what we should go looking for.**

## 2. Why PDFs are hard, and what "better" means

A PDF is a set of instructions for painting a page: put these glyphs at these coordinates in this font. It does not have to say which glyphs make a word, which lines make a paragraph, or which small number at the foot of the page is a footnote belonging to which marker. A text extractor has to infer all of that from geometry, and the inferences fail in predictable ways: a paragraph that runs over a page break comes out as two, a footnote is read into the body text, a two-column page is read across the columns.

To publish a report well we need five things from a source:

1. **Words**: the right characters in the right order.
2. **Blocks**: where each paragraph, heading, list item, block quotation and table begins and ends.
3. **Notes**: each footnote's text, and which marker it belongs to.
4. **Anchors**: the printed page on which each passage appears, so readers can cite the official edition.
5. **Provenance**: proof that this is the same text as the official edition, and a licence to republish it.

Sources differ in which of the five they give. The PDF is the only one that always gives anchors and provenance, which is why the hybrid design (ivg) keeps it as the anchor and fidelity check whatever else we use.

### 2.1 Most of our PDFs are not "bad" in the way people assume

When people say "bad PDF" they usually picture a scan with garbled OCR. Only two of our fourteen source PDFs are that. Classifying each by how it was made (`pdfinfo`, `pdffonts`, `pdfimages` on a body page):

| report | how the PDF was made | text layer | tagged |
|---|---|---|---|
| us-911-commission | QuarkXPress, Acrobat Distiller 6 | born-digital | no |
| uk-saville-inquiry | InDesign CS4 | born-digital | no |
| us-v-philip-morris | word processor, Times New Roman | born-digital | no |
| uk-hillsborough-panel | InDesign CS5.5 | born-digital | yes |
| columbia-accident | Acrobat 6 (InDesign styles) | born-digital | yes |
| uk-chilcot-inquiry | InDesign CC 2014 | born-digital | yes |
| uk-leveson-inquiry | InDesign CS5.5 | born-digital | yes |
| uk-litvinenko-inquiry | InDesign CC 2014 | born-digital | yes |
| us-psi-financial-crisis | Acrobat Pro 9 (from Word) | born-digital | no |
| us-deepwater-horizon | InDesign CS5 | born-digital | no |
| us-lehman-examiner | Word, PScript5, Distiller 7/8 (Palatino fonts, no page images) | born-digital | no |
| us-duelfer-report (queued) | Apogee Pilot | born-digital | no |
| challenger-accident | 1986 print, scanned 2003 (HP ScanJet, Acrobat 5 Paper Capture) | OCR | no |
| jack-smith-vol1 | printed and rescanned on an office copier (Canon iR-ADV C5860), Acrobat Paper Capture | OCR | yes (from OCR) |

(One correction to 38s.1 falls out of this: the Valukas volumes are born-digital Word output, not "scans of typeset PDFs". The PR fixes that line.)

Twelve of the fourteen have a born-digital text layer: the characters are exactly what the publisher typeset. For those twelve, a "better source" cannot improve the words. It can only improve blocks and notes, which is where nearly all of our defect load is: severed paragraphs, headings, contents entries, unlinked footnote markers. So the useful question is narrower than it first sounds: **who has the structure that the PDF threw away?**

## 3. The landscape: six places to look

### 3.1 The publisher's own files

Nearly every report started as a word-processor file, and most were then laid out in InDesign or QuarkXPress. Those files hold exactly the structure we reconstruct by inference: paragraph styles, heading levels, real footnote objects. If we could get them, most of the pipeline's work would disappear for that report.

**Who holds them.**

- *UK public inquiries.* When an inquiry ends, its records pass to the sponsoring department and eventually to The National Archives (TNA). The Iraq Inquiry's official records are catalogued at TNA (Discovery C16845733). The report itself is a House of Commons paper typeset by the official printer (TSO) under a contract that TNA's Official Publishing team manages; gov.uk lists `official.publishing@nationalarchives.gov.uk` as the accessible-format contact for the Saville and Hillsborough reports, which suggests that team is also the best route to whatever publication files were kept. For the others gov.uk names the department: Chilcot, `accessible.formats@cabinetoffice.gov.uk`; Leveson, `enquiries@dcms.gov.uk`; Litvinenko, `alternativeformats@homeoffice.gov.uk`.
- *US federal reports.* The author agency or commission holds the manuscript; temporary commissions' records go to the National Archives (NARA). GPO typesets some reports but not all (the 9/11 report's PDF came out of QuarkXPress, Deepwater's out of InDesign).
- *Congress.* The Senate Permanent Subcommittee on Investigations (PSI) and the House Science Committee hold their own reports. Congress is not subject to FOIA, so the only route is to ask.
- *Courts and law firms.* Opinions are filed as PDFs on PACER; the judge's chambers hold the word-processor file but courts do not release drafts. The Lehman examiner's report was written by Jenner & Block, a private firm: only a direct request will do.

**The legal hooks, and their limits.**

- *US FOIA* has an unusually useful clause: an agency "shall provide the record in any form or format requested by the person if the record is readily reproducible by the agency in that form or format" (5 U.S.C. 552(a)(3)(B)). A request for the native electronic file of a final report is squarely within it. The risk is that the agency treats the Word file as a draft (exemption 5) or says the published PDF is the record. Expect weeks to months.
- *UK FOI* lets a requester state a preference for the form of the information (section 11), but the report text is already published, so the authority can refuse under section 21 (information reasonably accessible by other means). A format preference is not a strong lever when the content is public.
- *Accessible formats.* Every gov.uk publication page invites requests for "a more accessible format". This is the friendliest route in the UK, and a structured Word or HTML file is exactly what a screen-reader user needs. We must be honest about who we are: the request should say that we republish reports as accessible, searchable web editions and that the source file would make those faithful, not imply that we are an individual with a disability.

**Coverage, fidelity, licence, effort.** If it works, this is the best source there is: full coverage, the publisher's own structure, no version risk (as long as we get the final, not a late draft; the request must ask for the version sent to the printer and we must align it against the PDF before use). Licence: UK reports are Crown copyright under the Open Government Licence v3.0; US federal works are public domain; Jenner & Block's text sits in a public court filing but the firm's files are theirs to give. Effort: an hour of Rufus's time to send the drafts in Appendix A, then waiting. Yield: honestly unknown and probably low. We found no public account of an inquiry or agency releasing its InDesign or Word files on request, and we should treat any success as a bonus, not a plan.

### 3.2 Structured government data

Governments publish a great deal of structured text: bills and the US Code as USLM XML on govinfo, congressional committee reports as HTML and text, UK legislation as XML on legislation.gov.uk, Hansard as XML. It is natural to hope our reports are in there.

They are not. The govinfo API (`api.govinfo.gov/packages/<id>/summary`) lists the available renditions for each package. For `GPO-911REPORT`, `GPO-OILCOMMISSION`, `GPO-DUELFERREPORT` and `GPO-CRPT-99hrpt1016` (Challenger) it offers the PDF, MODS and PREMIS metadata and a zip, and no HTML or XML. The PSI report's hearing package (`CHRG-112shrg66051`) has a text rendition, but the report itself appears there only as page images (`[GRAPHIC] [TIFF OMITTED]`, found by 38s.1). The 1986 Challenger report predates govinfo's text renditions for committee reports. UK inquiry reports are not legislation, so legislation.gov.uk has nothing, and Hansard holds the debates about a report, not the report.

**Verdict:** a dead end for the current corpus. It is still the first thing to check for a future US congressional report published after about 1995, where govinfo usually has an HTML or text rendition of a committee report, and for any report reproduced in full in a hearing record.

### 3.3 Court records

Court opinions are unusually well served: law libraries and free-law projects have digitised and structured them.

- *Caselaw Access Project* (Harvard, `static.case.law`) gives Philip Morris as JSON and HTML with reporter page labels and two-way footnote links (38s.1). Public domain, no restrictions. The catch is the version: CAP prints the 17 August 2006 opinion from the reporter, and our PDF is the amended opinion filed on 8 September 2006 (ivg.5 is deciding whether that matters).
- *CourtListener and RECAP* (Free Law Project) mirror PACER dockets. The Philip Morris docket (CourtListener docket 4215066, D.D.C. 1:99-cv-02496) lists entry 5750, our PDF, but nobody has yet uploaded the document to RECAP. Opinions are free on PACER, so fetching it costs nothing; the value is provenance, a second copy of the same file, not a cleaner text.
- *The Lehman bankruptcy docket* (CourtListener docket 4326736, Bankr. S.D.N.Y. 08-13555) turns up something the sourcing for the queued Valukas volumes needs to know: entry 7025 is the notice of filing the examiner's report under seal, entry 8307 is "Notice of Filing Unredacted Volume 5 of Examiner's Report", and entry 8366 (15 April 2010) denies CME Group's objection to unsealing. **Volume 5 exists in a redacted and an unredacted version.** Before ingesting it (bead 94u) we must check which one Jenner & Block's site serves and take the unredacted one.

**Verdict:** valuable for court opinions (structure and reporter pagination) and for version provenance on anything filed in court. No help for the government reports.

### 3.4 Web, accessibility and ebook editions

This is where the clean texts are, and where this research found the most that 38s.1 had not.

**Official web editions.** Already known: the 9/11 Commission's HTML (one file per chapter plus the notes), the Saville inquiry's HTML for **all ten volumes** (the same server-generated, class-annotated pages for each volume), the Hillsborough panel website, and the CIA's HTML for the Duelfer report, chapters 1 to 6. All are on web archives now (UKGWA, which blocks scripts, and the Wayback Machine, which throttles them), so we copy each one once into the report repo's `reference/` with its hash.

**Ebooks.** GPO sold official EPUB editions of at least two of our reports:

- *The 9/11 Commission Report*, released by GPO as an official EPUB in September 2011 (around $7.50 through ebook vendors). Useful as a third reference for 9/11, but we already have the Commission's HTML.
- *Deep Water: The Gulf Oil Disaster and the Future of Offshore Drilling*, January 2011, listed on GPO's bookstore in ePub and distributed by Perseus to Apple, Amazon and Barnes & Noble. **This is the only clean, structured edition of Deepwater we know of**, and Deepwater is one of the five reports 38s.1 found nothing for. An EPUB made from the same InDesign files as our PDF carries paragraph, heading and note structure as XHTML. The text is a US government work and in the public domain; the file may carry vendor DRM, so we buy from a DRM-free source if there is one (or ask GPO), and we keep the purchased file private and publish only our derived text.

**Accessibility editions.** Large-print and Easy Read versions exist for some UK reports but are rewritten or re-laid-out, so they are not the same text. What matters is the *request route* for accessible formats (section 3.1), which can produce a structured Word file of the real text.

**Wikisource.** This is the new find. Wikisource volunteers transcribe public documents page by page against a scan, and each page carries a proofreading status. Two of our reports are there:

- *9/11 Commission Report* (`Index:The 9-11 Commission Report (Official Government Edition).djvu`): 362 transcribed pages, of which **310 are marked proofread and 40 validated** (checked by a second person); 7 are blank and 5 marked problematic. The older chapter pages (`9/11 Commission Report/Chapter 1` and so on) are being migrated onto this page-based transcription.
- *The Report of the Iraq Inquiry: Executive Summary* (`Index:The Report of the Iraq Inquiry - Executive Summary.pdf`): **142 of 150 pages proofread**.

What makes these special is that they are *page-aligned* and *human-checked*. The HTML editions tell us what a paragraph is but carry no page numbers, so we have to align them to the PDF to learn where each page starts; a Wikisource page is already one printed page. That makes them ideal golden pages (the quality harness checks a handful of hand-verified pages per report; Wikisource gives us hundreds) and a page-level reference for the alignment scorer, including for Chilcot, where the only reference so far has been the PDF's own tags (which drop about 15% of words, 38s.1). Licence: the underlying texts are public domain (9/11) and OGL (Chilcot); Wikisource's own formatting is CC BY-SA, so we attribute it and use it as a reference rather than redistribute it.

**Project Gutenberg** has none of our reports as text. (Search results for "Project Gutenberg 9/11 Commission Report" point at self.gutenberg.org, the unrelated World Public Library, which holds a 2005 PDF copy.)

### 3.5 Better extraction from the PDFs we already have

When there is no other source, the alternative is to get more out of the PDF. Three families of tools:

- **The PDF's own structure.** Six of our PDFs are tagged (38s.1): the publisher's InDesign styles survive as a structure tree with headings, paragraphs and, for Chilcot, paired footnote references and notes. One practical finding here: **for Chilcot's further volumes, take the section PDFs from the inquiry's site, not the volumes on gov.uk.** The gov.uk Volume I PDF (InDesign CC 2014, 530 pages) is *untagged*, while the inquiry site's section PDFs from the same pipeline are tagged (38s.1 checked section 1.1).
- **Re-OCR the scans** with a modern engine (tesseract 5, Apple's Vision framework, commercial engines).
- **Layout and vision models** that look at the page image and emit structured text: Docling (IBM, with a layout model and pluggable OCR, or its small vision-language model granite-docling), Marker, and the large vision-language models (Claude, Gemini, GPT) prompted to transcribe a page into Markdown.

To see which is worth the effort, we ran a small experiment on the two scanned reports.

#### The experiment

Four pages: Challenger pages 11 and 29 (the 1986 scan; both are golden pages in the report's `golden.yaml`) and Jack Smith pages 30 and 40 (the copier scan; dense with superscript footnote markers and citation strings). For each page we built a **ground truth** by reading the page image and correcting an engine's output word by word. We compared four extractions with it:

1. **Text layer (ours):** the existing OCR layer in the PDF, which is what our pipeline reads today (`pdftotext`).
2. **tesseract 5.5.3** on the original 300 dpi page image (`pdfimages`), default settings.
3. **Docling 2.132 standard pipeline with Apple Vision OCR** (`--ocr-engine ocrmac --ocr-mode full_page`): a layout model finds the regions, Apple's OCR reads them.
4. **Docling with granite-docling** (`--pipeline vlm`), a 258M-parameter vision-language model that reads the whole page and writes structured output.

The score is the word error rate on alphabetic words (substitutions, insertions and deletions over ground-truth words), and separately the error rate on numeric tokens, which on these pages are mostly footnote markers and citation numbers. Line-end hyphens are joined and curly quotes normalised first. All runs were on an Apple M4 laptop (16 GB), CPU only.

| page | words / numbers | text layer (ours) | tesseract 5.5 | Docling + Apple Vision | Docling granite VLM |
|---|---|---|---|---|---|
| Challenger p11 | 383 / 2 | 0.3% | 0.0% | **21.9%** | 1.6% |
| Challenger p29 | 416 / 17 | 1.0% / 12% | 0.0% / 12% | **16.3%** / 47% | 0.5% / 0% |
| Jack Smith p30 | 350 / 103 | 1.4% / 9% | 0.9% / 17% | 0.0% / 7% | 0.3% / 0% |
| Jack Smith p40 | 467 / 179 | 1.3% / 4% | 0.6% / 6% | 0.2% / 1% | 0.0% / 1% |

(Each cell is word error / number error. Challenger p11 has only two numbers, so its number column is omitted. Reproduce with `python3 docs/research/better-source-texts/score.py`.)

What the numbers say:

- **Our existing OCR layers are already about 99% right on words.** The errors are real but sparse: "NAJA" for NASA, "budgetar", "hostaoes b" for hostages, "1vfink" for Mink, "2 l-cr117" for 21-cr-117, hyphens for em dashes. They matter for search and for quoting, and a re-OCR fixes most of them.
- **Plain tesseract is a modest, cheap improvement on words and a regression on footnote markers.** It gets every word right on both Challenger pages, but turns superscript markers into noise ("untested.°®", "fraud.'*?", "!**"), which our footnote linking depends on. Taking tesseract's words where the two disagree on a dictionary word, and keeping the layer's digits, would capture most of the gain.
- **The layout-model pipeline silently drops text.** On Challenger p29 Docling's standard pipeline left out about three lines ("a Solid Rocket Motor segment slated for use on STS 51-L, and the March 8, 1985, 'payload bay access platform' episode which led to significant damage to bay payload bay door. Failure to follow an") and garbled the end of the page; on p11 it dropped a line and swapped two paragraphs. On the clean Jack Smith pages, the same pipeline was nearly perfect. Its failure mode is the dangerous kind: fluent output with words missing, which no spell-checker or out-of-vocabulary test will notice.
- **The small vision-language model was the best overall, and it also gives structure.** granite-docling misread two words in about 1,600 ("reexanation" and "proceessing" on Challenger p29); its other residual errors are three words on Challenger p11 left with their line-end hyphen inside ("appendi-ces"), the full stop missing from "v." in Jack Smith's case names, and one citation number ("21-cr-117" as "cr 17"). It read the footnote markers almost perfectly (numbers 0-1% wrong, against 4-17% for the OCR engines). It also emitted what our pipeline works hardest to infer: numbered findings as list items, "Recommendations" and "b. Pressures on Shuttle Operations" as headings, footnotes separated from body text, page numbers dropped. Its cost is time: about 80 to 100 seconds a page on the laptop's CPU, so roughly five hours for Jack Smith's 174 pages and twelve for Challenger's 450 (tesseract takes a few seconds a page).

Caveats: four pages is a probe, not a benchmark; the Jack Smith ground truth was built by correcting the Apple Vision output, which may flatter that engine (granite-docling, an independent engine, agrees with it on every word of p40, which is reassuring); and we did not run a large commercial vision model, which is the subject of 38s.3. The fuller bake-off is 38s.5.

**What this means.** Re-OCR is worth doing for the two scanned reports, but it is a small win on words. The large win is a vision model that returns *structure* (blocks, headings, list items, footnotes) for scanned pages, provided we never trust it blind. The verification is cheap because we already have an independent text: align the model's words to the PDF's text layer, as the scorer does, accept the model's structure where the words agree, and flag every stretch where the model has words the layer does not or lacks words the layer has. The Docling result on Challenger p29 is exactly the failure that check would catch.

### 3.6 Crowd and partner sources

- **Wikisource** (above) is the standout: page-aligned, proofread, openly licensed. It is also a place we could give back to: our corrected texts of public-domain reports could seed Wikisource transcriptions for reports it does not yet have.
- **Internet Archive** items for our reports are mostly mirrors of the official PDFs with IA's own OCR, which is tesseract (the Jack Smith item `report-of-special-counsel-smith-volume-1-january-2025_20250114` records tesseract 5.3), so not an independent reading. The one library scan we hoped was the Challenger report (`investigationofcha02unit`, Boston Public Library, 400 ppi) turned out to be volume 2 of the committee's *hearings*, mislabelled.
- **HathiTrust** has the Challenger hearings in full view (University of Michigan copies, public domain), but we did not locate the report itself, and its full-text search sits behind a browser challenge that scripts cannot pass. A library scan of the 1986 print would give a second, independent OCR of Challenger; worth one more manual search, not more.
- **Academic and free-law projects:** Harvard's Caselaw Access Project (Philip Morris), CAIN at Ulster University (the Saville chapter index), Free Law Project's CourtListener (dockets and provenance), the Stanford mirror of the Valukas volumes (`web.stanford.edu/~jbulow/Lehmandocs/`), discoverleveson.com (an index, not a text).
- **Partners we could approach:** Wikisource's community (for the transcriptions), Free Law Project (to fetch Philip Morris entry 5750 into RECAP, or we can do it with their browser extension), and, more speculatively, the inquiry-records teams at TNA, who might welcome a structured edition of reports they hold.

## 4. Per-report sourcing plan

The table gives, for each live and queued report, the best source we know of now, what we recommend using for each of the five needs, and the next action. "Tags" means the PDF's own structure tree; "HTML" an official web edition; "VLM" a vision-model transcription verified against the text layer.

| report | PDF | best clean source today | recommended source stack | next action |
|---|---|---|---|---|
| us-911-commission | born-digital | Commission HTML; Wikisource page transcription (350 of 362 pages proofread or validated); GPO EPUB | structure from HTML (ivg.1); Wikisource as page-level golden pages and scorer reference; PDF for anchors | import Wikisource pages as page references (7d4y) |
| uk-saville-inquiry (Vol I) | born-digital | inquiry HTML, all volumes | HTML (ivg.2) | as planned in ivg.2; also ask TNA Official Publishing (Appendix A.3) |
| us-v-philip-morris | born-digital | CAP JSON/HTML (17 Aug 2006 reporter text) | CAP for structure where versions agree (ivg.5); PDF otherwise | fetch entry 5750 from PACER (free) for provenance; settle ivg.5 |
| uk-hillsborough-panel | born-digital, tagged | tags; panel website (Wayback) | tags plus website (ivg.3) | as planned; Appendix A.3 |
| columbia-accident | born-digital, tagged | tags only | tags (ivg.6) | none new; no HTML edition exists |
| uk-chilcot-inquiry (executive summary) | born-digital, tagged | tags; **Wikisource, 142 of 150 pages proofread** | tags for structure, Wikisource as page reference for words (fills the ~15% the tags drop) | import Wikisource pages (7d4y); Appendix A.2 |
| uk-leveson-inquiry | born-digital, tagged | tags (headings only) | tags for headings; footnote linking stays on the pipeline | send accessible-format request to DCMS (Appendix A.4): the largest footnote load in the corpus |
| uk-litvinenko-inquiry | born-digital, tagged | tags (little structure); web and print PDFs as a consistency pair | pipeline plus tags | Appendix A.4 (Home Office) |
| jack-smith-vol1 | copier scan, OCR | none | VLM for structure, verified word by word against the text layer; re-OCR words where layer and VLM agree against it | VLM structure pilot (kyj3); FOIA for the native file (Appendix A.1, 6nkk) |
| us-psi-financial-crisis | born-digital (Word to PDF) | none | pipeline | ask PSI for the Word file (Appendix A.5) |
| challenger-accident | 1986 scan, OCR | none (NASA's HTML is the Rogers report, a different text) | VLM for structure, verified against the text layer; tesseract words | VLM structure pilot (kyj3, after Jack Smith) |
| us-deepwater-horizon | born-digital (InDesign), untagged | **GPO EPUB (2011)** | EPUB for structure, PDF for anchors (a new hybrid input type) | acquire and evaluate the EPUB (egsa) |
| us-lehman-examiner (Vol 1, Vol 3 body) | born-digital (Word) | none | pipeline; keep the footnote hyperlinks to cited documents | Appendix A.6 (Jenner & Block) |
| **queued** us-duelfer-report Vol I (9br) | born-digital | CIA HTML (Wayback), chapters 1-2 | HTML (ivg.4) | as planned in ivg.4 |
| **queued** Duelfer Vols II, III and Addendums (d0h) | born-digital (govinfo `GPO-DUELFERREPORT`) | CIA HTML covers chapters 3-6 (5-6 not yet fetched); addendums not confirmed in the HTML | HTML where it covers, govinfo PDF otherwise | fetch chapters 5-6 and look for the addendums page on the Wayback copy before ingesting |
| **queued** Valukas Vols 2-9 (94u) | born-digital (Word) | none | pipeline | **take the unredacted Volume 5** (docket 8307, unsealed 15 April 2010); Appendix A.6 |
| **queued** Chilcot Vols I-XII (0a7) | born-digital; gov.uk volumes untagged, inquiry-site section PDFs tagged | section PDFs' tags | **section PDFs from the inquiry site, not gov.uk volumes**; tags for structure | record in 0a7; Appendix A.2 |
| **queued** Saville Vols II-X (wdt) | born-digital | inquiry HTML for every volume | HTML (the ivg.2 path, unchanged) | record in wdt: the HTML makes Vols II-X cheap once ivg.2 works |

## 5. Recommendation

**1. Change the question from "which file is the source?" to "which source gives which part?"** For each report record a source stack: words from the best text available (usually the PDF's own layer), blocks and notes from the richest structured edition (HTML, EPUB, tags, or a verified vision transcription), anchors and provenance from the PDF. This is what the hybrid epic already does for the five reports with HTML; the same shape covers ebooks and vision transcriptions. The PDF never stops being the anchor and the fidelity check.

**2. Take the cheap wins now.** In order of value for effort:

- Import the Wikisource page transcriptions of 9/11 and the Chilcot executive summary as page-level references: hundreds of human-checked golden pages for two reports, free, today.
- Buy and evaluate the Deep Water EPUB: the one realistic clean source for a report with nothing else, for the price of a paperback.
- Source the queued Chilcot volumes from the inquiry site's tagged section PDFs, Saville II-X from the inquiry HTML, and Valukas Volume 5 in its unredacted version. These are decisions to record in the queued beads before anyone ingests.

**3. For the two scanned reports, use a vision model for structure, and verify it against the text layer.** Re-OCR alone is a small win. A vision model that returns blocks and footnotes, checked word by word against the PDF's existing OCR layer, attacks the defects that actually hurt those two reports. Pilot on Jack Smith (174 pages, overnight on a laptop with granite-docling; 38s.3 measures whether a large commercial model is worth its cost). Never accept a model's page without the coverage check: the layout-model pipeline dropped whole lines in our test without any sign of it.

**4. Ask, but do not wait.** Send the six drafts in Appendix A (about an hour of Rufus's time). If any publisher sends a Word, InDesign or XML file, it becomes that report's structure source at once and its alignment against the PDF tells us immediately whether it is the final text. Plan as if none will.

**5. Do not spend effort on** re-OCRing born-digital PDFs (their words are already exact), govinfo or legislation XML for this corpus (not there), or any extractor whose output is not aligned back to the PDF.

**6. For every new report, run a sourcing checklist before the first ingest.** It takes half an hour and it would have found every source in this note:

1. How was the PDF made? (`pdfinfo` Creator and Producer; `pdffonts` and `pdfimages` on a body page.) Born-digital: the words are right, look for structure. Scan: plan for re-OCR plus a verified vision transcription.
2. Is it tagged, and are there other renditions of the same PDF (inquiry site versus gov.uk, web versus print) that are tagged?
3. Is there an official HTML edition, live or on the Wayback Machine or UKGWA?
4. Is there an official EPUB? (GPO bookstore; the publisher's ebook listings.)
5. Is it on Wikisource, and how much is proofread?
6. For court documents: CAP, CourtListener, the docket's sealed and unsealed versions.
7. For US congressional material after about 1995: govinfo's HTML or text renditions.
8. Who holds the original files, and what is the request route (accessible-format contact, FOIA, direct)?

## 6. Follow-up beads

Filed with this note (all `discovered-from:reportsthatmatter-zphc`):

- **reportsthatmatter-7d4y**: import Wikisource page transcriptions (9/11, Chilcot executive summary) as page-level references and golden pages.
- **reportsthatmatter-egsa**: acquire the Deep Water EPUB and evaluate it as a hybrid structure source (an EPUB input for the hybrid path).
- **reportsthatmatter-kyj3**: vision-model structure pass for scanned reports: pilot on Jack Smith, verified against the text layer; then Challenger.
- **reportsthatmatter-e693**: send the UK source-file requests (Appendix A.2 to A.4); Rufus sends.
- **reportsthatmatter-6nkk**: send the US and private source-file requests (Appendix A.1, A.5, A.6); Rufus sends.
- **reportsthatmatter-e5dv**: add the sourcing checklist (section 5.6) to the new-report workflow.

Notes appended to the queued beads: 0a7 (use the inquiry site's tagged section PDFs), wdt (inquiry HTML covers all volumes), 94u (unredacted Volume 5), d0h (CIA HTML coverage of chapters 3-6 and the addendums).

## Appendix A. Draft requests (for Rufus to send; nothing has been sent)

Each draft is short on purpose. Fill in the bracketed parts, send from Rufus's own address, and record the date and any reference number in the matching bead.

### A.1 US Department of Justice (FOIA): Jack Smith report, Volume One, native file

To: Department of Justice, Office of Information Policy, via the National FOIA Portal (foia.gov).

> Subject: FOIA request: Report of Special Counsel Jack Smith, Volume One, in native electronic format
>
> Under the Freedom of Information Act, 5 U.S.C. 552, I request a copy of the final version of Volume One of the Final Report of Special Counsel Jack Smith, as transmitted to the Attorney General on or about January 7, 2025 and released publicly on January 14, 2025.
>
> I request the record in its native electronic format (for example Microsoft Word .docx), or failing that as a PDF generated directly from that file with its text layer, under 5 U.S.C. 552(a)(3)(B), which requires agencies to provide records in any form or format requested if readily reproducible in that format. The version on justice.gov is a scan of a printed copy, which makes the text hard to search, quote and read with assistive technology.
>
> I am not requesting drafts, and I do not seek any information withheld from the public release: the same redactions may be applied.
>
> I am [Rufus Pollock], [role], Reports that Matter, a non-commercial project that publishes major public reports as free, accessible, searchable web editions (reportsthatmatter.org). The request is not for commercial use. I ask for a fee waiver because disclosure is in the public interest and will contribute to public understanding of government operations; if a waiver is refused, I agree to pay fees up to $25 and ask to be contacted before any larger charge.
>
> Please send the record electronically to [email].

### A.2 Cabinet Office: the Iraq Inquiry report in an accessible, structured format

To: `accessible.formats@cabinetoffice.gov.uk` (the contact on the gov.uk publication page).

> Subject: The Report of the Iraq Inquiry: request for an accessible structured format
>
> I am writing about The Report of the Iraq Inquiry (6 July 2016), published on gov.uk as PDFs: the executive summary and Volumes I to XII.
>
> Reports that Matter (reportsthatmatter.org) is a non-commercial project that republishes major public reports as free, accessible web editions that work with screen readers, search and citation. Rebuilding the text from the PDFs loses structure, especially footnotes and paragraph numbers, which hurts exactly the readers who rely on assistive technology.
>
> Would the Cabinet Office be able to provide the report in a structured electronic format: the Word, XML or InDesign files from which the PDFs were produced, or an accessible Word or HTML version? We would use the final text only, credit the Inquiry and Crown copyright under the Open Government Licence, and check it word for word against the published PDFs.
>
> If the Cabinet Office no longer holds these files, could you tell me whether they were transferred to The National Archives with the Inquiry's records, so I can ask there?

### A.3 The National Archives, Official Publishing: source files for House papers

To: `official.publishing@nationalarchives.gov.uk` (the accessible-format contact gov.uk lists for the Saville and Hillsborough reports).

> Subject: Source files for published inquiry reports (HC 29, HC 30, HC 581 and others)
>
> I run Reports that Matter (reportsthatmatter.org), a non-commercial project that republishes major public reports as free, accessible and searchable web editions under the Open Government Licence.
>
> gov.uk lists your team as the contact for accessible formats of the Report of the Bloody Sunday Inquiry (HC 29-I to X, HC 30) and the Report of the Hillsborough Independent Panel (HC 581). I would like to ask whether the publication files for these and similar House papers (the Word, XML or InDesign packages from which the PDFs were produced) were retained, and whether they could be made available for re-use, or as an accessible format.
>
> The other reports we are working on are the Leveson Inquiry (HC 780-I to IV), the Litvinenko Inquiry (HC 695) and the Report of the Iraq Inquiry (HC 264). If the files are held elsewhere, for example by the printer or the sponsoring department, I would be grateful to know where to ask.

### A.4 DCMS (Leveson) and Home Office (Litvinenko): accessible formats

To: `enquiries@dcms.gov.uk` for Leveson; `alternativeformats@homeoffice.gov.uk` for Litvinenko (the contacts on each gov.uk publication page). One template, sent twice.

> Subject: [An Inquiry into the Culture, Practices and Ethics of the Press (HC 780)] / [The Litvinenko Inquiry (HC 695)]: request for an accessible structured format
>
> Reports that Matter (reportsthatmatter.org) is a non-commercial project that republishes major public reports as free, accessible web editions that work with screen readers, search and citation.
>
> The [report] is published on gov.uk as PDFs. Rebuilding the text from them loses structure: [Leveson: its several thousand footnotes] [Litvinenko: its footnotes and their links to the evidence] cannot be reliably linked to the paragraphs they belong to.
>
> Could the department provide the report in a structured electronic format, either the Word, XML or InDesign files from which the PDFs were produced or an accessible Word or HTML version? We would use the final published text only, credit it under the Open Government Licence, and check it word for word against the published PDFs. If the department does not hold these files, I would be grateful to know who does.

### A.5 Senate Permanent Subcommittee on Investigations: the 2011 report as a Word file

To: the Subcommittee's staff, via the contact details on hsgac.senate.gov.

> Subject: Wall Street and the Financial Crisis (April 2011): request for the report's electronic text
>
> Reports that Matter (reportsthatmatter.org) is a non-commercial project that republishes major public reports as free, accessible, searchable web editions. We have published the Subcommittee's 2011 majority and minority staff report, Wall Street and the Financial Crisis: Anatomy of a Financial Collapse, from the PDF on the Committee's website.
>
> Rebuilding the text from the PDF loses its structure, in particular its roughly 2,850 footnotes and their links to the exhibits. Would the Subcommittee be able to share the report's original electronic file (the Word document from which the PDF was produced), or a copy of the version with footnote links to GPO? We would use it only to make our edition faithful to the published report, which we check word for word against the PDF.

### A.6 Jenner & Block: the Lehman examiner's report

To: Jenner & Block's communications team (the firm hosted the report at lehmanreport.jenner.com).

> Subject: The Report of Anton R. Valukas, Examiner (Lehman Brothers, 2010)
>
> Reports that Matter (reportsthatmatter.org) is a non-commercial project that republishes major public reports as free, accessible, searchable web editions. We have published Volume 1 of the Examiner's Report from the PDFs on the firm's report site and plan to add the remaining volumes.
>
> Two questions. First, are the volumes on the report site the final versions as filed, including the unredacted Volume 5 filed after the April 2010 unsealing order? Second, would the firm be willing to share the report's original electronic files (the Word documents from which the PDFs were produced)? They would let us reproduce its footnotes, and their links to more than 8,000 cited documents, faithfully. We would credit the Examiner and the firm, and check the text word for word against the filed PDFs.

## Appendix B. How the experiment was run

Scripts, ground truth and every engine's output are in [`better-source-texts/`](better-source-texts/) (88 KB). The PDFs are in the report repos' `archive/` directories.

```
# page images (original resolution) and the existing text layer
pdfimages -f 29 -l 29 -png <challenger.pdf> ch29          # 300 dpi, 1-bit CCITT
pdftotext -f 29 -l 29 -layout <challenger.pdf> ch29.layer.txt
# tesseract 5.5.3 (Homebrew)
tesseract ch29-000.png ch29.tess -l eng --psm 3
# Docling 2.132.0 in a Python 3.11 venv (pip install docling ocrmac)
pdfseparate -f 29 -l 29 <challenger.pdf> ch29.pdf
docling convert ch29.pdf --ocr-engine ocrmac --ocr-mode full_page --to md --output dl-mac
docling convert ch29.pdf --pipeline vlm --vlm-model granite_docling --to md --output dl-vlm
# score against the ground truth (gt/*.txt), print the table; diffs.py shows each difference
python3 score.py
python3 diffs.py gt/ch29.txt outputs/docling-granite-vlm/ch29.md
```

Ground truth: Challenger p11 is the text layer with one correction ("II. CONCLUSIONS"); Challenger p29 is the tesseract output with three corrections (two closing quotation marks and "3. NASA"); Jack Smith p30 and p40 are the Docling and Apple Vision output with the footnote markers and five citation strings corrected against the page image. Docling's first run downloads its models (a few hundred MB); granite-docling ran at 79 to 99 seconds a page with the model cached.
