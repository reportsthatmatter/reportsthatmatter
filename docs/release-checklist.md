# Release checklist (the integrator's steps)

The order in which an ingest release reaches readers, with the command that answers each question. Written for the integrator who releases ingest, bumps the pin, re-ingests, verifies and ships; the agent protocol for a session says who that is. Nothing here is automated end to end: each step prints something you read before the next.

Commands marked (new) arrived with the tooling batch of 2026-10-03 (`pnpm ingest preflight` #230, `pnpm publish-report --all --status` #233, `pnpm ingest try` #231, the incremental reindex and `--preflight` #237). Until each is merged the older equivalent applies.

## Before the release

1. In the ingest PR, show what it does to the corpus: `pnpm ingest try <branch|path> [<id>...]` (new) from a site worktree prints, per report, the join and move list, the quality deltas and the score flips, and restores every link afterwards. Paste it next to `pnpm quality report --diff origin/main`. After a fix to a score-visible decision, `pnpm score --all --out score-before`, change, `pnpm score --all --out score-after`, `pnpm score --diff score-before score-after` (new) lists the decisions that flipped.
2. Merge the ingest PR, then `pnpm release X.Y.Z` from ingest's `main`. Never tag a PR branch (a squash-merge makes the tag unreachable from `main`).

## Pin bump and re-ingest (site worktree)

3. Bump the `@rtm/ingest` pin, `pnpm bootstrap`, then **reinstall every report repo**: `pnpm ingest preflight` (new) lists each repo's pin against its installed version and prints `pnpm -C <repo> install` for any that differ. `run`, `verify`, `check` and `baseline` run it first, so a stale repo stops them with that message instead of a missing-export crash.
4. `pnpm ingest check`: read each report's diff; `pnpm ingest baseline <id>` only for diffs you read and meant.
5. `pnpm ingest aggregate`, then `pnpm aliases generate --all` (a branch based on what is published), then `pnpm prerender`.
6. `pnpm corpus check`: a vanished or new section now says why (folded into its neighbour by the sliver rule, renamed, or genuinely gone) (new). `pnpm corpus accept <id>` after reading.
7. `pnpm quality report --diff origin/main` into the PR body; every regression needs a bead; `pnpm quality ratchet` for improvements. `verify.sh` reminds you while `quality-last.json` is from another ingest version (new).
8. `./scripts/verify.sh` exits 0.

## Ship (after the pin-bump PR merges)

9. Which reports need publishing: `pnpm prerender`, then `pnpm publish-report --all --status --base https://reportsthatmatter.org` (new). It lists local against served hash per report and the ones to publish. No secret, no writes. Do not write a throwaway hashing script.
10. Can D1 take the writes: `pnpm publish-report <id> --preflight` (new) for the largest report on the list (Leveson, Philip Morris). It probes one row, reports whether the daily quota (100,000 row writes on the free tier) is spent and when it resets, and what this publish costs. `pnpm publish-report <id> --dry-run` (new) prints the objects, the served version and the estimated row writes for any report. If it does not fit, stop and wait for 00:00 UTC or decide about Workers Paid (reportsthatmatter-2oz).
11. Publish each report on the list: `RTM_PUBLISH_SECRET=$(cat ~/.rtm-publish-secret) pnpm publish-report <id> --base https://reportsthatmatter.org`. A real publish runs the preflight itself and stops before uploading when the quota is spent. The search reindex that follows writes only the paragraphs that changed (new): a typical release is a few thousand row writes for the corpus, not the 250,000 a full rewrite costs. A failed publish is repeated with the same command (uploads are idempotent).
12. Deploy (`./scripts/deploy-cloudflare.sh`; it prints the drift table at the end (new), which should now list nothing), then `pnpm editorial` and `pnpm seed-highlights --remote`.
13. Production verify: `VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh`.
14. Record: `pnpm quality ratchet --record`, commit `reports/quality-last.json`; close the beads.
