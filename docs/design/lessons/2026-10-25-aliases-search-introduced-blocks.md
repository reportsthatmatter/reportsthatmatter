---
theme: Aliases
---
- **When a re-ingest can turn a paragraph into an unnumbered block (quotation, list), the alias matcher must search that block's text and answer with the paragraph that introduces it.** (2026-10-25, reportsthatmatter-xmgr, aliases-xmgr) fkx made 1,000 Leveson ids unmatched because blockquote text has no id and was not in the searched stream. The locator now searches each paragraph's text plus its introduced block; Leveson unmatched 3,391 to 2,603. [status: done in the xmgr PR]
