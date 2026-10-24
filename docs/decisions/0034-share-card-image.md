# 0034. What image travels on a share card, and does the daily Bluesky post carry it as a link card or an image post?

- **Status:** proposed
- **Date raised:** 2026-10-24 · **Date decided:** —
- **Decided by:** —
- **Beads:** reportsthatmatter-j10f (this decision), reportsthatmatter-2888 (per-paragraph cards at the edge)

## Question

Rufus (2026-10-24): "posts with images in them are really crucial." He likes a preview where a standard per-report image takes half and the quote the other half. Which image (the report's plate or its hero photograph), and should the scheduled Bluesky poster post the card as a link-card thumbnail (today) or as an image post with the link in the text?

## Context

- Before: the quote card was text-led (quote across the card, the plate as a small stamp top right), rendered at 2400x1260. The poster posts the quote as text plus an `app.bsky.embed.external` link card whose thumb is that card, so the quote appears twice. A `?p=` link to a paragraph without a `card: true` highlight previews with the report's title card.
- Every report has a plate (from its own evidence; an exhibit, never the event). 14 of 18 have a hero photograph of the event; 5 heroes are fair-use agency photos (Leveson, Philip Morris, Columbia, Litvinenko, Hillsborough), 4 are CC BY or BY-SA and need a credit a card has no room for.
- The marketing strategy (§8) forbids "images of the place" on anything we make for affected-community reports (10 of 18), and two reports already carry no plate on cards (ay85).
- How platforms show a link preview: X (summary_large_image) shows the image alone with a domain overlay, so the words must be in the image; iMessage and LinkedIn show the image large with the title; WhatsApp shows image, title and description and drops images much over 300 KB; Reddit link posts get a small square thumbnail; Bluesky shows a link card as a 1.91:1 image over title, description and domain, the whole card tappable, and an image post at its own aspect, larger, opening a lightbox rather than the link.
- Three directions were rendered on real queue items (plate split, hero split, full-bleed hero with overlaid text) and critiqued by a Fable reviewer: hero split puts identifiable faces and fair-use photos on cards that travel without credit, and splits the archive into two visual systems (affected-community reports would fall back); full-bleed text is illegible at feed size and fails a square crop. Plate split is the only one where all 18 reports are siblings.

## Options

1. **Image:** (a) plate on every card (shipped); (b) hero for non-affected-community reports with a freely licensed hero (Jack Smith, PSI, Chilcot, Lehman; plus a credit line), plate elsewhere; (c) hero everywhere the rules allow, fair-use included.
2. **Bluesky embed:** (a) link card with the split card as thumb (shipped; no poster change); (b) `app.bsky.embed.images` with alt text, the link as a facet in the text, the text cut to a context line because quote + source + link do not fit 300 graphemes; (c) per item, image post for short quotes.

## Decision

Proposed, shipped as the reversible default: 1(a) and 2(a). Plates are rights-clean and inside the §8 rule for every report, and the link card keeps the whole preview tappable to the paragraph, which is the product. Revisit 2 after two weeks of posts with the numbers (clicks per post from the `src=bsky` landings against reposts and likes); 2(b) is a poster change owned by the poster's agent.

## Consequences

- Cards are 1200x630 at 1x (the canonical og:image size): a plate's grain made 2x cards 300-580 KB even at 64 colours; at 1x they are 65-200 KB, under WhatsApp's limit and well under Bluesky's 1,000,000-byte thumb limit. `tests/card-design.test.ts` holds both.
- Default (title) cards share the frame, so every `?p=` link now previews with a plate and the words, not a text-only card. Per-paragraph cards for links without a highlight are reportsthatmatter-2888 (edge rendering, recommended via Browser Rendering cached in R2).

## Links

- `src/templates/card.ts`, `scripts/cards.mjs`, `docs/plates.md`
- Review page for Rufus (Claude artifact, share-cards-1024)
