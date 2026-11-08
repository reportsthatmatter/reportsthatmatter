---
theme: ingest
---
- **In a report that sets chemical subscripts as raised digits (CO2, CO2e), do not declare `layoutMarkers`; set its few note markers explicitly in a source pass** (2026-11-08, reportsthatmatter-gqsy.9 and oyr5, stern-review agent) On the Stern Review's p.5 the raised-digit linker took the "2" of "750ppm CO2e" for note 2 ("CO[^2]e") and left "IPCC 20012" bare; the oracle counted 25 subscripts as unlinked markers (golden tp0/fp16). uk-stern-review's ingest.ts sets its 4 raised markers by their printed words instead. [status: done in uk-stern-review#1; oracle fix proposed in oyr5]
