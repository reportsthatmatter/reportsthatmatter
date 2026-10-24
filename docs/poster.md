# The scheduled poster

Reportsthatmatter-y2t.4. Once a day the next due item in [`marketing/queue.yaml`](../marketing/queue.yaml) is posted to Bluesky, with a link card, and the post's URL is recorded back in the queue. Bluesky only; X is posted by hand. The queue itself is built by `pnpm posts` ([posts-queue.md](posts-queue.md)).

Two posters share one decision module ([`src/lib/poster.ts`](../src/lib/poster.ts)) and one Bluesky adapter ([`src/lib/bluesky-client.ts`](../src/lib/bluesky-client.ts)):

- **The Worker `rtm-poster`** ([`workers/poster/`](../workers/poster/), Datopian Cloudflare account) makes the post, on time: Cloudflare crons at 13:47 UTC, retrying at 14:17 and 14:47. It reads the switch and the queue from the public repo's `main` (raw.githubusercontent.com, so no token) and cannot write anything back.
- **The GitHub workflow** ([`.github/workflows/post-next.yml`](../.github/workflows/post-next.yml)) is the backup and the write-back. Its scheduled runs start hours late (see "When it posts"); each finds the Worker's post on the account and commits its `posted_url` and `posted_at` to the queue. If the Worker posted nothing, a workflow run posts, but never before 15:00 UTC (scheduled or manual), so the two never race.

## The switch

**One switch for both: [`marketing/poster-live.yaml`](../marketing/poster-live.yaml).** `live: true` posts; anything else (or `live: false`) makes both posters dry runs. Live since Sun 2026-10-25 (Rufus's instruction, 24 Oct). The old repository variable `POSTER_LIVE` is retired and deleted; the workflow no longer reads it.

- **Switch off:** set `live: false` in that file and push to `main` (on github.com: edit the file, commit). The workflow sees it on its next run; the Worker usually within 5 minutes (GitHub's raw cache, `max-age=300`; allow 10). If it must stop sooner, stop the Worker outright (below). Any agent may switch it off.
- **Switch on:** `live: true`, pushed to `main`. Rufus's call.
- **Stop the Worker outright** (belt and braces, or if GitHub is unreachable): `pnpm wrangler delete -c workers/poster/wrangler.toml` from a checkout logged into the Datopian account, or remove its cron triggers in the Cloudflare dashboard (Workers, `rtm-poster`, Settings, Triggers). Redeploy to restore.

Credentials: the account is `@reportsthatmatter.org`, DID `did:plc:owtfs5pk265ppfmojghzr56t`, posting with the app password `rtm-poster` (the local copy is `~/.config/bluesky/reportsthatmatter` on Rufus's machine). The GitHub workflow has it as the Actions secrets `BLUESKY_HANDLE` (the DID) and `BLUESKY_APP_PASSWORD`; the Worker has the DID as a plain var in its `wrangler.toml` and the password as the Worker secret `BLUESKY_APP_PASSWORD`. If the app password is revoked or rotated, update both: `gh secret set BLUESKY_APP_PASSWORD -R reportsthatmatter/reportsthatmatter` and `pnpm wrangler secret put BLUESKY_APP_PASSWORD -c workers/poster/wrangler.toml`.

The workflow's states:

| Secrets | Switch file | A workflow run does |
| --- | --- | --- |
| none | off | dry run, no Bluesky request at all, exit 0 |
| both | off | dry run that logs in and reads the account's recent posts (read-only), exit 0 |
| both | `live: true` | records the Worker's post, or (after 15:00 UTC) posts if there is none; commits `posted_url` |
| missing or one | `live: true` | fails, loudly: live was asked for without credentials |

The Worker with the switch off makes no Bluesky request at all. A manual run of the workflow is a dry run unless you untick "Dry run", and even then it posts only if the switch is on. A manual live run (`gh workflow run post-next.yml -R reportsthatmatter/reportsthatmatter -f dry_run=false`) has the same 15:00 UTC gate as a scheduled one: before then it says "Too early" and does nothing, so it can never race the Worker. After 15:00 it records today's post, or posts if the Worker did not.

## When it posts

The post is meant for about 14:00 UTC. GitHub's `schedule` is best-effort: a single `0 14 * * *` cron started 4 to 8 hours late every day from 4 to 16 October (reportsthatmatter-gweq), and the four off-peak crons that replaced it (`47 13`, `17 14`, `47 14`, `17 15`) still started around 17:00 to 19:00 UTC. So the Worker makes the post (Cloudflare crons run within a minute or so of their time), and the workflow's crons stay as the backup and the write-back. The rules, enforced by the shared code:

- **One post per UTC day.** Every run, Worker or workflow, first lays the account's 100 most recent posts over the queue (`overlayAccount` in `runPoster`): any queue item already on the account counts as posted, at that post's time. So the Worker's retries and next days never repost, however late (or absent) the GitHub write-back, and a workflow run whose queue is behind (lost commits, a missed day, an item merged after the Worker read the queue) records every post it finds in one go and posts nothing more that day. Workflow runs are also serialised by `concurrency: post-next`.
- **Not before 13:00 UTC** for the Worker; **not before 15:00 UTC** for any workflow run (`POSTER_NOT_BEFORE`), which leaves the Worker's window to the Worker. Dry runs are never gated.
- **Kept-clear days** are skipped by every run.

Measure: `gh run list --workflow post-next.yml --limit 30 --json createdAt,event` for the workflow; the Worker's runs and logs are in the Cloudflare dashboard (Workers, `rtm-poster`, Logs; observability is on), or `pnpm wrangler tail -c workers/poster/wrangler.toml` at 13:47.

## What a run does

**The Worker** (`workers/poster/run.ts`): reads the switch (stops there if off), the queue and the account's recent posts, overlays them, then the same selection and checks as below. In place of `pnpm posts --check` (which needs a build), just before posting it fetches the item's deep link from the live site (without `src=bsky`) and refuses unless the page carries the paragraph id, or the id the site redirected an alias to. It fetches the card image from the repo. Every problem throws: the invocation shows as failed in the Cloudflare dashboard, and the workflow's backup run after 15:00 UTC posts if nothing went out.

**The workflow:**

1. `pnpm prerender` and `pnpm posts --check`: if an unposted queue item no longer matches its report (a re-ingest moved a paragraph id), the run posts nothing and ends red, but still records any posts already on the account (`POSTER_RECORD_ONLY`), so a post the Worker made is never left unrecorded. Fix with `pnpm posts --drop-stale` in a PR.
2. `pnpm post-next` ([`scripts/post-next.mjs`](../scripts/post-next.mjs), decisions in [`src/lib/poster.ts`](../src/lib/poster.ts)):
   - **Selects** the first unposted item, in `scheduled` order, whose date has arrived. A missed day is made up one post at a time, never in a burst. At most one item per UTC day.
   - **Checks the account**: the 100 most recent posts of the account itself (replies and reposts excluded). Every queue item one of them carries (its deep link in the card, or exactly its text) is recorded as posted (`posted_url` and `posted_at` from that post). If that makes today already posted, **nothing is posted**; otherwise the first due item is.
   - **Posts** the item's `text`: the hook and source line where a person has written a `hook` (the `post-writing` skill, [posts-queue.md](posts-queue.md#the-format)), otherwise the quote and source line (Appendix C of the launch plan), with an `app.bsky.embed.external` link card: `uri` is the item's `?p=` deep link (with `src=bsky`), the title is the report's title, the description names the page, and the thumbnail is the item's card image from the queue.
   - **Writes** `posted_url` and `posted_at` into `marketing/queue.yaml`.
3. Commits that file as `github-actions[bot]` and pushes to `main` (three attempts, rebasing between). `main` is not branch-protected; if that changes, give the workflow a bypass or move the write-back to a PR.

## Why it cannot double-post

- An item with a `posted_url` is never selected, and `pnpm posts` never clears one.
- One post per UTC day, from `posted_at` (this is what makes the several crons safe).
- No live post before 13:00 UTC; no workflow post before 15:00 UTC, after the Worker's last retry at 14:47.
- The workflow runs one at a time (`concurrency: post-next`); the Worker's three crons are 30 minutes apart, and each run takes seconds.
- Both posters trust the account over the queue: an item on the account is posted (`overlayAccount`), and a post found for today means nothing more is posted today.
- The post goes out before the commit, so a crash between them leaves a post with no `posted_url`. The next run finds it on the account by its deep link and records it instead of posting again. This is the case the account check exists for.
- A feed read that fails stops the run before anything is posted. No blind post.

## Failing loudly

Every workflow problem exits 1 and turns the run red: GitHub emails the people watching the repo's Actions. Bad credentials, a Bluesky error, an over-long or off-site item, a missing card, a stale queue item, a push that cannot land. Nothing is retried except the push. A failed Worker run is visible only in the Cloudflare dashboard (it is retried by its next cron), and a day it misses entirely is covered: the workflow posts after 15:00 UTC. With a bad secret the run fails once a day until fixed; set the switch to `live: false` to stop the mail.

## Rehearsing locally

```bash
pnpm post-next                      # dry run, no network
POSTER_TODAY=2026-10-20 pnpm post-next   # pretend it is that day
```

`pnpm test` covers the Worker too (`tests/poster-worker.test.ts`: the switch, retries, several days with no write-back, the deep-link check, the late GitHub run recording the Worker's post with today's `posted_at`, and both schedules). `wrangler dev --test-scheduled` in `workers/poster/` runs it in workerd. `pnpm test` also covers selection, idempotency, dry run and the Bluesky calls (against a local stand-in server). `tests/poster.test.ts` includes the daily window: four cron-time runs post once, a run at 12:50 on launch day posts nothing, a kept-clear day is skipped, and the workflow's crons are off the round minute. 
