---
title: "Getting the text right: what goes wrong turning official PDFs into citable web text, and what we are doing about it"
date: "2026-10-02"
author: "Reports that Matter"
summary: "The defects we kept hitting when turning official PDFs into citable web text, why fixing them one at a time stopped working, what we built instead, and what it has achieved so far."
status: draft
review:
  - "DECISION: the sentence beginning 'Much of this work was carried out by AI coding agents' (near the end, before the links) says the work was done by AI agents under human direction. The site has not said this anywhere before. Keep, reword or cut before publishing."
  - "Written before v0.18.0 (page-break joins) was live. Check that the pipeline releases and the numbers under 'What changed for readers' match what is published, and update the date, before publishing."
  - "Author byline is the project; change to a person if you prefer."
---

The promise of this site is simple: every paragraph of a public inquiry, readable on the web and citable by its own link. Keeping that promise is mostly unglamorous data wrangling. This is a longer note than usual, about the problems we keep hitting, why fixing them one at a time stopped working, what we built instead, and what it has achieved so far.

## The problem: these reports were typeset for paper

Nearly every report here reaches us as an official PDF. A PDF records where each line of text sits on a printed page. It doesn't record which lines form a paragraph, which text is a heading, which number is a footnote marker, or which words are a running title repeated at the top of every page. Our pipeline has to work all of that out again, for documents of up to a million words, and every report was typeset differently.

The mistakes are easy to make and hard to see. Some real examples from the archive:

- **Sentences cut in half.** In the Litvinenko Inquiry, paragraph 3.120 described Mr Litvinenko "suffering from abdominal pain, profuse diarrhoea and" — and then the rest of the sentence, "vomiting for two days when he was taken to hospital", arrived as a separate indented quotation. That one report had 244 such breaks, about one prose block in nine.
- **Page furniture inside sentences.** The same report's running heads ("The Litvinenko Inquiry", "Part 3 | Chapters 1 to 5") were read as text: 132 times as paragraphs of their own, and sometimes spliced into the middle of a sentence where a page break fell.
- **One stray mark, 148 wrong notes.** The 9/11 Commission Report's first chapter opens with a decorative date that the PDF spells "Tue sday, Se ptembe r 11, 20 01". A fragment of it was read as footnote 20. Because notes restart in every chapter, every later "20" in the book then opened the previous chapter's note 20: 148 footnote markers showed the wrong note. "Haznawi in 6B." pointed to a note about a terrorism scholar instead of the airline record.
- **Paragraphs you couldn't cite.** The Iraq Inquiry's Executive Summary numbers its paragraphs "13.", "20." at the margin. Our formatter read each one as a numbered list item, and list items had no paragraph link, so only 64 of its 956 citable units could actually be cited, including none of its conclusions. The Lehman examiner's report still has the same problem in places: the sentence giving Lehman's reported leverage figures breaks across a page and its second half becomes an unlinked list item.
- **A million words with almost no structure.** The Leveson Inquiry is 983,000 words. It had 74 headings, because its Part and Chapter titles are set in small capitals that the PDF reports as "parT a" and "ChapTer 1". It now has 87; recovering the rest needs a piece of work of its own.
- **Footnotes that never became footnotes.** When we first counted, more than 9,000 footnote markers across the archive had never been linked to their notes, 6,394 of them in Leveson.

## Why fixing them one by one wasn't working

For months each defect became its own bug, found when someone happened to read the page, then fixed, then closed. When we catalogued about fifty of them, not one had been caught by an automated check. Readers had found six. The rest were found by someone reading pages closely. Our checks were measuring the wrong things: they confirmed that the words had arrived, not that they were in the right place, and their baselines simply recorded whatever had last been published, mistakes included.

So we changed the approach: measure the whole archive on every change, and find ground truth to measure against.

## What we built

**A catalogue of defects, with counts.** We wrote down every class of mistake we had seen, with examples and a way to detect each one automatically, and counted them across all thirteen reports.

**Quality checks with budgets that only go down.** Every report now has a count for each defect class — sentences cut off into quotations, page furniture left as paragraphs, unlinked markers, contents entries with no matching heading, and so on — and a budget. A change that makes any count worse fails before it reaches the site. When a fix lowers a count, the budget is lowered with it, so the gains can't quietly slip back.

**Clean reference texts to score against.** The checks can only look for shapes we already know. To find the rest, we went looking for independent clean editions of the same reports. Some exist: the 9/11 Commission's own HTML edition, the Saville Inquiry's website, the court reporter's text of the Philip Morris judgment, and the structure tags inside some publishers' PDFs (Hillsborough's match our text 97%). We built a scorer that aligns our text with the reference and measures where paragraphs begin and end, which text is a heading, and whether each footnote marker opens the right note. Its first run on 9/11 found 195 wrong paragraph breaks; our existing checks had found 4. It also showed that our checks caught only about half of the wrongly split paragraphs.

**Checking the checkers.** Reference texts have mistakes too. On a sample of page breaks, about one label in ten turned out to be wrong, mostly where a publisher's PDF tags were sloppy. So for each reference we now check 30 page breaks by hand against the printed page and record the result. After cleaning up the references, Hillsborough's error rate on those breaks went from 7% to zero and Chilcot's from 18% to 4.5%.

**Learning from the cases we get wrong.** Aligning our text with the clean editions gave us tens of thousands of labelled decisions, every point where the pipeline chose whether to start a new paragraph. The weakest decision by far was the page break: does the paragraph at the foot of a page continue on the next one? Within a page we were right 97–99.6% of the time; across a page break, as little as 74%. We tried a trained model, but it mostly rediscovered rules a person could write down, and did slightly worse than them: if the last line on the page is unfinished and the next page's first line isn't indented, the paragraph runs on, whatever letter it starts with; never join into a line that opens with a paragraph number; a change of typeface means a new block. A language model asked to settle only the genuinely ambiguous breaks did better still on those cases, at a fraction of a cent each, and may be added later as a cached, optional step.

**Reading the page's layout.** Those rules need to know where each line sits and which typeface it uses, so the pipeline now reads each PDF's line positions and fonts directly, as well as its text. The same data drives a "layout oracle" that compares our headings, footnote markers and paragraph breaks with what the printed page shows.

**Golden pages.** Finally, 77 hard pages across the thirteen reports — chosen because they have caught us out — have been checked against the printed page and written down as the correct answer. If a change breaks one, the build fails. Pages we still get wrong are recorded as known failures, tied to their bug, so the problem stays visible until it is fixed.

## What changed for readers

Over four releases of the conversion pipeline (v0.15.0 to v0.18.0), every report on the site has changed:

- Paragraphs that ran over a page break are whole again. On the three reports we developed against, the share of page breaks handled correctly rose from 87% to 96%; on four held-out reports, from 87% to 89%. In the Philip Morris judgment, none of the 30 page breaks we checked by hand is now wrong; ten were before. Across the archive, 366 paragraphs severed at a page break and 316 quotations or list items cut in two are rejoined.
- Litvinenko's running heads are gone (227 left as paragraphs, now 12), and its lettered sub-items no longer break into quotations.
- The Iraq Inquiry has all its listed headings (68 became 90) and its reading guide now covers the Lessons.
- In the 9/11 Commission Report, footnote markers that open their correct note rose from 90.5% to 97.8%, and the same fix corrected wrongly paired notes in Leveson, Deepwater Horizon, Litvinenko, Columbia and Lehman.
- The Lehman examiner's report gained Volume 3, the Repo 105 analysis, with 941 of its 1,094 footnotes linked.

One cost: when two halves of a paragraph are joined, one of their links disappears. We updated every link we publish ourselves, but a link to a paragraph that was really half a paragraph may now land at the top of its section. We are adding a redirect table so old links keep working.

## What's next, and what we haven't solved

- **Six reports have no clean edition to score against:** Leveson, Deepwater Horizon, Challenger, Lehman, the Senate's financial crisis report and the Jack Smith report. They carry most of the remaining defects; Leveson alone had over 8,000 flagged by our checks at the start of this work. They depend on the pipeline getting better, and the rules learned from the reports that do have clean editions are designed to carry over.
- **Using the clean text directly.** Where a clean edition exists, we are piloting taking the text and structure from it, and using the official PDF only to place the printed page numbers and to check fidelity. 9/11 is first; Saville, Hillsborough and the Duelfer Report (which has stalled on its difficult PDF) are next.
- **Better sources in general.** We are researching where better source texts can come from: publishers' original files, government XML, court records, accessible editions, and modern text extraction for the scanned reports. That will get its own write-up.

Much of this work was carried out by AI coding agents working under human direction, with every change measured and reviewed before it was published.

The details are in the design notes in the [site's repository](https://github.com/reportsthatmatter/reportsthatmatter): the [defect catalogue](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/docs/design/2026-10-02-quality-harness-catalogue.md), the [plan](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/docs/design/2026-10-02-quality-harness-plan.md), the [reference editions](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/docs/design/reference-editions.md), the [scorer](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/docs/design/2026-10-02-alignment-scorer.md) and [what we learned from the aligned texts](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/docs/design/2026-10-02-learning-from-aligned-pairs.md). If you find a mistake in a report, please [tell us](https://github.com/reportsthatmatter/reportsthatmatter/issues/new/choose): every one we hear about becomes a check, so it can't happen again.
