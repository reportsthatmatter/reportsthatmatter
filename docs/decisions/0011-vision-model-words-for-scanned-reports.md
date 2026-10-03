# 0011. Should a scanned report's served words come from the vision model where it reads better than the text layer?

- **Status:** open
- **Date raised:** 2026-10-03
- **Decided by:** Rufus (pending)
- **Beads:** reportsthatmatter-kyj3 (the measurement), the decision bead linked from it

## Question

granite-docling reads Jack Smith with 0.6% word error against 3.3% for the text layer, and Challenger's text pages with 0.8% against 5.5% (the exhibit scans: right on 63% of words against 14%). The vision pass in kyj3 uses the model for structure only and never serves its words. Should the pipeline serve the model's words on pages where the layer is poor, for example Challenger's 77 flagged text pages and exhibit scans?

## Considerations

- For: lower measured word error on the checked pages; the only reading available for exhibit scans whose layer is garbage.
- Against: the model's errors are fluent and plausible ("evoke" for "revoke", a dropped digit in a case number, "B-8" for "B-3"), where the layer's are visibly broken; it loops on dense pages; a served word can no longer be traced to the PDF's own text.
- A middle path: serve the layer's words, and use the model's reading to flag, not replace, the words where the two disagree (the verifier already lists them).

Measurements: `docs/design/2026-10-03-vision-structure-pass.md`.
