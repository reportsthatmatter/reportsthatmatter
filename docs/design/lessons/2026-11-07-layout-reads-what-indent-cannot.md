---
theme: Structure after the parse
---
- **Before lowering a report-wide threshold, check whether the layout can name the lines directly; a few-line report body pass that reads the layout (italic, inset in ems) beats a global knob** (2026-11-07, reportsthatmatter-vsd2, thirlwall-fixes agent) Thirlwall's inset quotations sit 2-3 text columns in: `quoteInset(3)` quoted 3.114's roman lettered items and missed first lines that open on a hanging quotation mark, while a body pass pushing only body-size italic lines 0.8-3 em in from the margin caught all 15 tagged quotations and moved nothing else. A third report with italic inset quotations should move the pass into ingest. [status: done in uk-thirlwall-inquiry ingest.ts]
