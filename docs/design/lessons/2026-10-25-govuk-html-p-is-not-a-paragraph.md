---
theme: clean editions
---
- **A GOV.UK accessible HTML edition's `<p>` is not always the report's paragraph: check its breaks against the PDF before trusting them** (2026-10-25, reportsthatmatter-gqsy.15.3, southport) The Southport Phase 1 HTML starts a new `<p>` at 107 forced line breaks inside one PDF paragraph, ten of them mid-sentence; the edition's words align 99% and every fidelity gate passed, so only `severed-paragraph` (4) and reading the page showed it. Rejoined from the PDF's tags in govuk-html.ts (joinByTags). [status: done in the Southport site PR]
