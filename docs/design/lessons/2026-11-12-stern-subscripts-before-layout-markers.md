---
theme: ingest
---
- **With 100+ notes over many chapters, a report that raises its chemical subscripts can still use `layoutMarkers`: take the subscripts out of the layout's raised runs first** (2026-11-12, reportsthatmatter-gqsy.9.2 and oyr5, stern-full-1112 agent) Setting markers by hand (the 2026-11-08 lesson) does not scale to Stern's 151 chapter notes; a report-local body pass removes a raised 1-6 after "CO", "CH", "N", "SF" or "H" from the layout before `layoutMarkers` reads it, and 150 of 151 chapter markers link (the rest sit in tables not served). [status: done in uk-stern-review#2; shared fix proposed in oyr5]
