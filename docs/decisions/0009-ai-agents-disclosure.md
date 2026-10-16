# 0009. Do we say on the site that AI agents did much of the work?

- **Status:** decided
- **Date raised:** 2026-10-03
- **Decided by:** Rufus Pollock, 2026-10-16 (accepted the recommended default)
- **Beads:** reportsthatmatter-0ino

## Context

The data-wrangling post draft (site PR #227; moving to the blog as a draft, jedz) includes one sentence saying much of the work was done by AI coding agents under human direction. The site has never said this.

## Options

Keep the sentence; expand it into a methods note (on the about page or in a post); leave it out.

## Decision

One plain note on /about ("How AI was used", `/about#ai`) saying what models did and did not touch: the report text is the official text, extracted by deterministic software and checked against the source, never written, summarised or rewritten by a language model, and no AI-written text is presented as a report; where a vision model's page reading is used (Challenger's `visionStructure` pass) it decides only paragraph and heading breaks, and only where it agrees word for word with the document's text layer; AI coding agents wrote much of the software and the site under Rufus Pollock's direction; the introductions are ours, drafted with AI assistance, with every quotation checked verbatim by `pnpm editorial`. The wider strategy D1 wording (per-report percentages, the label on the introduction box, /press) is after launch (hbnj). Shipped in the hbnj PR (branch `hbnj-source-line-contact`).
