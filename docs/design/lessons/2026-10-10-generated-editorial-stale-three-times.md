---
theme: Release and process
---
- **A generated file that a PR's source change implies must be checked like the cards are, not left for the reviewer's trial to notice.** (2026-10-10, v724, reviewer Opus) Three site PRs in a row (#304, #306, #312) changed `editorial/*.yaml` without regenerating `src/generated/editorial.ts`. #312's had no entry at all for its new report, so the landing page would have had no introduction. `pnpm cards --check` exists; `pnpm editorial --check` does not yet. [status: proposed, v724]
