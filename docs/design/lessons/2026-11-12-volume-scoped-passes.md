---
theme: Adding a volume to a live report (Covid Inquiry Module 2 Volume II, nshl)
---
- **When adding a volume to a live report, diff the old volume's part of full.md after every pass you try, and scope a pass to the new volume when it moves the old one.** (2026-11-12, reportsthatmatter-nshl, covidv2-1112) A report-wide face for the recommendation boxes re-levelled Volume I's contents, and quoteInset(4) changed 552 lines of Volume I; scoped (faceText, quoteInset({ volumes })) both left Volume I byte-identical, so no published id moved. Pattern matching on PDF text should allow for no-break spaces: 13 of the 19 "Recommendation N:" titles had one. [status: done in ingest#90]
