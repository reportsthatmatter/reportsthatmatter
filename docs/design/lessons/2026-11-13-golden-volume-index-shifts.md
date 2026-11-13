---
theme: ingest
---
- **When a volume is inserted before others, renumber every golden entry and page-scoped correction that names a later volume by index; prefer finding a volume by its file** (2026-11-13, reportsthatmatter-qba4, Stern batch 2b) Inserting Chapters 11 and 12 before Chapter 13 moved it from volume 18 to 20, and its golden page then checked Chapter 11's p.12 and failed (15 blocks against 10), though the text was right. Renumbered by hand in `golden.yaml`. Proposal: golden entries and `where` take `file:` (qba4). [status: proposed]
