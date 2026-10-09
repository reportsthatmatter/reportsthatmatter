---
name: report-source
description: Use when starting a new report or a further volume on Reports that Matter, before any repo or ingest work — finding the official original and any better renditions (HTML, tagged PDF, EPUB, Wikisource, court text, publisher files), checking versions, licences and text layers, and choosing the source stack. Stage 1 of the preparation pipeline.
---

# Stage 1: source

**Level:** `level:judgement` (Opus): choosing the stack is a judgement; recording a stack already settled is `level:specced`. Rules for every agent: [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) (R1-R15).

Design: `docs/design/2026-10-03-report-preparation-pipeline.md` §2-3 and the worked example in §9. Background and the checklist's origin: `docs/research/better-source-texts.md` §3-5. Candidate quality: `docs/plans/brief-2026-01-13-good-reports.md`.

**Entry.** A Bead for the unit (report id plus scope) with a reason it matters now.

## Procedure

Work in a scratch directory; commit nothing in this stage.

0. **Re-check the candidate bead's claims** ("No HTML found", "untagged"): they were written quickly and are often wrong (gqsy.4, gqsy.7 both had official HTML the bead missed).
1. **Find the official original** and download it once. Open the publisher's own report page and list every file it links (HTML, large print, easy read, EPUB, annexes); for gov.uk, `curl -s https://www.gov.uk/api/content/<path>` lists the attachments and the change history. `shasum -a 256` it. Note publisher, date, URL, licence.
2. **Run the sourcing checklist** (better-source-texts.md §5.6). Answer every item with a source, "none", or "not checked":
   1. How was the PDF made? `pdfinfo <pdf>` (Creator, Producer, Tagged), `pdfinfo -box -f N -l N <pdf>` (bleed margins: furniture outside the CropBox), `pdffonts -f N -l N`, `pdfimages -list -f N -l N`, and `pdftotext -f N -l N -layout` on two body pages. Born-digital: words are right, look for structure. Scan: plan for a verified vision pass (kyj3). **Does a page print its number?** Look at one page image; if no folio, check whether the contents cites PDF pages (then stage 3 declares `pdfPageNumbers()`; Post Office Horizon, gqsy.2). **Tagged?** `pdfinfo` can say "Tagged: no" while a structure tree exists: check `pdfinfo -struct <pdf> | head`, and count its element types (`pdfinfo -struct <pdf> | sed 's/^ *//; s/ .*//' | sort | uniq -c | sort -rn | head -20`; custom roles such as `Basic_Footnote_IBI` count too): a free answer key for the first ingest's note and heading counts.
   2. Tagged, and other renditions of the same PDF (inquiry site vs gov.uk, web vs print)?
   3. Official HTML, live or archived? Wayback: `curl "https://web.archive.org/cdx/search/cdx?url=<prefix>/*&fl=original,timestamp,statuscode,length&filter=statuscode:200&collapse=urlkey"`. UKGWA blocks scripts; use Wayback. If Wayback answers 503, write "not checked (Wayback down)" and whether a live edition already settles the question.
   4. Official EPUB (GPO bookstore, publisher ebook listings)?
   5. Wikisource, and how much is proofread?
   6. Court documents: CAP, CourtListener, sealed vs unsealed docket entries.
   7. US congressional after ~1995: govinfo HTML or text.
   8. Who holds the originals; request route (accessible formats, FOIA)?
3. **Check versions.** Read the original's own note on the printing or edition first. List the publisher's file directory in Wayback (CDX on the PDF's URL prefix): a `_0.pdf` beside the original name is a re-upload, so fetch both and diff the text (gqsy.2: one typo). Redacted vs unredacted, errata and correction notices, reprints, a print revised after the web edition (or the reverse); a clean edition can carry the right structure and the wrong words. Compare page counts and a few passages; for a whole-text comparison of an HTML edition against `pdftotext` output, compare word 6-gram counts (a line diff of 100k+ words is too slow), then read the unmatched clusters. Every difference is named, with how it will be handled.
4. **Write the source stack** as a table: for words, blocks/headings, notes, page anchors and provenance, which source and its role (canonical, structure, reference, rejected and why). The official original is always the canonical citation target.
5. **Record the scope decision** (which volumes; one report id or several) and its reason.
6. **Note layout evidence** you saw for stage 3 (columns, banners, page boxes, notes style).
7. Publisher requests: draft them in the Bead for Rufus (better-source-texts.md Appendix A is the model). Never send.

## Exit gate

- [ ] Canonical original downloaded, SHA-256 recorded, licence known
- [ ] Text-layer verdict: born-digital or scan; tagged or not
- [ ] All eight checklist items answered (a "not checked" says why it cannot change the stack)
- [ ] Version risks named, each resolved or beaded
- [ ] Source stack table and scope decision written in the unit Bead's notes (`bd update <id> --append-notes`)

**Hands on:** the Bead notes. **Gap:** `pnpm source probe` (item 1 and the Wayback listing in one command) does not exist yet (ifb5.10). Retro and lessons: agent protocol R13-R14.
