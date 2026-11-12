---
theme: Measuring
---
- **Before declaring faces for a further volume, census each PDF's faces (`pdftohtml -xml` fontspecs by size, family and colour); volumes of one report can use different swatches** (2026-11-12, reportsthatmatter-gqsy.16.7, thirlwallvols) Thirlwall's Volumes II and III set 20 running heads in #00668d and 15 sub-headings in #133459 against the Summary's #00608b and #142f54, so the declared faces missed them and 10 running heads and "Endnotes" headings leaked as paragraphs until a per-PDF census found them. Proposal: `pnpm source probe` (ifb5.10) prints the face census per volume. [status: proposed]
