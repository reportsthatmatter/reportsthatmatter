---
title: "Better than bad PDFs: where cleaner source texts come from"
date: "2026-10-03"
author: "Reports that Matter"
summary: "Most of our reports reach us as PDFs, and for most of them the words are already right. What a PDF loses is structure, so we went looking for who still has it: publishers, ebooks, court archives, Wikisource volunteers, and modern extraction tools."
status: draft
review:
  - "Adapted from the internal research note docs/research/better-source-texts.md; the full note, with per-report plan and draft requests, is linked at the end. Check you are happy with the level of detail about sources and with naming Wikisource and the Deep Water ebook."
  - "No request to any publisher or agency has been sent yet. The post says we plan to ask; reword if you would rather not say so before sending."
  - "The extraction experiment is four pages. The post says so; keep that caveat."
---

Almost every report on this site reaches us as a PDF, and most of our engineering has gone into getting a faithful text back out of it: rejoining paragraphs that a page break cut in two, telling a heading from a short sentence, linking each footnote to its marker. So we asked a broader question: where could a better source come from in the first place?

The short answer is yes for some reports, and in more places than we had looked. The bigger lesson is that for most of our reports the words are already right. What a PDF loses is structure, and structure is what to go looking for.

## Most of our PDFs are not "bad" in the way people assume

When people say "bad PDF" they picture a scan with garbled text recognition. Only two of our fourteen source PDFs are that: the 1986 Challenger report, scanned in 2003, and the Jack Smith report, printed and rescanned on an office copier. The other twelve are born-digital. Their characters are exactly what the publisher typeset, so no better source can improve the words.

What a PDF records is where each glyph sits on a page. It does not say which lines form a paragraph, which small number is a footnote belonging to which marker, or which words are a running head. That structure is what we rebuild by inference, and it is where nearly all of our defects live. The useful question is narrower than it first sounds: who has the structure the PDF threw away?

## Six places to look

**The publisher's own files.** Nearly every report started as a word-processor file and was laid out in InDesign or QuarkXPress. Those files hold paragraph styles, heading levels and real footnotes. Departments, commissions and archives hold them, and US and UK law give some leverage: US FOIA lets a requester ask for a record in any format the agency can readily produce, and every gov.uk publication invites requests for an accessible format. We plan to ask, honestly saying who we are and why a structured file would help. We expect little. We found no public account of an inquiry releasing its layout files on request, so any success is a bonus, not a plan.

**Structured government data.** Bills, statutes and Hansard are published as XML, so it is natural to hope the reports are too. They are not: the US Government Publishing Office's API lists only the PDF and metadata for the 9/11, Deepwater, Duelfer and Challenger reports. A dead end for our current reports, though worth checking first for a future congressional report from after the mid-1990s.

**Court records.** Judicial opinions are unusually well served. Harvard's Caselaw Access Project has the Philip Morris judgment as structured text with reporter page labels and linked footnotes, though it is the August 2006 version and ours is the amended September one. The docket also taught us something practical: Volume 5 of the Lehman examiner's report exists in a redacted and an unredacted version, so we must check which we ingest.

**Web, ebook and accessibility editions.** This is where the clean texts are. The 9/11 Commission's HTML, the Saville Inquiry's HTML for all ten volumes, and the Hillsborough panel's website are official web editions, now preserved on web archives. The Government Publishing Office also sold an official ebook of *Deep Water*, the Deepwater Horizon commission's report. An ebook made from the same layout files as the PDF carries paragraph, heading and note structure as markup, and it is the only clean edition of that report we know of.

**Wikisource.** Volunteers transcribe public documents there page by page against a scan, and every page carries a proofreading status. The 9/11 Commission Report has 362 transcribed pages, 310 proofread and 40 validated by a second person. The Iraq Inquiry's Executive Summary has 142 of 150 pages proofread. Each Wikisource page is one printed page, checked by a human, which makes it ideal for testing our own pipeline. The text is public domain or open-licensed; Wikisource's formatting is CC BY-SA, so we attribute it and use it as a reference rather than redistribute it.

**Better extraction from the PDFs we have.** Six of our PDFs are tagged: the publisher's InDesign styles survive inside the file as a structure tree. One practical finding: for the Chilcot Inquiry's further volumes, the section PDFs on the inquiry's own site are tagged, while the volumes on gov.uk are not. And for scans there are modern tools, from a better text-recognition engine to vision models that read the page image and write structured text.

## A small experiment on the scanned reports

We tested four pages from the two scans against a text we corrected word by word from the page image, comparing the existing text layer, a modern open-source recogniser (tesseract), a layout-model pipeline (Docling with Apple's recogniser) and a small vision-language model (granite-docling).

- The existing text layers are already about 99% right on words. The remaining mistakes are real ("NAJA" for NASA) and matter for search and quoting, but they are sparse.
- Plain tesseract was slightly better on words and worse on footnote markers, which it turns into noise. Our footnote linking depends on those.
- The layout pipeline silently dropped lines: about three on one Challenger page, none of them flagged. Fluent output with words missing is the most dangerous failure, because no spell-check will notice.
- The small vision model was best overall, misreading two words in about 1,600, reading the footnote markers almost perfectly, and also emitting what we work hardest to infer: headings, list items and separated footnotes. It is slow, about a minute and a half a page on a laptop's processor.

Four pages is a probe, not a benchmark, and we have not yet run a large commercial vision model. But the lesson stands: use a vision model for structure, and never trust it blind. We already have an independent text, the PDF's own layer, so we can align the model's words to it, accept its structure where the words agree, and flag every stretch where the model has words the layer lacks, or the reverse. The dropped lines would have been caught at once.

## What we are doing about it

1. Stop asking which file is the source. For each report, record which source gives which part: words from the best text available (usually the PDF's own layer), blocks and notes from the richest structured edition, and page anchors and proof of fidelity from the PDF, which never stops being the check.
2. Take the cheap wins: import the Wikisource transcriptions as page-level references, evaluate the *Deep Water* ebook, and source the remaining Chilcot and Saville volumes from the tagged section PDFs and the inquiry's HTML.
3. For the two scans, pilot a vision model for structure, verified against the text layer.
4. Ask the publishers, but plan as if none will answer.
5. Run a sourcing checklist before the first ingest of any new report: how was the PDF made, is it tagged, is there an official HTML or ebook edition, is it on Wikisource, who holds the original files. It takes half an hour and would have found every source above.

The full research note, with the per-report sourcing plan, the experiment files and our draft requests to publishers, is in [the site's repository](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/docs/research/better-source-texts.md). If you know of a clean edition of a report we publish, please [tell us](https://github.com/reportsthatmatter/reportsthatmatter/issues/new/choose).
