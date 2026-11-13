---
theme: ingest
---
- **A defect one report's layout causes can be fixed by a pass written in that report's repo (a `VolumePass` or `BodyPass` object in `ingest.ts`), with no ingest release; move it into ingest when a second report needs it** (2026-11-12, reportsthatmatter-j8kw and quam, rtm-quality-hillsborough) Hillsborough's part and chapter openers print the folio at the end of a footer unique to the page, and its three-part paragraph numbers ("2.4.54") are not read by `numberedParagraphs` (two-part only). Two small report-local passes fixed 12 unmarked pages (79 blocks cited with the wrong page) and 55 welded paragraphs, moving the grade C 3.61 to B 1.13, and shipped without a pin bump. [status: done in uk-hillsborough-panel PR]
