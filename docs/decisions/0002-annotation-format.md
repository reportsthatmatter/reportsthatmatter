# 0002. How do we encode what we add to the text: inline markdown or a sidecar file?

- **Status:** proposed (recommendation below; Rufus decides)
- **Date raised:** 2026-10-03
- **Decided by:** —
- **Beads:** reportsthatmatter-i8en (design); related: c0h (remark/unified migration), q8c (aliases), b78.10

## Question

Rufus, 2026-10-03: we may need a sidecar format, or inline annotations in markdown, for the things we add: page numbers, paragraph numbers and the like.

## Context

What we add today, and where it lives:
- printed page anchors: inline `%%page N%%` comments in `full.md`
- paragraph ids: derived from text by the renderer, not stored
- aliases for moved ids: `reports/<id>/aliases.yaml`, `published-ids.txt`
- corrections: `corrections.yaml` in the report repo
- fidelity flags for clean-edition reports: `fidelity.md`
- provenance (pinned source SHA-256s): the report repo manifest; per-block provenance (clean edition vs. PDF) isn't recorded
- editorial highlights and excerpts: `editorial/<id>.yaml`, keyed by paragraph id

## Options

Worked out in [docs/design/2026-10-03-annotation-format.md](../design/2026-10-03-annotation-format.md) (inventory, prior art, the same paragraph encoded each way, tradeoffs, migration sketch):

- A. Status quo: block-level `%%page N%%` lines, sidecars with four different anchor styles.
- B. Everything inline: attribute syntax on every paragraph (`{#id pages=115-116 src=html}`), CriticMarkup for corrections.
- C. Everything standoff: no markers in `full.md`; pages, ids, provenance and human layers in one W3C-style annotation file.
- D. One inline milestone, a generated block ledger, human layers standoff with one anchor model.
- E. As D, with `<!-- page N -->` instead of `%%page N%%`.

## Recommendation (i8en, 2026-10-03)

Option D. Two facts drive it: `full.md` is a build output that every ingest overwrites, so anything a human adds must be a sidecar; and our sidecars already anchor by quotation (golden pages, adjudicated breaks, editorial, corrections, reader marks), so the model to standardise exists.

1. `full.md` stays CommonMark + GFM footnotes with one extension, the page milestone `%%page N%%`, now also allowed inline at the word where the page begins. Today it can only sit between blocks: at least 170 of 9/11's 362 proofread pages begin mid-sentence, so those anchors, and the citations of every sentence after the break, are off by a page.
2. Printed paragraph numbers stay as the report's text; front matter declares a pattern (`locators.paragraph_numbers`) and the page-label scheme (`locators.pages`, b78.10); the renderer adds `para-3.120` anchors.
3. `@rtm/ingest` writes a generated `blocks.jsonl` beside `full.md`: per block, its id, pages, printed number, source edition and a hash. That makes ids and per-block provenance explicit for checks and for reuse.
4. Human layers keep their files but share one anchor model, `{paragraph, quote: {exact, prefix, suffix}}` (W3C FragmentSelector refined by TextQuoteSelector), resolved by id, then aliases, then a search for the quotation, then reported as an orphan.
5. Export the layers as W3C Web Annotation JSON-LD for reuse; don't author in it. No attribute syntax, CriticMarkup or MyST in `full.md`.

Open questions for Rufus: keep the `%%` spelling or switch to HTML comments; accept mid-paragraph milestones in the raw text; whether to freeze ids (8% of published ids now resolve nowhere); whether to publish the format as a spec. See §8 of the design doc.

## Decision

Not yet made: Rufus to decide on the recommendation above.

## Consequences

—

## Links

- bead i8en
- [docs/design/2026-10-03-annotation-format.md](../design/2026-10-03-annotation-format.md)
- [0001](0001-page-numbers.md) (which locators a report carries), [0008](0008-paragraph-ids-move.md) (aliases), [0010](0010-markdown-canonical-format.md) (markdown is canonical)
