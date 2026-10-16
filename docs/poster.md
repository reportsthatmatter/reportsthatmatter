# The scheduled poster

Reportsthatmatter-y2t.4. A GitHub Actions cron posts the next due item in [`marketing/queue.yaml`](../marketing/queue.yaml) to Bluesky once a day, with a link card, and commits the post's URL back to the queue. Bluesky only; X is posted by hand. The queue itself is built by `pnpm posts` ([posts-queue.md](posts-queue.md)).

Merged, it does nothing visible: **it is a dry run until Rufus turns it on.**

## How to turn it on (Rufus)

After the account exists (reportsthatmatter-y2t.1):

1. In Bluesky, Settings, Privacy and security, App passwords: create one named `rtm-poster`. Never use the account password.
2. In the repo, Settings, Secrets and variables, Actions, **Secrets**: add `BLUESKY_HANDLE` (the handle without `@`, or the account's DID, which also works as the login identifier and in the `posted_url` links) and `BLUESKY_APP_PASSWORD` (the app password from step 1). **Done on 17 Oct 2026:** `BLUESKY_HANDLE` is the DID `did:plc:owtfs5pk265ppfmojghzr56t`, so the switch of the account's handle to `reportsthatmatter.org` (still pending) does not touch the secret; `posted_url` values are `https://bsky.app/profile/did:plc:…/post/…`. Or:
   ```bash
   gh secret set BLUESKY_HANDLE --body reportsthatmatter.org
   gh secret set BLUESKY_APP_PASSWORD   # paste when prompted
   ```
3. **Rehearse.** Actions, "Post next excerpt to Bluesky", Run workflow (leave "Dry run" ticked). With the secrets present it logs in and reads the account's recent posts, so a wrong handle or password fails here, red, with nothing posted. The run summary shows the exact post that would go out.
4. **Switch on.** In Settings, Secrets and variables, Actions, **Variables**, add `POSTER_LIVE` = `true`:
   ```bash
   gh variable set POSTER_LIVE --body true
   ```
   The next scheduled run from 13:47 UTC posts (see "When it posts"). Launch is Tue 2026-10-20: switch on that day before 13:47 UTC (the 20 October run posts the queue's first item, Challenger p. 146), or later; nothing is dated before 20 October, so nothing is due before then whatever the variable says. `pnpm posts --check` must pass first (it runs in the workflow too). Rufus's order for the day is `drafts/2026-10/launch-day-checklist.md` in the marketing repo. **Launch-day backup:** at 13:55 UTC (before the Show HN at 14:00), unless the excerpt is already on the account, start one by hand (safe even while the 13:47 run is still going: runs queue one at a time, and one that finds today's post does nothing): `gh workflow run post-next.yml -R reportsthatmatter/reportsthatmatter -f dry_run=false` (with `dry_run=false` it follows `POSTER_LIVE`; any scheduled run that starts later finds today's post and does nothing).
5. **Switch off:** set `POSTER_LIVE` to `false` or delete the variable. A scheduled run goes back to a dry run at once.

The three states:

| Secrets | `POSTER_LIVE` | A run does |
| --- | --- | --- |
| none | unset | dry run, no Bluesky request at all, exit 0 |
| both | unset or not `true` | dry run that logs in and reads the account's recent posts (read-only), exit 0 |
| both | `true` | posts, commits `posted_url` |
| missing or one | `true` | fails, loudly: live was asked for without credentials |

A manual run of the workflow is a dry run unless you untick "Dry run", and even then it posts only if `POSTER_LIVE` is `true`.

## When it posts

The post is meant for about 14:00 UTC. GitHub's `schedule` is best-effort: it starts runs when it has capacity, and worst at the top of the hour. A single `0 14 * * *` cron started 4 to 8 hours late every day from 4 to 16 October (13 runs, started 17:43 to 21:53 UTC; reportsthatmatter-gweq). So the workflow has four crons at off-peak minutes, `47 13`, `17 14`, `47 14` and `17 15` (UTC), and the script makes that safe:

- **One post per UTC day.** Whichever run starts first posts; each later one finds today's `posted_at` (or, if the commit was lost, the post on the account) and does nothing. They are also serialised by `concurrency: post-next`.
- **Not before 13:00 UTC.** A live run earlier than `POSTER_NOT_BEFORE` (default `13:00`, UTC) posts nothing and says "Too early". Dry runs are never gated, so a rehearsal at any hour shows the post.
- **Kept-clear days** are skipped by every run.

The off-peak minutes are a bet, not a measurement: before this change every run was at minute 0, so there is no data for other minutes. Measure after the first week (`gh run list --workflow post-next.yml --limit 30 --json createdAt,event`; the target is a first run within 30 minutes of 13:47). If it still lags, the next step is a Cloudflare Worker cron on the Datopian account that calls `workflow_dispatch` (needs a fine-grained GitHub token with Actions write stored as a Worker secret; the Worker would be production infrastructure). The manual run above stays as the backup either way.

## What a run does

1. `pnpm prerender` and `pnpm posts --check`: fails the run, before anything is posted, if an unposted queue item no longer matches its report (a re-ingest moved a paragraph id). Fix with `pnpm posts --drop-stale` in a PR.
2. `pnpm post-next` ([`scripts/post-next.mjs`](../scripts/post-next.mjs), decisions in [`src/lib/poster.ts`](../src/lib/poster.ts)):
   - **Selects** the first unposted item, in `scheduled` order, whose date has arrived. A missed day is made up one post at a time, never in a burst. At most one item per UTC day.
   - **Checks the account**: the 100 most recent posts of the account itself (replies and reposts excluded). If one carries this item's deep link in its card, or has exactly its text, the item is recorded as posted (`posted_url` set to that post) and **nothing is posted**.
   - **Posts** the text (quote and source line, as in Appendix C of the launch plan) with an `app.bsky.embed.external` link card: `uri` is the item's `?p=` deep link (with `src=bsky`), the title is the report's title, the description names the page, and the thumbnail is the item's card image from the queue.
   - **Writes** `posted_url` and `posted_at` into `marketing/queue.yaml`.
3. Commits that file as `github-actions[bot]` and pushes to `main` (three attempts, rebasing between). `main` is not branch-protected; if that changes, give the workflow a bypass or move the write-back to a PR.

## Why it cannot double-post

- An item with a `posted_url` is never selected, and `pnpm posts` never clears one.
- One post per UTC day, from `posted_at` (this is what makes the several crons safe).
- No live post before 13:00 UTC.
- The workflow runs one at a time (`concurrency: post-next`).
- The post goes out before the commit, so a crash between them leaves a post with no `posted_url`. The next run finds it on the account by its deep link and records it instead of posting again. This is the case the account check exists for.
- A feed read that fails stops the run before anything is posted. No blind post.

## Failing loudly

Every problem exits 1 and turns the run red: GitHub emails the people watching the repo's Actions. Bad credentials, a Bluesky error, an over-long or off-site item, a missing card, a stale queue item, a push that cannot land. Nothing is retried except the push. With a bad secret the run fails once a day until fixed; switch `POSTER_LIVE` off to stop the mail.

## Rehearsing locally

```bash
pnpm post-next                      # dry run, no network
POSTER_TODAY=2026-10-20 pnpm post-next   # pretend it is that day
```

`pnpm test` covers selection, idempotency, dry run and the Bluesky calls (against a local stand-in server). `tests/poster.test.ts` includes the daily window: four cron-time runs post once, a run at 12:50 on launch day posts nothing, a kept-clear day is skipped, and the workflow's crons are off the round minute. A real account has not been exercised yet; step 3 above is the first time.
