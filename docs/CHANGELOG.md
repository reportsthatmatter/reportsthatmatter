# Changelog

Source for `/changelog`. Hand-written: this is a record of what changed and why
it mattered, not a dump of commit messages.

Newest first. Keep entries short and concrete — a number beats an adjective.

---

## 2026-09-12 — 166 wrong links stop pretending to be citations

Turning scanned text into a web page means guessing which fragments are
web addresses. That guess was wrong far more than it looked: a dropped
space at the end of a sentence, immediately before a short capitalised
word, was routinely read as a link — "flight.At 8:46 it happened" became
a live link to ".at", Austria's domain suffix, not a citation to anything.
155 of the 166 were exactly this, concentrated in the 9/11 Commission
Report; the rest were short scanning errors that happened to end in a
real country code.

Every one is now plain text again, and nothing that was a real link was
touched — Leveson's own 94 citations to its own website, and every
`guardian.co.uk`, `FT.com`, and similar bare citation elsewhere, still
click through exactly as before.

---

## 2026-09-12 — 2,058 numbered paragraphs stop running into each other

A reader flagged it directly: in the Litvinenko Inquiry, paragraph 3.77
was printing as the tail end of 3.76's paragraph, not its own. The cause
was the numbering itself — "3.77" prints flush against the margin, the
same column an ordinary line of running text sits at, so nothing told the
scan apart a genuine new paragraph from a line that just continues the
one above. Wherever the page also happened to carry no blank line between
paragraphs — common in the Litvinenko Inquiry, Leveson Inquiry, and
Hillsborough Panel report, all three of which number this way — several
numbered paragraphs in a row could run together into one.

The numbering is now read as what it is: Leveson gains 1,818 paragraphs
back, Litvinenko 150, Hillsborough 90 — 2,058 in total, all previously
fused into a neighbour. Nothing is reworded; every word is exactly where
it was, just correctly split.

[Read the corrected paragraph](https://reportsthatmatter.org/reports/litvinenko-inquiry/chapter-2-leaving-russia).

---

## 2026-09-11 — 210 of Challenger's Findings and Recommendations get their own paragraph back

The Committee's report structures every issue it investigated the same
way — a question, a Finding, a Recommendation — but the label marking each
one printed flush against the margin with nothing to set it apart from
ordinary body text. The scan read it as part of whichever sentence came
right before it: "...without certification and approval. Recommendations"
looked like one run-on thought, and the numbered list that actually
answered "Recommendations" followed as if unrelated. 214 of these labels
were affected; 210 are now their own paragraph, exactly as printed.

[Read the corrected report](https://reportsthatmatter.org/reports/challenger-accident/full).

---

## 2026-09-11 — Footnote markers stop landing on dates and phone numbers

A handful of ordinary numbers in the prose were being turned into footnote
links by mistake, because the linker only checked whether a number matched
some footnote somewhere in the document — and a report with thousands of
footnotes has almost every number 1–999 as *some* footnote's number. A date
like "11, and 19 March 2003" had 11 and 19 turned into citations for
unrelated footnotes; a repeated "Telephone orders: 020 7219 3890" block did
the same to its digits. Both are now recognised and left alone. Six reports
had at least one of these; Leveson and Hillsborough had the most.

Checking why Hillsborough's sidenotes stopped rendering after this fix
turned up a separate, pre-existing gap: its citations are a numbered list,
not superscript markers, and a handful of list fragments were being
misread as footnote definitions that were never real notes. That's now
tracked on its own rather than papered over.

---

## 2026-09-11 — Footnotes stop showing someone else's citation

When two different footnotes happened to share the same printed number — a
report restarting its numbering per chapter, or a scan simply misreading a
footnote's digits — the pipeline treated them as the same note. Every
reference to that number showed whichever one of them won a silent merge,
regardless of which note the reference actually pointed at. Fixed at the
root: a reference is now resolved against its own note, in the order both
were written, not through one shared lookup by number.

Seven of ten reports had this to some degree; two are worth naming. Deepwater
Horizon was hit hardest — the same 1,226 sidenotes now each show only their
own text instead of a merged blob, and the page dropped from 2.07 MB to
1.78 MB with nothing removed, just no longer duplicated. The Leveson Inquiry,
which restarts numbering every chapter, had drifted ten pipeline releases
behind everything else in the archive; fixing its footnotes meant catching it
up, so its recall and heading detection also improved along the way.

[Read the corrected Deepwater Horizon report](https://reportsthatmatter.org/reports/us-deepwater-horizon/full).

---

## 2026-09-11 — Every page gets a real share-card image

Almost the whole site had no `og:image` — a link shared to Slack, iMessage, or
X previewed as bare text everywhere except five curated quotes in one report.
Every report now has its own default card (title, author, date), the site has
one too, and a shared link always falls back to the most specific card that
exists: a curated quote, then the report's own card, then the site's.

![Reports that Matter — the site's default share card](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/2026-09-11-social-preview-cards/1-site-card.png)

Full before/after, including a couple of the new report cards: [visual
changelog](https://github.com/reportsthatmatter/visual-changelog/blob/main/CHANGELOG.md#2026-09-11--every-page-gets-a-real-share-card-image).

---

## 2026-09-11 — Challenger's fidelity queue starts moving: 31 scanning slips fixed so far

Every report carries a review queue of places its scan might not read right —
nearly 1,000 flagged spots across the archive, untouched until now.
Challenger's is the largest queue, and it's the first to get a real pass: the
Committee's own findings and recommendations, then its footnote citations,
checked one by one against the source. 31 scanning errors corrected so far —
"Recommendation" headings that had been printing as "Recomrnendation",
footnote numbers reconstructed from OCR garble and confirmed against the
scanned page images — and dozens more flagged spots checked and confirmed
correct as printed. 310 of Challenger's flagged spots remain, mostly in the
reproduced memos and equipment tables of its appendices.

[Read the corrected report](https://reportsthatmatter.org/reports/challenger-accident/full).

---

## 2026-09-05 — A report can be republished without redeploying the site

Until today, correcting a single line of one report meant rebuilding and
redeploying the whole site, and every report's text travelled with the
application code. Each report is now stored separately, under a fingerprint of
its own contents, and the site is simply told which fingerprint to serve. All
ten are live that way.

Two things follow from it. Correcting a report is now a change to that report,
which is what it always should have been. And because a version is named by
its contents, older versions remain exactly where they were — so a citation
can point at the precise text it quoted, and putting a correction back is a
single instruction rather than a rebuild.

Publishing goes through one gate that reads back everything it was given and
refuses to point at a version that is missing anything, so a half-finished
publish cannot reach a reader. Each report has its own key, which can change
that report and nothing else.

---

## 2026-09-05 — Paragraph ids get a gate, and pages stop carrying their layout

Paragraph ids are permalinks, and they had no guard. Each report's own
baseline covers its markdown, but the ids are made one stage later, by code in
the site repo that no report has a pin on — so a one-word edit there could
repoint every citation in the archive and nothing would notice. `pnpm corpus
check` now fingerprints every section's citable ids across all ten reports and
fails naming the sections that moved. Changing a single number in that code
makes it fail on all ten, which is how we know it works.

The pre-rendered files also carried the site's own layout, which meant a
styling change rewrote all six hundred of them and a corrected report could
not be republished without redeploying the whole site. They now hold the
report's text and nothing else, and the page is put together when it is asked
for. All 578 pages the site serves are byte-for-byte what they were before —
this is a change to where the work happens, not to what anyone reads.

---

## 2026-09-04 — The site stops carrying its own output

Report pages were pre-rendered into the repository and committed: 133 MB of
generated HTML around 2 MB of application code, and **85% of all git history**.
They are now build output, regenerated in about three seconds and never
committed.

Along the way, `body.json` is gone. It held every section of a report's HTML in
one file — 55.5 MB across the archive, 19.0 MB for Leveson alone against a
25 MiB per-file ceiling — and a shared quote link parsed all of it to quote a
single paragraph. A shared link now serves the *same* static page as the plain
URL with only its `<head>` swapped, and takes the quoted words from the one
section that holds them. Generated output drops from 133 MB to 77 MB, and the
next report on the list, the Chilcot Inquiry at roughly twice Leveson's length,
stops being blocked by a file-size limit.

All 31,918 indexed passages were compared against the previously published
search index and are byte-for-byte identical, so nothing about what search
finds has changed.

This also closes a latent hazard rather than a theoretical one: a documentation
commit six days ago had deleted 413 generated files with no replacement,
leaving `main` with no page artifacts at all for six of the ten reports.
Deploys upload from disk after a manual pre-render, so the live site was never
affected — but a deploy from a fresh clone would have dropped those six reports
off the site. Build output committed to git can drift from what the build
produces, and this one had.

Background and what comes next: [content publishing](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/docs/plans/2026-09-04-content-publishing.md).

---

## 2026-09-03 — Four more reports

The archive goes from six reports to ten:

- **The 9/11 Commission Report** (2004) — 585 pages. Every page of the PDF
  carried a leftover typesetting slug ("Final1-4.4pp 7/17/04 9:12 AM Page 13");
  it is stripped, and the page number is read back off it so the page anchors
  still work.
- **Deep Water: The Gulf Oil Disaster and the Future of Offshore Drilling**
  (2011) — the BP Deepwater Horizon commission's report to the President,
  386 pages, 775 footnotes.
- **United States v. Philip Morris** (2006) — Judge Kessler's 1,682-page
  RICO opinion, with its findings of fact numbered and citable one by one.
- **The Report of the Hillsborough Independent Panel** (2012) — 389 pages;
  99.7% of the words retained, the cleanest ingest in the archive. Its
  section headings are set as colour and weight rather than text, so for now
  it reads best as one continuous document.

Each report keeps its own repository under the `reportsthatmatter`
organisation, holding the source PDF and the definition it is built from.

![United States v. Philip Morris — the contents page of a 1,682-page opinion](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/2026-09-03-four-more-reports/us-v-philip-morris-contents.png)

Before/after for all four — including where Hillsborough's sectioning falls
short — is in the [visual changelog](https://github.com/reportsthatmatter/visual-changelog/blob/main/CHANGELOG.md#2026-09-03--four-more-reports-911-commission-deepwater-horizon-philip-morris-hillsborough).

---

## 2026-09-01 — The Litvinenko report stops quoting itself

Most of the Litvinenko report's paragraphs were being shown as though they
were quotations from somewhere else. The report numbers its paragraphs in the
margin and indents the text beside them, and the pipeline read that indent as
a quotation — so 865 of its 1,089 paragraphs were cut in half, the first line
left as text and the rest set as a quote.

Paragraphs are whole again, and the passages that genuinely are quotations —
witness evidence, expert statements — still read as quotations.

![Chapter 2, with paragraphs whole and one real quotation](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/2026-09-01-litvinenko-blockquotes/after.png)

---


## 2026-08-29 — The Columbia report, and words that stopped breaking in half

The Columbia Accident Investigation Board report joins the archive: 248 pages
on the loss of the shuttle and the decisions behind it. It had been ruled out
once, because it is set in two columns and the text extractor read straight
across them, welding an unrelated sentence into the middle of every paragraph.
It is now read a column at a time.

Across every report, words the typesetter broke at the end of a line are
joined back together — "Chal- lenger" was appearing as two words, and so were
another two thousand in Columbia and six hundred in Leveson. Where a document
never writes the word whole anywhere, the break is left visible rather than
guessed at.

The Litvinenko report's footnotes also work properly now: around 230 of them
appeared as bare numbers stuck to the end of a word, because the scan lost the
space before the superscript.

![The Columbia executive summary, reading in column order](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/2026-08-29-columbia-two-column/reading-view.png)

Two contents pages also stopped inventing entries: the Jack Smith report had
a court docket row listed as though it were a section of the report, and the
Leveson contents page had been generating headings out of its own listings.

The Columbia text was published three times before it was right — the two
columns kept finding new ways to run into each other, and each attempt looked
correct until the page was actually read. The full account, with pictures, is
in the [visual changelog](https://github.com/reportsthatmatter/visual-changelog/blob/main/CHANGELOG.md).

---


## 2026-08-28 — Thirty half-sentence headings gone, and citations that had quietly collided

The Wall Street report's contents page listed thirty headings that stopped
mid-sentence — "Safeguard Against High Risk Products. Federal banking
regulators should" — each one a numbered recommendation whose second half had
been stranded in a separate block. They now read as the recommendations they
always were, and five section pages that existed only because of them are
gone.

Separately, a printed page number is not unique inside these reports: the
Jack Smith report prints "2" on three different pages, the Challenger report
collides sixteen times. Every occurrence carried the same link target, so a
citation to the second page silently landed on the first. Each occurrence now
has its own; links that already worked are unchanged.

Behind both: every report now records how it was built — which PDFs, in what
order — and the pipeline checks its output against the original scans rather
than, as it had been doing, against itself.

---


## 2026-08-28 — Leveson reads across the page as it does in print

Several passages in the Leveson Inquiry were broken at a page edge: running
headers appeared in the text, and ordinary continuation lines were shown as
quotations. The report now keeps paragraphs together across those page breaks
and preserves only genuine indented quotations.

![Operation Glade after the page-flow repair](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/2026-08-28-leveson-ingest-layout/after-operation-glade.png)

---

## 2026-08-28 — The Litvinenko Inquiry gets its real contents page

The Litvinenko report's table of contents was listing sentence fragments —
"On 23 November 2006, Alexander Litvinenko died at…", "G-BNWB)", "RESTRICTION
ORDER" — because the ingest pipeline recognised `A.` and `I.` section markers
but not a label that carries its own number, so every `Part` and `Appendix`
heading was read as ordinary text while stray all-caps lines and numbered
narrative sentences were promoted in their place. The pipeline now reads
`Part N` / `Chapter N` / `Appendix N` headings (titles that wrap included),
ignores a lone acronym or an aircraft registration on its own line, and keeps
a numbered narrative sentence out of the heading structure. The contents page
now shows Parts 1–10 with their chapters and all twelve appendices. Part 5's
divider page has no text in the scan, so it is still absent and its chapters
sit under Part 4.

---

## 2026-08-22 — A fifth report: Leveson on the press

**Added:** *An Inquiry into the Culture, Practices and Ethics of the Press* —
Lord Justice Leveson's 2012 report into UK press conduct and regulation,
prompted by the phone-hacking scandal. Four volumes bound into one continuous
document: 2,022 pages, over a million words, the largest report in the archive
by a wide margin.

The Wall Street and Challenger reports were also re-ingested under the current
pipeline and republished, mostly a cleaner table of contents and a list-formatting
fix, with nothing lost.

---

## 2026-08-22 — Report pages load without touching the source document

Every report page used to be rendered from its source markdown on the fly,
which was slow enough to occasionally exceed the CPU a single request is
allowed and return an error page instead. Report pages are now built once,
ahead of time, and served as-is — pages load faster and hold up under a spike
of traffic that would previously have knocked some of them offline. No visible
change otherwise.

**Search across every report.** Find a name, a date, a bank — anywhere in the
archive, not just the report you happen to be reading. A result is the exact
matched passage, not a page to go hunting through: it shows the sentence, the
report and section it's in, the printed page, and follows through to those
exact words highlighted, the same as any shared link. Scope a search to one
report from that report's own page, or search everything from the header.

![Search results, term highlighted, across several reports](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/2026-08-28-highlights-social-proof-search/7-search-results.png)

---

## 2026-08-21 — Quote the exact words, and keep what you find

**Share part of a paragraph.** Selecting half a sentence used to hand you a link
to the whole paragraph — a broader claim than you meant. A shared link now names
the words themselves, marks exactly those words when someone follows it, and
previews that sentence rather than the paragraph around it. If the quoted words
are no longer in the document, the link shows the paragraph they came from
rather than marking whatever else matched.

![Following a quote link marks exactly the quoted words](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/2026-08-28-highlights-social-proof-search/2-quote-link-marks-exact-words.png)

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

![The /highlights page, a saved quote with its source and an export](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/2026-08-28-highlights-social-proof-search/3-highlights-page.png)

**What other readers marked.** A passage highlighted by another reader now
shows the same way any highlight does, faintly at first and stronger as more
readers mark it — no count printed, just the sense that this passage caught
someone's attention too. Nothing is recorded until a reader shares or saves a
passage, and nothing about a reader is kept, only a passage and how many
people marked it.

![A passage marked by six readers, washed stronger than one marked by a single reader](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/2026-08-28-highlights-social-proof-search/4-social-proof-strong-wash-6-readers.png)

---

## 2026-08-09 — Contents pages read as a hierarchy

The contents page listed every section flat, with no way to tell a subsection
from the part it belongs to. Sections now indent under their part:

![Contents page, sections indented under their part](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/2026-08-09-toc-and-sidenotes/2-contents-page-after-hierarchy.png)

A long footnote also no longer drags the notes after it out of alignment or
spills into the footer — clamped to about 8 lines with a "Show full note"
toggle:

![A clamped footnote, expanded on click](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/2026-08-09-toc-and-sidenotes/8-sidenote-clamp-expanded.png)

Full before/after: [visual-changelog](https://github.com/reportsthatmatter/visual-changelog/blob/main/CHANGELOG.md).

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
