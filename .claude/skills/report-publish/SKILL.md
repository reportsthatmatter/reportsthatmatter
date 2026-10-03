---
name: report-publish
description: Use when shipping a report's text, editorial or processing notes to production on Reports that Matter — publish-report to R2, deploy, search reindex, highlights seeding and production verify. Stage 6 of the preparation pipeline; integrator only, never a stage agent.
---

# Stage 6: publish

**Integrator only.** Stage agents never merge, release, publish, deploy or seed (session protocol, rule 4). Design: `docs/design/2026-10-03-report-preparation-pipeline.md` §2-4.

The steps are **`docs/release-checklist.md`** 9-14 (PR #239; until merged, read it from that branch) and AGENTS.md "Publishing a report". What ships how: `docs/ARCHITECTURE.md`'s "what needs a deploy?" table. Text goes by `publish-report`; editorial, PROCESSING.md and plates go by deploy.

**Entry.** Stage 4's PRs merged (and stage 5's, unless the fast path). Ingest released and pinned if a pass changed.

## Procedure

1. `pnpm prerender`, then `pnpm publish-report --all --status --base https://reportsthatmatter.org` for the list to publish.
2. `pnpm publish-report <largest> --preflight` for D1 headroom; stop if the quota is spent.
3. **A never-published report: deploy first** (`./scripts/deploy-cloudflare.sh`; `docs/report-preparation.md` §7.3). Wrangler must use the default profile.
4. `RTM_PUBLISH_SECRET=$(cat ~/.rtm-publish-secret) pnpm publish-report <id> --base https://reportsthatmatter.org` for each (reindexes search).
5. Deploy; `pnpm editorial`; `pnpm seed-highlights --remote`.
6. `VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh`.
7. `pnpm quality ratchet --record`, commit `reports/quality-last.json`; close the stage Beads.

`pnpm ship` (0c6i) will chain 1-6 when it exists.

## Exit gate

- [ ] `curl -sD- -o /dev/null https://reportsthatmatter.org/reports/<id>/full | grep -i x-rtm-content-version` is a hash, not `assets`
- [ ] `pnpm publish-report <id> --status` shows no drift
- [ ] Production `verify.sh` exits 0
- [ ] Stage Beads closed; `reports/pipeline.yaml` row says `reached: publish`

Retro and lessons: protocol rules 12-13.
