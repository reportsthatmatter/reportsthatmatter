---
theme: ingest passes
---
- **Before declaring a heading face with `typographicHeadings({ faces })`, list every line the face sets across the whole PDF, not just the golden page's: a face that sets headings can also set captions, contents entries or table labels** (2026-10-25, reportsthatmatter-men, litvinenko-quality) Litvinenko's 22pt blue sets 21 sub-topics and 13 figure captions; only listing the face's 34 lines showed the captions, each with a note marker, which `skipMarked` now drops. A face's line list (a script over `openLayout`) would be a useful `pnpm ingest page`-style command. [status: done in the litvinenko-quality-1024 PRs]
