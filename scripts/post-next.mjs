/* The scheduled poster (reportsthatmatter-y2t.4): posts the next due item in
 * marketing/queue.yaml to Bluesky, with a link card, and writes `posted_url`
 * (and `posted_at`) back to the queue file. The workflow commits it.
 *
 *   pnpm post-next               # dry run unless POSTER_LIVE=true and credentials are set
 *   POSTER_LIVE=true BLUESKY_HANDLE=... BLUESKY_APP_PASSWORD=... pnpm post-next
 *
 * Environment: BLUESKY_HANDLE, BLUESKY_APP_PASSWORD (repository secrets),
 * POSTER_LIVE ("true" posts, anything else is a dry run; "file" reads the switch marketing/poster-live.yaml,
 * which is what the workflow passes, or POSTER_SWITCH=path to read another file).
 * Optional: POSTER_NOT_BEFORE=HH:MM (UTC, default 13:00: a live run earlier than this posts nothing),
 * POSTER_NOW=ISO timestamp (tests: the clock the gate reads), POSTER_TODAY=YYYY-MM-DD, POSTER_QUEUE=path (tests and rehearsals), POSTER_SERVICE.
 *
 * Exit 0: posted, reconciled, dry run, nothing due, already posted today.
 * Exit 1: anything wrong. Nothing is swallowed. The decisions are in
 * src/lib/poster.ts; the Bluesky adapter is src/lib/bluesky-client.ts
 * (shared with the Worker poster, workers/poster/); this file is only the file I/O.
 */
import "./lib/help.mjs";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { QUEUE_HEADER, isoDate } from "../src/lib/posts.ts";
import { DEFAULT_NOT_BEFORE, SWITCH_PATH, decideMode, readSwitch, runPoster } from "../src/lib/poster.ts";
import { connectBluesky } from "../src/lib/bluesky-client.ts";
import { SITE_ORIGIN } from "../src/templates/site.ts";

const root = join(import.meta.dirname, "..");
const queuePath = process.env.POSTER_QUEUE || join(root, "marketing/queue.yaml");

function say(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

try {
  const env = { ...process.env };
  // The workflow passes POSTER_LIVE=file: the switch is marketing/poster-live.yaml, which the Worker poster reads too.
  if (env.POSTER_LIVE === "file") {
    const switchPath = env.POSTER_SWITCH || join(root, SWITCH_PATH);
    env.POSTER_LIVE = readSwitch(readFileSync(switchPath, "utf8")) ? "true" : "false";
    say(`Switch ${SWITCH_PATH}: live is ${env.POSTER_LIVE}.`);
  }
  const mode = decideMode(env);
  const today = env.POSTER_TODAY || isoDate(new Date());
  const doc = parse(readFileSync(queuePath, "utf8"));
  const client = mode.hasCredentials
    ? await connectBluesky({
        service: env.POSTER_SERVICE,
        handle: env.BLUESKY_HANDLE,
        password: env.BLUESKY_APP_PASSWORD,
        async readCard(path) {
          const cardFile = join(root, path);
          if (!existsSync(cardFile)) throw new Error(`Card image missing: ${path}`);
          return readFileSync(cardFile);
        },
      })
    : null;
  if (client && env.POSTER_RECORD_ONLY) {
    // The workflow's queue check failed: record what is on the account, never post.
    client.publish = async (item) => {
      throw new Error(`Not posting ${item.id}: the queue check failed (POSTER_RECORD_ONLY).`);
    };
  }

  say(`Poster mode: ${mode.live ? "LIVE" : "DRY RUN"} — ${mode.why}. Date: ${today}.`);
  const notBefore = (env.POSTER_NOT_BEFORE || DEFAULT_NOT_BEFORE).trim();
  const clock = env.POSTER_NOW ? () => new Date(env.POSTER_NOW) : undefined;
  const result = await runPoster({ queue: doc.items ?? [], today, mode, client, siteOrigin: SITE_ORIGIN, notBefore, now: clock });

  switch (result.outcome) {
    case "too-early":
      say(`Too early: ${result.item.id} is due, but a live run posts nothing before ${result.notBefore} UTC. A later run today will post it.`);
      break;
    case "nothing-due":
      say(`Nothing to post: ${result.reason}.`);
      break;
    case "already-posted-today":
      say(`Already posted today (${result.item.id} -> ${result.item.posted_url}). Not posting a second item.`);
      break;
    case "dry-run":
      say(
        result.wouldReconcile
          ? `DRY RUN: ${result.item.id} is already on the account (${result.wouldReconcile.url}); a live run would only record that URL.`
          : `DRY RUN: would post ${result.item.id} (scheduled ${result.item.scheduled}), nothing was sent:`
      );
      if (!result.wouldReconcile) {
        say(`\n${result.item.text}\n\nlink card: ${result.item.link}\ncard image: ${result.item.card}`);
      }
      break;
    case "reconciled":
      say(`${result.item.id} was already on the account; recorded ${result.post.url} and did not post again.`);
      break;
    case "posted":
      say(`Posted ${result.item.id}: ${result.post.url}`);
      break;
  }

  if (result.changed) {
    writeFileSync(queuePath, `${QUEUE_HEADER}${stringify({ items: result.queue })}`);
    say("Wrote posted_url back to marketing/queue.yaml (the workflow commits it).");
  }
} catch (err) {
  console.error(`\nPOSTER FAILED: ${err instanceof Error ? err.message : err}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n**POSTER FAILED:** ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
