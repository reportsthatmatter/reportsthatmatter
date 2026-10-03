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
7. **What would stop anchoring** (new): `pnpm marks check --all --baseline <main build> --candidate assets/generated` replays every stored reader mark, every `?p=`/`?h=` link in `marketing/queue.yaml` and every editorial quotation and citation against the new text, and fails on any that no longer anchors where it did. The baseline is a `pnpm prerender` from a worktree of the current `origin/main`; leave `--baseline` off to list everything broken, not only what this change broke. Marks are read from production D1 read-only (one grouped read, cached under `build/marks-check/`, `--refresh` re-reads), links and editorial from this checkout, so run it on the branch that carries the editorial files you mean to ship. Run it for a hybrid source swap too, before the PR: typography (curly quotes, dashes) is folded, but a rewritten sentence is not. A mark or queued link that anchors through a paragraph alias is fine: `/marks` maps a stored mark's id through the report's aliases (`markCounts`, j53o) and the Worker redirects a link; an editorial reference does not follow aliases and fails. A mark whose words are in a different paragraph with no alias leading to them (`elsewhere`) renders nowhere and fails. Fix a stranded mark by restoring its words upstream or adding the alias, an editorial reference by editing the yaml; never by deleting the reader's mark. Read what it prints, then decide.
8. `pnpm quality report --diff origin/main` into the PR body; every regression needs a bead; `pnpm quality ratchet` for improvements. `verify.sh` reminds you while `quality-last.json` is from another ingest version (new).
9. `./scripts/verify.sh` exits 0.

## Ship (after the pin-bump PR merges)

10. Which reports need publishing: `pnpm prerender`, then `pnpm publish-report --all --status --base https://reportsthatmatter.org` (new). It lists local against served hash per report and the ones to publish. No secret, no writes. Do not write a throwaway hashing script.
11. Can D1 take the writes: `pnpm publish-report <id> --preflight` (new) for the largest report on the list (Leveson, Philip Morris). It probes one row, reports whether the daily quota (100,000 row writes on the free tier) is spent and when it resets, and what this publish costs. `pnpm publish-report <id> --dry-run` (new) prints the objects, the served version and the estimated row writes for any report. If it does not fit, stop and wait for 00:00 UTC or decide about Workers Paid (reportsthatmatter-2oz).
12. Publish each report on the list: `RTM_PUBLISH_SECRET=$(cat ~/.rtm-publish-secret) pnpm publish-report <id> --base https://reportsthatmatter.org`. A real publish runs the preflight itself and stops before uploading when the quota is spent. The search reindex that follows writes only the paragraphs that changed (new): a typical release is a few thousand row writes for the corpus, not the 250,000 a full rewrite costs. A failed publish is repeated with the same command (uploads are idempotent).
13. Deploy (`./scripts/deploy-cloudflare.sh`; it prints the drift table at the end (new), which should now list nothing), then `pnpm editorial` and `pnpm seed-highlights --remote`.
14. Production verify: `VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh`.
15. After the publishes and the deploy, `pnpm marks check --all --refresh` once more with no baseline: the candidate is now what readers are served, and marks written since step 7 are replayed too.
16. Record: `pnpm quality ratchet --record`, commit `reports/quality-last.json`; close the beads.
