---
theme: Release and process
---
- **A report-repo PR that edits `PROCESSING.md` needs the site copy in the site PR too, and a re-ingest needs the full `verify.sh`, not only `pnpm ingest verify`.** (2026-10-16, reportsthatmatter-jc46, review batch 3, Opus) The jc46 site PR carried `full.md` but not `reports/<id>/PROCESSING.md`, so verify's aggregate left the tree dirty; and only `VERIFY_SHARED=1 ./scripts/verify.sh` ran the page-anchor budget, which a joined quotation also printed in a note (p.47 and note 2647, p.485) pushed from 146 to 147 blocks-wrong. Both were caught by the reviewer's trial, not the author's gate. [status: fixed on the PR branch]
