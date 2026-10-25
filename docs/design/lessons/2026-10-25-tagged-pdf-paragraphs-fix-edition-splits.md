---
theme: clean editions
---
- **Where a tagged PDF exists, its P/LI elements are the cheapest authority on paragraph boundaries for a clean edition** (2026-10-25, reportsthatmatter-gqsy.15.3, southport) The tag reference (reference/blocks.jsonl, already built for scoring) found the edition's 107 false splits by matching the 40 characters either side of each break; read at ingest time (pinned by SHA in ingest.ts) it cut paragraphs-oversplit 259 to 165 and severed-paragraph 4 to 0 with no hand list. Proposal: lift joinByTags into @rtm/ingest with the GOV.UK reader (reportsthatmatter-pbou). [status: proposed]
