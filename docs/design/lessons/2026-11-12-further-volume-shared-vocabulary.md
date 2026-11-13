---
theme: ingest
---
- **Adding a volume can change a published volume's text through document-wide decisions: diff the old volume's slice of `full.md` before and after, word for word, and gate any new structure pass to the new volumes** (2026-11-12, reportsthatmatter-gqsy.4.2, grenfellvols agent) Adding Grenfell Volumes 2-7 flipped four "high-rise" in live Volume 1 to "highrise" (one "highrise" in Volume 3 entered the shared hyphen vocabulary) and `letteredItems` would have re-split Volume 1's 5.23 "(ii)", reusing an alias; fixed with `hyphenMajority` and `letteredItems({ fromVolume: 2 })`. A further-volume skill step "slice-diff the published volumes" would catch this before the aliases check does. [status: done in ingest#94; skill step proposed]
