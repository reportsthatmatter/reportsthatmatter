# Changelog

Source for `/changelog`. Hand-written: this is a record of what changed and why
it mattered, not a dump of commit messages.

Newest first. Keep entries short and concrete — a number beats an adjective.

---

## 2026-08-21 — Quote the exact words, and keep what you find

**Share part of a paragraph.** Selecting half a sentence used to hand you a link
to the whole paragraph — a broader claim than you meant. A shared link now names
the words themselves, marks exactly those words when someone follows it, and
previews that sentence rather than the paragraph around it. If the quoted words
are no longer in the document, the link shows the paragraph they came from
rather than marking whatever else matched.

**Quoting longer passages, and lists that read in order.** Selecting several
sentences now produces a link to exactly those sentences rather than to the
paragraph around them, and a quote can run across a paragraph break. Footnotes
in the margin stay out of a selection made in the body. Separately, bulleted
lists in the source documents are now rendered as lists: they used to be run
together into a single paragraph, with a wrapped item's tail appearing after the
item that followed it — a defect reported against the original site in 2016.

**Highlights you can take with you.** Save a passage and it is still marked when
you come back. Everything you have kept is listed at `/highlights` and exports
as Markdown — quote, source, printed page, and a link back to the exact words.
It lives in your browser: no account, and none of it is sent to us.

**What other readers marked.** A passage highlighted by another reader now
shows the same way any highlight does, faintly at first and stronger as more
readers mark it — no count printed, just the sense that this passage caught
someone's attention too. Nothing is recorded until a reader shares or saves a
passage, and nothing about a reader is kept, only a passage and how many
people marked it.

---

## 2026-08-22 — Report pages load without touching the source document

Every report page used to be rendered from its source markdown on the fly,
which was slow enough to occasionally exceed the CPU a single request is
allowed and return an error page instead. Report pages are now built once,
ahead of time, and served as-is — pages load faster and hold up under a spike
of traffic that would previously have knocked some of them offline. No visible
change otherwise.

---

## 2026-08-02 — A third report, and better footnotes everywhere

**Added:** *Investigation of the Challenger Accident* — the House Science
Committee's 1986 report into the loss of the Space Shuttle Challenger. 438
pages, 99.8% of the source text retained.

**Footnotes.** Nearly all of them are now found and placed beside the text:
recall went from about three-quarters to around 97%. Where a footnote block had
previously been missed, its citations were left stranded in the middle of the
prose; that no longer happens.

**Page numbers** now work for reports that print them at the top of the page as
well as the bottom. The Wall Street report puts them in a header and so had no
page anchors at all — it now has 628.

**Contents pages** are cleaner. Numbered recommendations were being read as
section headings, filling a contents list with half-sentences.

## 2026-08-02 — Reports split into sections

A report is no longer one enormous page. The Wall Street report was **2.9 MB**
— not a reading experience, a download. Each report now opens on its contents,
and each section is a page of its own, following the document's own structure.
The whole report is still available on one page for anyone who wants to search
across it.

Links made before the split still work. A link naming a passage is routed to
the section holding it, and anything else falls back to the whole-report view.

## 2026-08-02 — The archive is back

The previous version of this site is readable again at
[old.reportsthatmatter.org](https://old.reportsthatmatter.org). Its old URLs
redirect there.

## 2026-08-02 — The Wall Street report, properly converted

The PSI financial crisis report had been converted before the ingestion
pipeline existed, and it showed. **8,178 blocks with a median length of 89
characters** — prose paragraphs run to about 600 — because every line of the
PDF had become its own paragraph. **1,641 stray page numbers** left mid-text.
**Two headings in a 645-page document.**

Re-ingested from the source PDF: **162 headings**, 98.3% of the source text
retained, no stranded page numbers, and paragraphs that are actually paragraphs.

Doing it exposed a real gap. Footnote numbers appear in two layouts — inline
with their text, or alone on a line with the text beneath — and only the first
was supported. This report had yielded **7 footnotes**; it now yields **1,356**,
rendered as 2,725 sidenotes. The Jack Smith report gained from the same fix,
206 → 229.

The report moved to `/reports/us-psi-financial-crisis`, matching its source
repository. The old URL redirects.

## 2026-08-02 — Sidenotes, and links that stay put

**Sidenotes.** Footnotes now sit in the margin beside the sentence they support
rather than 70 KB away at the end of the document. A footnote you have to travel
to is a footnote nobody reads, and in these reports the citation *is* the
evidence. On narrow screens, where there is no margin, a note opens on tap.

**Stable paragraph links.** Paragraph addresses now derive from the paragraph's
own opening words — `#rioters-capitol` rather than `#p-318`. The old scheme
numbered by position, which meant that re-converting a report to fix a single
scanning error renumbered everything after it: every link ever shared kept
working while quietly pointing at different text. For a project whose whole
proposition is citing the exact passage, that was the worst available failure.

**Printed page anchors.** The page numbers from the original document are now
addressable — `#page-46` — and shown in the margin. It is how these documents
are actually cited, and it can be checked against the original PDF.

**Shared links preview the passage.** A link to a specific paragraph now shows
that paragraph in the preview when posted, instead of a generic site
description.

## 2026-08-01 — The site, rebuilt

A new design: off-white, mid-grey rather than black, a classical serif for the
documents themselves and small monospaced type for everything structural. Fewer
things, more space. Serious documents should look serious.

Behind it, a new **ingestion pipeline** — PDF in, clean Markdown out,
deterministically — with automated fidelity checks that gate on what can
actually be decided: that no text was invented, that none was lost, that no page
furniture survived. Whether a scan was *read* correctly is a human judgement, so
the pipeline surfaces the passages most likely to be wrong for review rather
than hiding them behind a score.

First report through it: **the Jack Smith Special Counsel report, Volume One** —
169 pages, 99% of the source retained, every paragraph individually linkable.

**Highlight any passage** to copy a link straight to it.

The previous site remains readable in the
[archive](https://reportsthatmatter.github.io/reportsthatmatter/); its URLs
redirect there.
