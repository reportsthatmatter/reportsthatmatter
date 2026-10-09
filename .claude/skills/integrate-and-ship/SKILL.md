---
name: integrate-and-ship
description: Use when you are the one integrator on Reports that Matter taking reviewed PRs to production — merging in the review's order, releasing @rtm/ingest, bumping the pin in the site and every report repo, re-ingesting, verifying, checking the D1 budget, then pnpm ship (publish, deploy, reindex, seed, production verify, record) and closing the beads. Only after a reviewer's verdict; never as a fix or stage agent.
---

# Integrator: release, bump the pin, re-ingest, verify, ship

**Level:** `level:specced` (Sonnet; it follows the review's steps and decides nothing new). **Only the integrator** merges, releases, deploys, publishes or seeds; one at a time. The ordered steps and what each answers are **[`docs/release-checklist.md`](../../../docs/release-checklist.md)**; `pnpm ship` automates its steps 3-16 (`scripts/ship.ts`; flags: `pnpm ship --help`). What ships how: `docs/ARCHITECTURE.md` "what needs a deploy?". D1 limits and Cloudflare profile: AGENTS.md "Working conventions", "Cloudflare".

**Entry.** A review file (`~/src/reportsthatmatter/review-*.md`, `pr-review` skill) whose verdicts say MERGE/SHIP, with head shas and numbered integrator steps. No other integrator mid-release (`pnpm ship --status` in the shared site checkout says where a previous run stopped).

## Procedure

You work in the shared checkouts on `main` (`~/src/reportsthatmatter/reportsthatmatter`, `../ingest`, the report repos): the one role that does. Before starting: `git -C <each> status` is clean; `git checkout .beads/issues.jsonl` if `bd dolt pull` rewrote it.

1. **Merge in the review's order**, at the reviewed heads: `gh pr merge <n> --squash` (check `gh pr view <n> --json headRefOid` first; a newer head needs the reviewer's word). Conflicts: the review's recipe; derived files (`marketing/queue.yaml`, `reports/corpus-baseline.json`, `src/generated/*`) take main's and regenerate.
2. **Release ingest** (only if an ingest PR merged): in the shared `~/src/reportsthatmatter/ingest` on `main`, `git pull --ff-only`, `pnpm release X.Y.Z --dry-run`, then `pnpm release X.Y.Z`. It refuses a worktree, a dirty tree or a stale `dist/`.
3. **Pin bump** in a site branch:
   - `pnpm bump-pin X.Y.Z --dry-run`, then `pnpm bump-pin X.Y.Z --shared`: edits the site's and every report repo's `package.json`, refreshes each lockfile with `pnpm install --no-frozen-lockfile`, runs `pnpm ingest preflight`; it commits nothing. Check each `pnpm-lock.yaml` names the tag's commit (a mistyped version fails at install and leaves the site's `package.json` edited: `git checkout package.json`).
   - Commit and push the report repos' pin bumps; open and merge the site's pin-bump PR. `pnpm ship --reset` (the state file belongs to the last release).
4. **Plan**: `git pull --ff-only` in the site, then `pnpm ship --plan` (add `--measure` to run `pnpm ingest check` in memory). The guard must list no problem; the report table should match the review's "what moves".
5. **Run**: `pnpm ship --shared`. It stops at each gate: read what it names, then `pnpm ship --ack baseline` (or `corpus`, `editorial`) and run again. A failed check exits 1 with a "Read" list and a log under `build/ship/logs/`. Commit what a step regenerated (aliases, cards, queue, ratchet) in a site PR, merge it, run again; it resumes.
6. **D1 budget**: the `d1-estimate` step compares the publish and reindex cost with today's use (`pnpm d1-usage`; free tier 100,000 writes and 5,000,000 reads a day, reset 00:00 UTC). It refuses when it cannot read today's use from Cloudflare analytics or the cost does not fit: wait for the reset, or run `pnpm wrangler login` if analytics is unreadable.
7. **Production**: `pnpm ship --shared --yes` runs publish (`--no-reindex`), deploy, reindex, seed, `verify-prod` and record. Check: `pnpm publish-report --all --status --base https://reportsthatmatter.org` lists nothing to publish; `curl -sD- -o /dev/null https://reportsthatmatter.org/reports/<id>/full | grep -i x-rtm-content-version` is a hash.
8. **Record and close**: commit `reports/quality-last.json`, `reports/verify-last.json`, `docs/scores.json` if `record` changed them; `reports/pipeline.yaml` rows (`reached: publish`, `state: waiting`; `pnpm test -- pipeline-status` before committing); `bd close <id> --reason "Shipped in vX.Y.Z / site <sha>"` for the beads the review lists; `bd dolt push`.
9. **Housekeeping**: `pnpm worktrees prune` prints removable worktrees; `--apply` only between sessions, never on `*-<today>` worktrees.
10. Changelog checklist (AGENTS.md "Changelog"), lessons and retro (agent protocol R13-R14).

## Exit gate

- [ ] Every reviewed PR merged at its reviewed head, or held with a reason in its bead
- [ ] `pnpm ship --status` shows every step done; production `verify.sh` passed
- [ ] `publish-report --all --status` lists nothing to publish
- [ ] Record files committed; beads closed with reasons; `bd dolt push` done

## Integrator pitfalls (from `docs/design/lessons.md`)

- `pnpm release` must run in the shared `ingest/` on `main`, not a worktree.
- A new release's ship state is for the old pin: `pnpm ship --reset` before `--plan`.
- A report repo never installed on this machine stops `install` at preflight: `pnpm -C ../<repo> install`.
- The ratchet step can dirty `reports/quality-budget.yaml` and the `committed` gate then refuses: commit it in a PR and resume (better: the reviewer commits the ratchet).
- `bd dolt pull` rewrites `.beads/issues.jsonl`; `git checkout` it before the guard.
- `RTM_REPO_ROOT` left set in your shell (from scoring) makes ship treat report repos as worktrees: `unset RTM_REPO_ROOT RTM_REPORT_DIRS` before shipping.
- A never-published report is served from the deploy until published: ship deploys before reindexing, so its pages appear only after `deploy`.
- Wrangler on the wrong profile fails deploy with D1 `code: 10181`: `pnpm wrangler d1 list` must show `reportsthatmatter-marks`.
- Never query D1 `passages` by `WHERE report = ?` (it reads the whole corpus); never hand-run `wrangler d1 execute --remote` outside `scripts/lib/d1.ts`.
