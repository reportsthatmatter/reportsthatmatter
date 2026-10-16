---
theme: Checks
---
- **A rule that names a set of reports belongs in a registry flag that every check reads, not in a list in each script** (2026-10-16, zh1w, fix agent) the affected-community list lived hard-coded in feed-policy.ts while the posts queue guarded the same reports by hand, and ten Tier C cards escaped only by length and page number. `affected_community: true` in reports/registry.yaml is now the one source (copied to src/generated/affected.ts by `pnpm editorial` for the Worker), and `pnpm editorial` and `pnpm posts` both read it. [status: done in the zh1w PR]
