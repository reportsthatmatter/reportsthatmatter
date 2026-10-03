---
title: "One file per report: why we keep public reports as plain text under version control"
date: "2026-10-03"
author: "Reports that Matter"
summary: "Every report on this site is one markdown file, full.md, rebuilt from pinned sources and kept in git. Here is why that beats both the official PDF and the web editions some inquiries published, with real examples of corrections, moved links and provenance, and the places where it still falls short."
status: draft
review:
  - "Numbers are from the site repository on 3 October 2026 (50,228 published paragraph ids, 4,803 aliased, 4,101 unmatched; 7,604 page markers; 68 corrections in four reports). Re-check them before publishing."
  - "The EPUB claim was tested locally: pandoc 3.x turned the 9/11 full.md into an EPUB with 1,742 linked notes in about 25 seconds, page markers showing as literal text. EPUB, print and an API are described as possible, not built."
  - "The post links decision records 0001 and 0002 on GitHub as open questions. Check you are happy pointing readers at docs/decisions/, and update the wording if either has been decided by publication."
  - "Diagrams are SVG files in assets/blog/one-file-per-report/; check how they look on a phone."
---

Most of the reports on this site were published as PDFs. A few were also published as web pages. We publish neither. Behind every report here is one plain-text file, `full.md`, kept under version control in a public repository, and everything you read on the site is rendered from it.

That sounds technical, but it decides things readers care about: whether a correction is visible, whether a link you shared last year still points at the same words, and whether anyone can check where the text came from. Here is what the file is, why we prefer it to the PDF and to official web editions, and where it still falls short.

## What a full.md is

It is the whole report as markdown, a plain-text format where a line starting `##` is a heading, a blank line separates paragraphs, and `[^1-1]` marks a footnote. Here is the start of chapter 1 of the 9/11 Commission Report, exactly as it sits in [the file](https://github.com/reportsthatmatter/us-911-commission/blob/main/full.md) (long lines shortened):

```markdown
%%page 1%%

## "WE HAVE SOME PLANES"

Tuesday, September 11, 2001, dawned temperate and nearly cloudless in the eastern United States. …

### 1.1 Inside the Four Flights

#### Boarding the Flights

**Boston: American 11 and United 175**. Atta and Omari boarded a 6:00 A.M. flight from Portland to Boston's Logan International Airport.[^1-1]
```

Two things are added to the report's own words. `%%page 1%%` marks where printed page 1 begins, so a passage can be cited the way these documents are normally cited. And each paragraph gets an id from its opening words: the first paragraph above is `tuesday-september-11-2001-dawned`, which is what the ¶ link beside it on the site points to.

Nobody types this file. A pipeline writes it from the official PDF, plus a cleaner edition where one exists, plus a short list of human corrections. The same inputs and the same version of the pipeline give the same file, byte for byte.

[![Diagram: the official PDF, a clean edition and corrections.yaml, each pinned, feed the report's pipeline, which writes full.md. The website, search, and highlights are rendered from full.md; EPUB, print and an API could be, but are not built yet.](/assets/blog/one-file-per-report/pipeline.svg)](/assets/blog/one-file-per-report/pipeline.svg)

## Why not just the PDF?

The PDF is the authority: when our text and the printed report disagree, the printed report wins, and our page numbers are its page numbers. But a PDF records where each letter sits on a page, not which lines make a paragraph, which small number is a footnote, or which words are a running head. All of that has to be inferred again, and the inference goes wrong in ways that are hard to spot by eye.

The 9/11 report's first sentence is a good example. A decorative drop cap left the PDF's text layer reading "Tue sday, Se ptembe r 11, 20 01", and the stray "20" was read as a footnote marker. One garbled line ended up sending 148 later footnote markers to the wrong note.

Even when the text is right, a PDF lets you link to a page but not a passage, and copying a quotation out brings its line breaks and hyphens along. A markdown file is searchable with any tool, quotable without cleaning up, and every paragraph has an address.

## Why not the official web edition?

Where an inquiry published HTML, we use it: since 3 October 2026 the 9/11 text here comes from the Commission's own web edition, with the PDF used for page numbers and checking. But we treat that HTML as a source, not as the thing we publish, for four reasons.

**It is in pieces.** The 9/11 edition is 18 separate web pages in an old character encoding, with the notes on a page of their own, so every footnote link crosses files. Anyone who wants "the report" has to put it back together first.

**It changes or disappears without a trace.** The Saville and Hillsborough websites now survive mainly in web archives. When we fetched them, the UK Government Web Archive answered scripted requests with a human-verification page and the Wayback Machine refused connections under load. If a page is edited, nothing records what changed. Versions matter: the court text of the Philip Morris judgment we found is the August 2006 version, while the PDF we publish is the amended September one.

**Its addresses are not designed to last.** The 9/11 HTML has no page numbers at all. Saville's has paragraph numbers but no printed pages. Hillsborough's split its report into numbered web pages ("page 3 of 11") that match nothing in print. A link into any of them is a link to a web page, not to a passage.

**It can't show our work.** Checks, corrections and history need one stable object to point at. A website is a moving set of pages; a file in git is one document with a record of every change.

## Every change is a diff

Because `full.md` is plain text in git, any change to it shows as a diff, reviewed in a pull request before it reaches the site. Here is one from 2 October, from the opening pages of the Lehman Brothers examiner's report. The PDF reading had treated two page breaks as paragraph breaks, so two paragraphs were each cut in half, and each second half became a paragraph of its own with its own link. Text alone can't tell, because each first half ends on a full stop. A pipeline release that looks at the printed layout (does the last line run to the margin, is the next page's first line indented?) joined them again. The diff shows exactly what readers now see differently (long lines shortened with "…"):

```diff
-There are many reasons Lehman failed, and the responsibility is shared. Lehman was more the consequence than the cause of a deteriorating economic climate.
+There are many reasons Lehman failed, and the responsibility is shared. Lehman was more the consequence than the cause of a deteriorating economic climate. Lehman's financial plight, and the consequences to Lehman's creditors and shareholders, was exacerbated by Lehman executives, … might better have anticipated or mitigated the outcome.
 
 %%page 3%%
 
-Lehman's financial plight, and the consequences to Lehman's creditors and shareholders, was exacerbated by Lehman executives, … might better have anticipated or mitigated the outcome.
-
-Lehman's business model was not unique; … Lehman would be unable to fund itself and continue to operate.
+Lehman's business model was not unique; … Lehman would be unable to fund itself and continue to operate. So too with the other investment banks, had they continued business as usual. It is no coincidence that no major investment bank still exists with that model.[^11]
 
 %%page 4%%
 
-So too with the other investment banks, had they continued business as usual. It is no coincidence that no major investment bank still exists with that model.[^11]
-
```

Every pipeline release re-runs every report, and its pull request carries the diff of every file that moved, so a change nobody meant to make shows up there rather than on the site months later. Diffs also keep the search index cheap: only the paragraphs that changed are re-indexed.

## Corrections are data, not edits

Nobody edits `full.md` by hand, because the next pipeline run would overwrite it. A correction goes in a small file beside it, `corrections.yaml`, and is applied as the last step of every run. This is the entry that fixed the 9/11 drop cap, made when that report's text still came from the PDF:

```yaml
- id: c-0001
  where: { volume: 1, printed: 1 }
  find: "Tue sday, Se ptembe r 11, 20 01,"
  replace: "Tuesday, September 11, 2001,"
  reason: drop-cap OCR garble; checked against the scan (chapter 1, printed p.1)
  added: 2026-10-02
```

Each correction must match exactly once. If the text it describes changes, or appears twice, the build fails and names it, so a correction cannot quietly stop applying. There are 68 corrections across four reports today, 56 of them in the scanned Challenger report.

The other half of the job is knowing where to look. For a report built from a clean edition, the pipeline compares the two texts and writes every disagreement to `fidelity.md`. The 9/11 file lists 74 open items, for example:

```text
| possible | edition text not in the PDF | `Rendering by Marco Crupi` | Vol 1 · PDF p.296 | …
| possible | PDF text not in the edition | `BOSTON Boston Center New York Cleveland Center …` | Vol 1 · PDF p.32 | 41 words: …
```

The first is a credit the web pages added under a drawing; the second is the labels on a map, which the HTML lacks. The file calls these "a review queue, not errors": a person decides, and records the decision as a correction or a dismissal.

[![Diagram: seven steps from a spotted error to a live page, using the 9/11 drop cap. A correction is written in corrections.yaml; the pipeline re-runs and fails unless it matches exactly once; the full.md diff is reviewed; the old paragraph id is recorded as an alias of the new one; a new version is published with the old one kept for rollback; the old link redirects to the new id.](/assets/blog/one-file-per-report/correction.svg)](/assets/blog/one-file-per-report/correction.svg)

## Links that survive a better text

An id taken from a paragraph's opening words lasts as long as those words do. Numbered ids (`p-318`) only look stable: fix one paragraph near the start and every number after it shifts, so old links quietly point at different text.

The catch is that fixing the words changes the id. The drop cap correction turned `tue-sday-se-ptembe-r` into `tuesday-september-11-2001-dawned`. So every id we have ever published is recorded, and when one moves, a generated `aliases.yaml` maps old to new:

```yaml
tue-sday-se-ptembe-r: tuesday-september-11-2001-dawned
```

Open an old link to the 9/11 report with `?p=tue-sday-se-ptembe-r` today and the site answers with a redirect to `#tuesday-september-11-2001-dawned`. The Lehman join above works the same way: a link to the old half-paragraph `lehman-s-financial-plight-consequences` now lands on `there-are-many-reasons-lehman`, the paragraph that holds its words.

We have published 50,228 paragraph ids across 13 reports. 4,803 now redirect this way. 4,101, about 8%, cannot be matched to any paragraph in the current text; half of those are in the Leveson Inquiry, the largest and most heavily reworked report. Those links still reach the report, but not the paragraph. We would rather say that than pretend every link is permanent.

## Provenance you can check

Every source file is pinned by its SHA-256 fingerprint. The 9/11 PDF is `6fa7e90a…62d8`; each of the 18 HTML pages has its own, along with the URL it came from, the date we fetched it and its licence, in the report repository's `reference/manifest.json`. If a file on disk no longer matches its fingerprint, the pipeline refuses to run: "The source changed, or the definition is wrong. Do not ingest until this is resolved."

The pipeline is a pinned version too, and each report's `ingest.ts` names every step applied to its text, so "how was this made?" has an exact answer. Processing notes ([the 9/11 ones](/reports/us-911-commission/processing)) say in plain language where the text came from, how it was checked and where it still differs from print. Each published version is stored under its hash, and the previous one is kept for rollback.

## One file, many outputs

The website is one rendering of `full.md`: section pages, the whole-report page, search, highlights and share cards all come from it, so redesigning the site never touches the text.

The same file works outside our code. Running the standard converter pandoc on the 9/11 `full.md` (`pandoc full.md -o 911-report.epub`) produces an ebook in about 25 seconds with all 1,742 notes linked. The page markers come through as literal `%%page 1%%` text, because pandoc doesn't know our one extension. A print edition, or an API serving paragraphs by id, would read the same file. We haven't built those, but the format doesn't stand in the way, and because each report is a public repository, anyone can.

## The limits

**We still depend on the PDF for page numbers.** The web editions we use carry no printed page numbers, so every page anchor comes from lining our text up against the PDF. Those anchors are also coarse: a page marker can only sit between paragraphs, so when a page begins mid-paragraph the marker goes after that paragraph, and the words at the top of the new page are cited with the old one. Look again at the Lehman diff: the joined paragraph now sits before `%%page 3%%`, so its second half, printed on page 3, is cited as page 2. On 9/11, 170 of the 362 pages transcribed on Wikisource begin mid-sentence, so at least that many page anchors are misplaced.

**Ids depend on one function.** A paragraph's id comes from a rule in our code (the first five words that aren't "the", "of" and the like), not from anything stored in the file. Anyone reusing the text who wants our ids has to re-implement that rule exactly. And as the numbers above show, 8% of published links can no longer find their paragraph.

**The format around the text is not settled.** What we add (page markers, ids, aliases, corrections, fidelity notes, editorial highlights) lives in different places with different ways of pointing at the text. A design to unify them is written up as [decision record 0002](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/docs/decisions/0002-annotation-format.md). It recommends keeping `full.md` plain, allowing a page marker mid-sentence, writing ids and per-paragraph provenance to a generated sidecar file, and giving every human layer one way to anchor: paragraph id plus a quotation. It is a proposal, not a decision. Whether to keep the `%%page%%` spelling, whether to freeze ids, and which page numbers each report should carry ([0001](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/docs/decisions/0001-page-numbers.md)) are all still open.

## Why it matters

Public reports are cited in court, in Parliament and in the press, often years after they were written. The people who rely on them need to know that the passage they quote is the one the inquiry wrote, that a link will still lead there, and that any change we make is visible. A PDF can't give them paragraph links or a history. A web edition can't promise to stay put or say what changed. One plain-text file per report, rebuilt from pinned sources, with every change in the open, can.

The files are public: start with [the 9/11 Commission Report's repository](https://github.com/reportsthatmatter/us-911-commission), which holds the sources, the pipeline definition, `corrections.yaml`, `fidelity.md` and the full history of `full.md`.
