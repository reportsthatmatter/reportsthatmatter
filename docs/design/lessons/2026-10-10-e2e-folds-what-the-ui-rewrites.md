---
theme: Measuring
---
- **When a UI change rewrites displayed text (quote marks, ellipses), fold the same rewrite in every browser check that compares that text with the source, in the same PR.** (2026-10-10, #301/#317, reviewer Opus) #301 set a quotation inside the landing panel's quotes as ‘…’. `scripts/e2e-mobile.mjs` still compared the panel with the raw selected words, so "[Pixel 7] its panel quotes the reader's words" failed on main for any passage quoting someone. Nobody noticed until a later PR's verify, and it was then called "unrelated". The check now folds quote marks. [status: done in #317]
