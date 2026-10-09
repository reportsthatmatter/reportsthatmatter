---
name: report-publish
description: Use when shipping a report's text, editorial or processing notes to production on Reports that Matter — publish-report to R2, deploy, search reindex, highlights seeding and production verify. Stage 6 of the preparation pipeline; integrator only, never a stage agent.
---

# Stage 6: publish

**Level:** `level:specced` (Sonnet), integrator only. Rules for every agent: [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) (R1-R16).

**Integrator only.** Stage agents never merge, release, publish, deploy or seed (agent protocol R4). Design: `docs/design/2026-10-03-report-preparation-pipeline.md` §2-4.

**The normal path is `pnpm ship`**, run as in the `integrate-and-ship` skill (it publishes with `--no-reindex`, deploys, reindexes only what changed, seeds, verifies production and records). The manual steps below are the fallback and what each ship step means; the full list is `docs/release-checklist.md` 10-16, and AGENTS.md "Publishing a report" explains the mechanism. What ships how: `docs/ARCHITECTURE.md`'s "what needs a deploy?" table. Text goes by `publish-report`; editorial, `PROCESSING.md` and plates go by deploy.

**Entry.** Stage 4's PRs merged (and stage 5's, unless the fast path). Ingest released and pinned if a pass changed. Wrangler on this project's account: `pnpm wrangler d1 list` shows `reportsthatmatter-marks` (AGENTS.md "Cloudflare").

## Procedure

No secret, no writes (anyone may run these): (a unit already live shows `current` and "unchanged" here: the rest is confirmation)

1. `pnpm prerender` (writes only `assets/generated/`), then `pnpm publish-report --all --status --base https://reportsthatmatter.org`: the reports whose local hash differs from the served one.
2. `pnpm publish-report <id> --dry-run --base https://reportsthatmatter.org` for each: objects, served version, estimated D1 row writes and reads. `pnpm d1-usage`: today's use against 100,000 writes and 5,000,000 reads.

Integrator only (production):

3. `pnpm ship --plan`, then `pnpm ship --shared --yes` (`integrate-and-ship` skill, steps 4-8). Or by hand:
   - `pnpm publish-report <largest> --preflight` (writes and deletes one sentinel row in production D1); stop if the quota is spent.
   - A never-published report: deploy first (`./scripts/deploy-cloudflare.sh`; `docs/report-preparation.md` §7 step 3).
   - `RTM_PUBLISH_SECRET=$(cat ~/.rtm-publish-secret) pnpm publish-report <id> --base https://reportsthatmatter.org` for each (this path also reindexes search; `pnpm ship` instead publishes with `--no-reindex` and reindexes afterwards).
   - Deploy; `pnpm editorial`; `pnpm seed-highlights --remote`.
   - `VERIFY_SHARED=1 VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh`, then `pnpm marks check --all --refresh`.
   - `pnpm quality ratchet --record` and `pnpm scorecard --record`; commit `reports/quality-last.json`, `reports/verify-last.json`, `docs/scores.json`.
4. Close the stage beads: the unit bead's children (`bd show <unit bead>`); units opened before stage beads existed have only the unit (candidate or ingest) bead, closed once all its open work is beaded elsewhere. `bd close <id> --reason "Live: <hash>"`. A live unit's row is `reached: publish`, `state: waiting` until it is announced.

Do not run any of step 3 while another integrator is mid-release on the same checkouts (`pnpm ship --status`).

## Exit gate

- [ ] `curl -sD- -o /dev/null https://reportsthatmatter.org/reports/<id>/full | grep -i x-rtm-content-version` is a hash, not `assets`
- [ ] `pnpm publish-report --all --status --base https://reportsthatmatter.org` shows the report `current` (no secret needed; the per-report `<id> --status` needs `RTM_PUBLISH_SECRET`)
- [ ] Production `verify.sh` exits 0
- [ ] Stage beads closed; your PR sets the unit's `reports/pipeline.yaml` row to `reached: publish`, `state: waiting` (if it is already at a later stage, leave it)

Retro and lessons: agent protocol R13-R14.
