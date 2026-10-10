---
theme: Release and process
---
- **A file every PR appends to or edits a block of will conflict at every integration; give each entry its own file, or one item per line, before reaching for a merge driver.** (2026-10-10, r4q2/wwmg/js2r/v95z/d4es, Sonnet) lessons.md, the decisions README rows, `corpus-baseline.json` and `KNOWN_PAGE_PASSES` were hand-merged at the v0.25.0 and v0.26.0 integrations; `.gitattributes` `merge=union` would not have reached GitHub's merge button or an agent's clone. Now `docs/design/lessons/<date>-<slug>.md`, `reports/corpus-baseline/<id>.json`, a generated decisions index and one sorted pass name per line, each with a test. [status: done in the mergefriction-1010 site PR and ingest #78]
