---
title: "What goes wrong turning official inquiry PDFs into citable text"
date: "2026-11-10"
author: "Rufus Pollock"
summary: "An official PDF keeps the words and loses the paragraphs, headings and footnotes. How we grade every report on the errors a reader meets, and why ten of the 20 are below our own bar."
status: draft
review:
  - "DECISION: the post publishes the per-report grades (A to D, errors per 10 pages), which decision 0030 keeps in the repo and off the site. Recommendation: publish them here. They are the access argument with numbers, and saying 'half are below our bar' ourselves is the honest version of what an HN commenter would find in reports/grades.md within the hour. If yes, consider a follow-up decision on showing them on each edition page."
  - "DECISION for HN: this text was drafted by an agent (w7-content, 25 Oct). HN bans generated text in posts and comments, and its readers apply the same standard to linked essays. The launch plan (marketing strategy/2026-10-27-launch-week.md, L1) says you rewrite it yourself before the 10 Nov submission. Recommendation: rewrite it in your own words, using this as the fact sheet; the HN plan is in the marketing repo, drafts/2026-11-10/hn-essay.md."
  - "Numbers are from 25 October 2026 (ingest v0.31.0, site 305d511b): reports/grades.md, the golden.yaml files in the report repos (128 pages, 41 xfail), site PRs #309 (Leveson) and #389 (Mueller), and factory/reviews/review-mueller-notes-2026-10-25.md. The September and early-October examples are from docs/design/2026-10-02-quality-harness-catalogue.md. Re-run `pnpm grade` and recount the golden pages the day before publishing; any release between now and 10 Nov moves them."
  - "The AI paragraph is the brand-voice wording (decision 0009) in first person: 'under my direction', 'checked by me'."
  - "The report count (20) is today's registry. If a report is added before 10 Nov, update it or remove the number (marketing's check-drafts.py --site-docs flags a mismatch)."
---

The Leveson Inquiry's report runs to 983,000 words. Its PDF gives the chapter titles as "ChapTer 1" and "parT a", because they are set in small capitals and the PDF records the small capitals as lower-case letters in a smaller font. The first time we converted it, the result had 74 headings. It has 88 now. By the measure I describe below, it is still the worst text on this site.

Ten of the 20 reports on this site fail the bar we set for them. This is how we know, and what is still wrong.

## A PDF records words, not paragraphs

All 20 reports here were published as PDFs. For a born-digital PDF the words are usually fine. What a PDF does not record is which lines make a paragraph, which text is a heading, which small number is a footnote marker, and which words are a running head printed at the top of every page. All of that has to be worked out again, for each report, and every report was typeset differently.

Some of what went wrong, from September and early October:

- **Sentences cut in half.** The Litvinenko Inquiry, paragraph 3.120, described Mr Litvinenko "suffering from abdominal pain, profuse diarrhoea and", and the rest of the sentence arrived as a separate quotation. That report had 244 sentences broken this way.
- **One stray mark, 148 wrong notes.** The 9/11 Commission Report's first chapter opens with a decorative date that the PDF spells "Tue sday, Se ptembe r 11, 20 01". A fragment of it was read as footnote 20. Notes restart in every chapter, so every later "20" in the book opened the wrong note: 148 markers in all.
- **Paragraphs you couldn't cite.** The Iraq Inquiry's executive summary numbers its paragraphs in the margin. We read each number as a list item, and list items had no link, so 64 of its 956 citable units could be cited, and none of its conclusions.
- **Notes that never became notes.** When we first counted, 9,032 footnote markers across the archive were not linked to their notes. 6,394 of them were in Leveson.

## Why fixing them one at a time stopped working

Each of these was a bug, fixed and closed. When we listed about fifty of them in early October, none had been caught by an automated check. Six had been found by readers, or by me, on the live site; the rest by agents reading pages closely while doing something else.

The checks we had were measuring the wrong thing. They confirmed that the words had arrived, not that they were in the right order or the right place. A paragraph cut in half, with its second half relabelled as a quotation, scored exactly the same as a correct one. That is how 865 of Litvinenko's 1,089 paragraphs went out severed until 1 September and passed every gate.

## What we measure now

- **Counts with budgets that only go down.** Each report has a count for each kind of defect we know how to detect: sentences cut into quotations, running heads left in the body, unlinked markers, contents entries with no matching heading. A change that raises any count fails before it reaches the site. A fix that lowers one lowers the budget with it.
- **Independent editions to score against.** Some reports exist in a second, cleaner form: the 9/11 Commission's HTML edition, the Saville Inquiry's website, the court's text of the Philip Morris judgment. We align our text with those and score paragraph breaks, headings and note links. The scorer's first run on 9/11 found 195 paragraphs that started in the wrong place. Our checks had found 4.
- **Checking the references.** The clean editions have mistakes too. On 185 page breaks checked against the PDF, the reference was wrong in 19, about one in ten. So each reference now gets a sample checked by hand before we trust it.
- **Golden pages.** 128 pages across the 20 reports have been read off the page image and written down as the right answer for the paragraphs, headings and notes they were chosen to test. A change that breaks one fails the build. They were chosen because they are hard, and on 41 we still get something wrong. Those are recorded as known failures, each tied to an open bug, so they stay visible.

## One grade per report

Counts are hard to compare between a 145-page executive summary and a 1,952-page inquiry, so since 16 October each report has one number: the errors a reader meets per 10 pages, over six things a reader relies on. Paragraphs that start and end in the right place. Headings. Footnote markers that open the right note. Page numbers that land on the right page. Links that still find their paragraph. And the words themselves, which we can only measure where a clean edition exists.

A is at most 1 error per 10 pages, B at most 3, C at most 10, D at most 30. Our own bar is B, with no dimension below C.

On 25 October, three reports were A: the Post Office Horizon Inquiry (Volume 1), the 9/11 Commission and Chilcot's executive summary. Seven were B. Six were C, and four were D: Challenger, the Senate's CIA report, Litvinenko and Leveson, which comes in at 18 errors per 10 pages, 11 from paragraphs alone. Ten of the twenty meet the bar.

The other ten are on the site anyway. A copy you can search and link into, with its defects counted, is more use than a PDF you can't. The counts are in the repository; each report's edition page describes how its text was made and where it falls short. Where our text and the official PDF differ, the PDF is right.

Two caveats. The grade counts only the errors a check can see, so it is a floor, not an estimate of everything. And the words themselves are scored for only two of the 20 reports, the 9/11 Commission and Chilcot's executive summary, where proofread pages exist to score against. For the other 18, word accuracy is sampled, not measured.

## When the checker was wrong

The Mueller report graded D in October: 12.3 errors per 10 pages, nearly all from 468 footnote markers that our layout checker said were not linked. Before changing the pipeline, an agent sampled the findings on the page images. About 300 were the checker's own mistakes. On the scanned pages, OCR had read one raised marker digit by digit, so "1262" counted as four markers, and dates inside the notes ("3/11/16") were read as markers too. The same look found 112 real markers that the pipeline had missed for the same two reasons. Both are now fixed, every report's text but Mueller's came out byte-identical, and Mueller is a C, at 5.1.

161 of its 1,283 notes, on the scanned and redacted pages of Volume I, are still not linked. That is the next piece of work on it.

## When the checker was blind

Leveson numbers its paragraphs within each chapter: 4.30 in one chapter, 4.30 again in the next. Our check for a paragraph number glued onto the end of the previous paragraph looked for the number anywhere in the report. Any other chapter's 4.30 hid the glued one, so it found 3 of 14. It now compares with the next paragraph's own number, found all 14, and the fix took them to 0. In the same change, bare footnote markers in Leveson went from 39 to 6.

Leveson is still a D. Its Part and Chapter headings need a structure the pipeline does not yet build, and on 2 October we counted 146 numbered paragraphs, on 56 pages printed closer to the binding, that came out with their first line as prose and the rest as a quotation. Both are open, with their counts.

## Fixes move links, so links redirect

Every paragraph's id comes from its opening words, not its position, so most fixes move nothing. When a fix does move one, typically because two halves of a paragraph split at a page break are joined, the old id is recorded and redirects to the new one. The Mueller fix moved two: one now redirects, and one, a paragraph that was only the words "Mr. President!", no longer exists on its own, so a link to it opens the report without finding a paragraph.

## What I haven't solved

- **Leveson, Litvinenko, Challenger and the Senate's CIA report** are the four D grades. Challenger is a 1986 scan; the CIA report is heavily redacted; Leveson is 1,952 pages; it and Litvinenko are carefully typeset books whose margins and gutters the pipeline misreads.
- **The words, for most reports.** The grade is built on structure. Measuring the words where there is no clean edition needs either a person reading sampled pages or a vision model checking them, and both are still experiments.
- **Recall.** A check that finds 3 of 14 looks fine until you find the other 11. The golden pages are how we find out, and 128 pages out of 10,170 is not enough.

No language model wrote, summarised or rewrote the report text. AI coding agents built much of the software and the site, under my direction, and the code is public. The introductions are ours: drafted with AI help, checked by me, and labelled.

The grades are in [reports/grades.md](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/reports/grades.md) and the method in [docs/scoring.md](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/docs/scoring.md); the defect catalogue is [here](https://github.com/reportsthatmatter/reportsthatmatter/blob/main/docs/design/2026-10-02-quality-harness-catalogue.md). If you find a mistake in a report, [tell us](https://github.com/reportsthatmatter/reportsthatmatter/issues/new/choose). Each one we hear about gets a check that fails on it.
