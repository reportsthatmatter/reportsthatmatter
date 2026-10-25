---
theme: measurement
---
- **Before fixing a report against a high oracle count, sample the findings on the page image and count the check's own false positives first** (2026-10-25, reportsthatmatter-vs2x, mueller-quality) Mueller's 468 `markers-unlinked` (its D grade) held about 290 false positives on its OCR pages: one marker raised digit by digit counted four times, and the body-faced notes' raised dates counted as markers; the same look showed 83 real markers the linker missed for the same two OCR quirks. Fixed in the oracle (`joinTouchingDigits`, a body-faced notes cut) and in `layoutMarkers({ scanned: true })`; grade D 12.28 to C 5.28. [status: done in ingest#85, us-mueller-report#3]
