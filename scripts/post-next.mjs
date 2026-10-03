/* The scheduled poster (reportsthatmatter-y2t.4): posts the next due item in
 * marketing/queue.yaml to Bluesky, with a link card, and writes `posted_url`
 * (and `posted_at`) back to the queue file. The workflow commits it.
 *
 *   pnpm post-next               # dry run unless POSTER_LIVE=true and credentials are set
 *   POSTER_LIVE=true BLUESKY_HANDLE=... BLUESKY_APP_PASSWORD=... pnpm post-next
 *
 * Environment: BLUESKY_HANDLE, BLUESKY_APP_PASSWORD (repository secrets),
 * POSTER_LIVE (repository variable; anything but "true" is a dry run).
 * Optional: POSTER_TODAY=YYYY-MM-DD, POSTER_QUEUE=path (tests and rehearsals), POSTER_SERVICE.
 *
 * Exit 0: posted, reconciled, dry run, nothing due, already posted today.
 * Exit 1: anything wrong. Nothing is swallowed. The decisions are in
 * src/lib/poster.ts; this file is only the Bluesky adapter and the file I/O.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { AtpAgent } from "@atproto/api";
import { QUEUE_HEADER, isoDate } from "../src/lib/posts.ts";
import { decideMode, runPoster, cardMeta } from "../src/lib/poster.ts";
import { SITE_ORIGIN } from "../src/templates/site.ts";

const root = join(import.meta.dirname, "..");
const queuePath = process.env.POSTER_QUEUE || join(root, "marketing/queue.yaml");

function say(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

const postUrl = (handle, uri) => `https://bsky.app/profile/${handle}/post/${uri.split("/").pop()}`;

async function connect(env) {
  const agent = new AtpAgent({ service: env.POSTER_SERVICE || "https://bsky.social" });
  const handle = env.BLUESKY_HANDLE.trim().replace(/^@/, "");
  await agent.login({ identifier: handle, password: env.BLUESKY_APP_PASSWORD.trim() });
  const did = agent.session.did;

  const toFeedPost = (p) => ({
    uri: p.uri,
    url: postUrl(handle, p.uri),
    text: p.record?.text ?? "",
    embedUri: p.embed?.external?.uri ?? null,
    createdAt: p.record?.createdAt ?? p.indexedAt ?? "",
  });

  return {
    async recentPosts() {
      const res = await agent.getAuthorFeed({ actor: did, limit: 100, filter: "posts_no_replies" });
      // Own posts only: a repost of someone else's post carries their author did.
      return res.data.feed.filter((f) => f.post.author.did === did && !f.reason).map((f) => toFeedPost(f.post));
    },
    async publish(item) {
      const cardFile = join(root, item.card);
      if (!existsSync(cardFile)) throw new Error(`Card image missing: ${item.card}`);
      const upload = await agent.uploadBlob(readFileSync(cardFile), { encoding: "image/png" });
      const { title, description } = cardMeta(item);
      const res = await agent.post({
        text: item.text,
        langs: ["en"],
        embed: {
          $type: "app.bsky.embed.external",
          external: { uri: item.link, title, description, thumb: upload.data.blob },
        },
      });
      return { uri: res.uri, url: postUrl(handle, res.uri), text: item.text, embedUri: item.link, createdAt: new Date().toISOString() };
    },
  };
}

try {
  const env = process.env;
  const mode = decideMode(env);
  const today = env.POSTER_TODAY || isoDate(new Date());
  const doc = parse(readFileSync(queuePath, "utf8"));
  const client = mode.hasCredentials ? await connect(env) : null;

  say(`Poster mode: ${mode.live ? "LIVE" : "DRY RUN"} — ${mode.why}. Date: ${today}.`);
  const result = await runPoster({ queue: doc.items ?? [], today, mode, client, siteOrigin: SITE_ORIGIN });

  switch (result.outcome) {
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
