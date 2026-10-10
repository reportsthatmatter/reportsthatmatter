---
theme: A new report from a redacted scan (Senate Intelligence Committee study, gqsy.6)
---
- **Where a scan's text layer cannot see something (a redaction box, a lost note number), read it off the page image once, commit the result as a checksummed pack, and apply it as the report's own source pass.** (2026-10-10, gqsy.6, Opus) 11,680 boxes found by opening the greyscale page with a 5px square and stacking dark runs into rectangles (connected components failed where boxes touch); words placed with `pdftotext -bbox-layout` paired to `-layout` tokens. Every edit carries the line it expects, so poppler drift fails loudly. The same pack then carried banners, portion markings, note numbers and folios. [status: done in report repo PR; SourcePass in ingest lines-passes-1009]
