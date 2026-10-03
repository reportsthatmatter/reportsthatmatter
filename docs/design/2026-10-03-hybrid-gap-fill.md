# Hybrid gap-fill: serving an incomplete clean edition

Bead reportsthatmatter-ivg.3 (epic ivg). Date: 2026-10-03. Implemented in @rtm/ingest (`fillGaps`, src/edition.ts) and applied to uk-hillsborough-panel. Builds on the hybrid design in [reference-editions.md](reference-editions.md) §2.1 and the `cleanEdition` mode of 9/11 (ivg.1) and Saville (ivg.2).

## The problem

`cleanEdition` serves a report from a clean edition (the publisher's HTML) and takes printed pages and the fidelity check from the PDF. It assumed the edition is complete. Most of the editions we can get are not: they survive as web archives, and the Wayback Machine holds some pages of a site and not others. Hillsborough's website edition is about 80% of the report once every capture is fetched (140 web pages); most of chapters 4, 7 and 9, the end of chapter 8, parts of chapters 10 and 12 and of Part 3, and the title pages were never captured. Without a gap-fill, those stretches are simply missing from the served text, and nothing fails: a wholly missing page aligns to nothing, so it does not even show up as "PDF text not in the edition" (that suspect needs some aligned word on the page). Other reports will need the same: Duelfer (CIA HTML, chapters 5-6 failed to fetch), any tags-only source that omits text (Chilcot's tags drop about 15% of words), any edition with a part published separately.

## The design

1. **The edition says where it is incomplete; the alignment says what is missing.** The adapter emits a `{ kind: "gap", reason }` block wherever it knows its source has a hole: before its first file (front matter it never carried), where a page number is skipped (`ch4-page-2` then `ch4-page-12`), at every change of section (a page of either may be missing), and after its last file. Only the adapter can know a file is missing; only the alignment can say which words that means. A gap that turns out to hold nothing (two consecutive web pages after all) fills nothing and costs nothing.
2. **What fills a gap is the PDF shadow's own blocks.** The shadow is the PDF ingest run with every declared pass, which `cleanEdition` already runs for page markers. The edition is aligned to the PDF body words (the same monotone anchor alignment that stamps pages); the gap's stretch is the PDF words after the last aligned edition word before the gap and before the first after it. The shadow's blocks are aligned to the same words, and every block whose placed words fall mostly in the stretch is filled in, in order. A block that straddles the edge (the shadow ran the edition's last paragraph into the next) is cut at its first or last word inside, so the edition's own words are never repeated.
3. **Notes travel with their blocks.** A filled block's `[^N]` markers are the shadow's; the note with that label printed on the block's page or the next three comes with it, relabelled `N-90xx` (rendered as N; never an edition label), and goes into the notes after the last note the edition cites before the gap. A marker whose note is not found is left as its bare number.
4. **What is not text the edition lacks is left out:** a block with no letter (a page number, a marker on its own line), a heading or lone contents entry whose words are an edition heading's (the PDF's running head, a divider page repeating a chapter title), and a block whose words the edition already prints within 100 blocks of the gap (a repeated phrase the aligner left unmatched; Hillsborough's terms of reference quote a clause Appendix 2 quotes again). Two refinements came with the headings (a8l, below): a heading the layout showed in the body's flow (`layoutHeading`) is a real subsection title, so it is kept though the edition has a heading with the same words (subsection titles recur: "Settlement", "Conclusion: what is added…"), and a heading's words are never a "repeated phrase" for being found in nearby prose; a heading the edition holds right at the gap's edge, which the PDF repeats, is dropped.
5. **Text the PDF prints outside a declared gap is never filled.** It stays a `PDF text not in the edition` suspect. An edition that leaves something out on purpose (a map's labels, a chart's boxes) looks the same to the alignment as one that lost it; only the adapter's declaration tells them apart.
6. **Provenance per block.** Every filled block carries `source: { pdf: { volume, pdfIndex }, gap }`; `IngestResult.blocks` says `source: "edition" | "pdf"` for every block; `EditionReport.filled` lists each gap (reason, blocks, words, notes, first and last PDF page, opening words), and each gap that filled something is one row of `fidelity.md`, so the review queue says where the served text is the PDF's.
7. **Page markers stay continuous with no extra machinery.** Filled blocks are the PDF's words, so they align exactly, and the existing marker placement runs on through them. Hillsborough keeps all 362 pages the PDF build marked and gains 9 (fillPrintedGaps).

The fill source is the shadow because it is general: every report with a PDF has one, it has already been through the report's own passes, and it carries page provenance. A tagged-PDF source (Hillsborough's tags, Chilcot's) could be a second fill source later, behind the same gap blocks; the tags have headings the shadow lacks, but no footnote structure and no paragraph joins across pages (reference-editions.md §5), so the shadow is the better default today.

## Supporting changes

- `footnoteNumbers("period")`, a declared page pass: page-foot notes numbered "104. Letter from…", flush at the margin (a numbered paragraph set in from it, like the Report summary's findings, is the body's), in the notes' smaller face (checked in the PDF layout: Appendix 1's own "8. In all of the above cases" is the body's), with the running foot below them given back to the body, and a lone note 1 low on a page opening a chapter's restarted numbering. With `layoutMarkers()` it lets the shadow read Hillsborough's 1,069 notes (6 before) and link their raised markers. The served text needs this twice over: the gap stretches' notes, and `notes: "page-foot"`, which aligns the edition's notes to the shadow's lifted notes.
- `notes: "page-foot"` with page-foot notes (rather than Saville's paragraph notes): the raw note lines are no longer also page text, which had put every note into the body stream twice.
- A block with no aligned word (a short heading, "Introduction") gets the page of the block it heads, in `IngestResult.blocks` only; the page markers are placed as before, so no markdown moves (9/11 and Saville oracle and golden counts unchanged).
- `InlinePiece.strike` → `~~…~~` (chapter 11's struck-through deletions in police statements).

## Hillsborough, before and after

| measure | PDF build (main) | hybrid with gap-fill |
|---|---:|---:|
| golden pages matching | 0/5 (5 xfail) | 5/5 (one golden corrected: 2.2.83 runs on to page 98) |
| oracle headings-missed / markers-unlinked | 390 / 932 | 144 / 24 |
| oracle oversplit / merged paragraphs | 123 / 808 | 12 / 403 |
| score vs held-out reference: boundary P / R / F1 | 77.7 / 74.6 / 76.1 | 87.0 / 87.7 / 87.3 |
| page-break joins, all rows; adjudicated ours wrong | 80.6%; 7/30 | 93.8%; 1/30 (a list's bullets, which the scorer reads as one block) |
| markers P / R; WER | 0 / 0; 1.5% | 98.3 / 83.5; 0.2% |
| PDF shadow vs reference (the PDF pipeline's own number) | as above | F1 77.1, joins 97.0%, 0/30 wrong, markers 98.4 / 79.5, WER 0.3% (boundary R 74.61 → 74.60: tp +2, fn +1) |
| quality: bare-footnote-marker, severed-into-quote | 453, 20 | 13, 2 |
| footnotes, headings | 6, 21 | 1,015, 306 |
| filled from the PDF | — | 10 gaps, 715 blocks, 43,324 words (22%), 215 notes, PDF pp. 1-4, 134-153, 226-251, 265-266, 269-286, 298-305, 354-358, 366-369, 378-379, 389 |

The reference is held-out and is itself a hybrid of the same website HTML (where captured on 2026-10-02) and the PDF's tags, so the served text's score is partly circular; the shadow row is the PDF pipeline's honest number, and it did not fall. The 37 web pages fetched for this work are not in the reference's `blocks.jsonl`.

## Open

- In the filled stretches the shadow's other defects remain: 13 note numbers bare, and 15 runs of numbered paragraphs that are one block (a paragraph label after a full stop, "… fence. 2.4.54 As with the call to SYMAS …", is not always a start in the PDF's text). The headings are fixed (below).
- The oracle counts raised digits only on body-face lines, so markers inside quotations (67 of Hillsborough's 107 markers-spurious) count as spurious in both the hybrid and the shadow.
- A wholly missing page is invisible to the edition fidelity check; a "page with no edition word and no declared gap" signal would catch an adapter that forgot to declare one.

## Headings in the filled stretches (bead a8l, 2026-10-03)

In the 10 filled stretches (22% of the text) every subsection heading ran into the paragraph after it ("Recognition of the disaster 2.4.20 The first essential requirement …"): the shadow's block parser knows a heading by its text (listed in the contents, numbered, all capitals), and Hillsborough's are set by face and size alone. Three ways to find them were weighed.

| way | what it gives | why not / why |
|---|---|---|
| the PDF's tags (H1 to H3 in the structure tree) | the headings, with levels | Hillsborough's PDF is tagged, but most PDFs are not, so it does not carry to the next gap-filled hybrid; it needs a structure-tree reader the library does not have (the scorer's is Python with pikepdf); and the held-out reference is built from those same tags, so a fix that read them would score itself |
| the numbering the HTML parts use (text before the first "2.4.20" is the heading) | the 58 headings that precede a numbered paragraph | misses the 19 that precede unnumbered text (Part 3, the appendices), cannot say where a long or wrapped heading starts, and gives no level |
| typography (`typographicHeadings`) | all 79, with levels, from what every PDF has | chosen |

`typographicHeadings({ firstLevel, sizes })` (ingest, `src/typographic-headings.ts`) reads the layout (`pdftohtml -xml`: size, weight, colour per line): a heading line is larger than the body (1.15 times), not in the body face, not italic, short, not a bare number, not ending a sentence, in a face that recurs. Hillsborough declares `sizes: [26, 21]` (26pt bold maroon is level 4, 21pt medium maroon level 5, as on the website's pages); its 35pt face is a part or chapter title that `listedHeadings` reads. Each heading is found in its page's blocks and the block is cut there (it opens the block or follows a sentence end). The same pass would serve any hybrid whose PDF-filled stretches, or whose PDF-only reading, sets headings by typography; the 38s.14 idea (bold or large, short, no sentence end, as an opt-in fallback) is the same signal without the cut, and is covered here except for bold-only lines at body size.

| measure (Hillsborough) | v0.21.0 | with the pass |
|---|---:|---:|
| layout heading lines inside the 10 gaps / found as a heading in full.md (by text; the 10 before are titles that are also a heading elsewhere) | 79 / 10 | 79 / 79 (76 at the level the layout's size says; 3 differ because the website's Part 3 and chapter 6 and 11 use shallower levels for the same sizes) |
| paragraphs opening on a title-case run then a paragraph number (`Recognition of the disaster 2.4.20 The…`) | 58 | 0 |
| headings, paragraphs | 306, 2,734 | 380, 2,724 |
| ids: paragraphs whose id moved (aliased), ids that were only a heading's words (now headings; unmatched in the alias file) | | 65, 11 |
| oracle headings-missed (of 393 expected) | 144 | 70 |
| oracle paragraphs-merged | 403 | 337 |
| golden pages (two new: pp.134 and 378, read off the page images) | 5/5 (the new two fail: heading fused) | 7/7 |
| anchors: markers wrong, stacked, blocks under another page's marker | 15, 1, 86 | 15, 1, 86 |
| quality: heading-repeated, heading-long (both real headings, budgets raised with a why) | 2, 5 | 3, 7 |
| held-out score, PDF shadow vs reference (looked at once, at the end): boundary P / R / F1 | 90.2 / 83.6 / 86.8 | 91.1 / 91.1 / 91.1 |
| held-out score, same: joins all rows, adjudicated ours wrong, marker P / R, WER | 92.0%, 0/30, 99.9 / 95.9, 0.19% | unchanged |
| held-out score, edition adapter vs reference adapter (agreement): boundary F1 | 87.3 | 88.5 |
| other reports (`pnpm ingest check`) | | all 12 unchanged |

Reading the 10 gaps before and after found two more effects of the pass that the checks had not been written for, both in `fillGaps`: it dropped any filled heading whose words an edition heading also has ("The Stuart-Smith Scrutiny", "Judicial Review", "Lack of leadership") and any heading of 3 or more words found in nearby prose, so about a tenth of the headings vanished on the first run; and the aligner leaves a heading that recurs ("Conclusion: what is added to public understanding", 13 times) unmatched at a gap's edge, so the PDF's copy repeated the edition's. The 65 paragraphs that were a heading and its text now have new ids, which `aliases generate` points the old ones at (the old-text matcher failed on these at first: the old paragraph opens with the heading, so its first four words ("initial response 2 4") read across the end of the paragraph before and the next label, and the alias pointed at the wrong paragraph until the matcher learnt to start from the printed number, `src/lib/alias-gen.ts`). 11 ids were paragraphs that were only a heading's words (or a two-word stub of one) and are headings now, so the alias file lists them as unmatched. The one editorial reference to a moved id (`continued-incomplete-communication-2-4`, now `2-4-53-meanwhile-3`) is updated, and `pnpm marks check` replays all 13 stored marks and 38 editorial quotations against the new text with none broken.
