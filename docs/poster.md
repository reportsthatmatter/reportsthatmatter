# The scheduled poster

Reportsthatmatter-y2t.4. A GitHub Actions cron posts the next due item in [`marketing/queue.yaml`](../marketing/queue.yaml) to Bluesky once a day, with a link card, and commits the post's URL back to the queue. Bluesky only; X is posted by hand. The queue itself is built by `pnpm posts` ([posts-queue.md](posts-queue.md)).

Merged, it does nothing visible: **it is a dry run until Rufus turns it on.**

## How to turn it on (Rufus)

After the account exists (reportsthatmatter-y2t.1):

1. In Bluesky, Settings, Privacy and security, App passwords: create one named `rtm-poster`. Never use the account password.
2. In the repo, Settings, Secrets and variables, Actions, **Secrets**: add `BLUESKY_HANDLE` (the handle, e.g. `reportsthatmatter.org`, no `@`) and `BLUESKY_APP_PASSWORD` (the app password from step 1). Or:
   ```bash
   gh secret set BLUESKY_HANDLE --body reportsthatmatter.org
   gh secret set BLUESKY_APP_PASSWORD   # paste when prompted
   ```
3. **Rehearse.** Actions, "Post next excerpt to Bluesky", Run workflow (leave "Dry run" ticked). With the secrets present it logs in and reads the account's recent posts, so a wrong handle or password fails here, red, with nothing posted. The run summary shows the exact post that would go out.
4. **Switch on.** In Settings, Secrets and variables, Actions, **Variables**, add `POSTER_LIVE` = `true`:
   ```bash
   gh variable set POSTER_LIVE --body true
   ```
   The next 14:00 UTC run posts. Do this on launch day (Tue 2026-10-13) or after: the queue's first item is dated 2026-10-14, so nothing is due before then whatever the variable says.
5. **Switch off:** set `POSTER_LIVE` to `false` or delete the variable. A scheduled run goes back to a dry run at once.

The three states:

| Secrets | `POSTER_LIVE` | A run does |
| --- | --- | --- |
| none | unset | dry run, no Bluesky request at all, exit 0 |
| both | unset or not `true` | dry run that logs in and reads the account's recent posts (read-only), exit 0 |
| both | `true` | posts, commits `posted_url` |
| missing or one | `true` | fails, loudly: live was asked for without credentials |

A manual run of the workflow is a dry run unless you untick "Dry run", and even then it posts only if `POSTER_LIVE` is `true`.

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
- One post per UTC day, from `posted_at`.
- The workflow runs one at a time (`concurrency: post-next`).
- The post goes out before the commit, so a crash between them leaves a post with no `posted_url`. The next run finds it on the account by its deep link and records it instead of posting again. This is the case the account check exists for.
- A feed read that fails stops the run before anything is posted. No blind post.

## Failing loudly

Every problem exits 1 and turns the run red: GitHub emails the people watching the repo's Actions. Bad credentials, a Bluesky error, an over-long or off-site item, a missing card, a stale queue item, a push that cannot land. Nothing is retried except the push. With a bad secret the run fails once a day until fixed; switch `POSTER_LIVE` off to stop the mail.

## Rehearsing locally

```bash
pnpm post-next                      # dry run, no network
POSTER_TODAY=2026-10-14 pnpm post-next   # pretend it is that day
```

`pnpm test` covers selection, idempotency, dry run and the Bluesky calls (against a local stand-in server). A real account has not been exercised yet; step 3 above is the first time.
