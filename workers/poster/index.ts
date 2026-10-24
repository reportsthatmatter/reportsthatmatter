/**
 * rtm-poster: the Cloudflare Worker that makes the daily Bluesky post on time (docs/poster.md). Cron only: it has no
 * route and no workers.dev URL, so nothing on the web can trigger a post. The logic is run.ts.
 */
import { runWorkerPoster, type PosterEnv } from "./run";

export default {
  async scheduled(event: { scheduledTime: number }, env: PosterEnv): Promise<void> {
    await runWorkerPoster({ env, now: new Date(event.scheduledTime), fetch: (input, init) => fetch(input, init) });
  },
};
