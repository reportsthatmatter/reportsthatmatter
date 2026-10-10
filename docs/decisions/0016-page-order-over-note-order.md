# 0016. A float across a page turn: does page order or note order decide where it is served?

- **Status:** proposed
- **Date raised:** 2026-10-09 · **Date decided:** —
- **Decided by:** —
- **Beads:** reportsthatmatter-hcam (this decision), reportsthatmatter-smof, reportsthatmatter-gq4j, reportsthatmatter-bqu0

## Question

A box or caption that interrupts a paragraph is served whole, before or after the rejoined paragraph. When the paragraph's head is printed on page N and the box on page N+1, the served text cannot keep both the page anchors and the print's note order. Which wins?

## Context

- 9/11 has four such boxes (printed pp. 145-146, 177-178, 227-229, 260-262). `floats: "by-notes"` (gq4j, v0.23.0) served the box first so its notes (e.g. 2) read before the paragraph's (3). The box's `%%page N+1%%` then preceded the paragraph's head, printed on N: four paragraphs cited a page late (smof, `pnpm ingest anchors` blocks-wrong 0 to 4).
- The page marker format sits between blocks, so a paragraph cannot carry a page turn inside it (decision 0002, i8en).
- The same rule fixes January 6th's captions (bqu0): a float is served under the marker of the page the PDF prints it on.

## Options

1. **Page order wins.** A float never precedes a block that starts on an earlier page; `by-notes` puts floats first only when no page turns among them. Page anchors right (9/11 blocks-wrong 0); the four boxes' notes read after the paragraph's (note-reference-sequence 4).
2. **Note order wins** (v0.23.0 behaviour). Notes in print order; four paragraphs cited one page late.
3. **Split the paragraph** at the box. Both orders hold, but a citable paragraph is cut mid-sentence (severed-paragraph), which every other check treats as a defect.

## Decision

Proposed, 2026-10-09 (anchors agent): option 1. A page is what a reader cites, and citing p.146 for a sentence printed on p.145 is a citation error; a sidenote numbered 3 shown before 2 in the margin is a reading oddity. Reversible: `floats: "by-notes"` still applies wherever the box shares the head's page, and option 2 is a one-condition revert in `assembleEdition`.

## Consequences

- 9/11: anchors blocks-wrong 4 to 0; quality `note-reference-sequence` 0 to 4 (budget raised with `# why: reportsthatmatter-hcam`).
- January 6th: captions follow the marker of the page they are printed on (markers-wrong 39 to 10, blocks-wrong 30 to 3).

## Links

- `@rtm/ingest` `src/edition.ts` (`assembleEdition`: `deferred`, `floatsFirst`)
- `docs/quality-harness.md`, "Page anchors"
