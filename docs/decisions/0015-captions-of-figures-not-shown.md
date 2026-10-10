# 0015. How are captions of photographs we do not reproduce served?

- **Status:** open (interim choice in place)
- **Date raised:** 2026-10-09 · **Date decided:** —
- **Decided by:** —
- **Beads:** reportsthatmatter-12s2 (this decision), reportsthatmatter-2t3t (the defect), reportsthatmatter-699 (images epic)

## Question

The site shows no photographs (no image handling yet, and many are third-party credited: "Photo by Anna Moneymaker/Getty Images"). What should a reader see where the report printed one with a caption?

## Context

- The January 6th Committee's HTML edition has about 64 `figcaption`s, each a caption plus a credit line. They were served as plain citable paragraphs, read like the report's prose and sat a page early (bqu0). Captions that are a credit alone are already dropped by the adapter.
- 9/11 already serves its captions as an italic paragraph (`*Usama Bin Ladin at a news conference in Afghanistan in 1998*`), citable. PDF-built reports (Deepwater, Columbia) serve captions as plain paragraphs; `photoCredits` attaches a recurring credit to its caption.
- The renderer (`@rtm/ingest` `markdown.ts`) has no figure construct: every top-level paragraph gets an id. Paragraph ids come from the opening words with markup stripped, so italics do not move an id.
- The images epic (699) plans `figure`/`figcaption` markup once images are shown; then the caption has a natural home.

## Options

1. **Italic, citable caption** (the 9/11 convention). No id moves; reads as a caption; still searchable and citable; credit lines stay visible (the report's own text, no rights issue: we serve no image).
2. **Non-citable figure placeholder**: "Photograph not reproduced" plus the caption, outside the paragraph sequence. Needs a markdown construct and renderer, passages and quality-signal support in ingest and the site; removes about 64 ids per report like this (aliases needed, and an id a reader cited would redirect nowhere useful).
3. **Drop captions.** Simplest, but loses the report's words (the PDF prints them), raises "PDF text not in the edition" suspects, and removes the ids too.

## Decision

Interim, 2026-10-09 (anchors agent, reversible): option 1 for January 6th, which matches 9/11. Option 2 is the likely end state once 699 gives figures a construct; whether captions should then stay citable is Rufus's call.

## Consequences

- January 6th's captions read as captions; no paragraph id moves from this change.
- Choosing option 2 or 3 later removes those ids: generate aliases (they would point at the neighbouring paragraph or be listed `unmatched`).

## Links

- `us-jan6-committee/committee-html.ts` (`figcaption`)
- `reportsthatmatter/ingest` `src/markdown.ts` (paragraph ids)
