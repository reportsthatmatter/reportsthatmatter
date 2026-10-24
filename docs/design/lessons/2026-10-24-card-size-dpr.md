---
theme: sharing
---
- **Measure a share card's bytes, not just its look, whenever an image grows on it** (2026-10-24, decision 0034, share-cards) Moving the grainy plate from a stamp to half the card took 2x PNGs from ~170 KB to 300-580 KB even at 64 colours, past WhatsApp's ~300 KB; grain does not compress. Cards now render at 1x (1200x630) and `tests/card-design.test.ts` fails any card over 300 KB or not 1200x630. [status: done in share-cards-1024 PR]
