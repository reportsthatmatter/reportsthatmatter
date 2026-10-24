/**
 * One run of the Worker poster (workers/poster/): the daily Bluesky post, on time. GitHub Actions starts scheduled
 * runs hours late, so this Cloudflare cron makes the post and the GitHub workflow is the backup and the write-back.
 *
 * It decides with exactly the GitHub poster's code (src/lib/poster.ts) and posts with its adapter
 * (src/lib/bluesky-client.ts). The differences are only where things come from, and one consequence:
 *
 * - the switch and the queue are read from the public repo's main (raw.githubusercontent.com, about 5 minutes'
 *   cache), so the one switch is marketing/poster-live.yaml for both posters;
 * - it cannot write the queue back; runPoster lays the account's recent posts over the queue (overlayAccount), so
 *   whatever it posted on earlier days counts as posted, and today's post counts as today's, however late the
 *   GitHub run that records them;
 * - the workflow's `pnpm posts --check` needs a build, so instead, just before posting, it fetches the item's deep
 *   link and refuses unless the page carries the paragraph id.
 *
 * Every problem throws (the cron invocation is marked failed in the Cloudflare dashboard); the GitHub backup after
 * 15:00 UTC then posts if nothing went out.
 */
import { parse } from "yaml";
import { connectBluesky } from "../../src/lib/bluesky-client";
import { DEFAULT_NOT_BEFORE, SWITCH_PATH, decideMode, readSwitch, runPoster, type PosterClient, type PosterItem, type RunResult } from "../../src/lib/poster";
import { SITE_ORIGIN } from "../../src/templates/site";

export type PosterEnv = {
  BLUESKY_HANDLE?: string;
  BLUESKY_APP_PASSWORD?: string;
  /** Where the repo's files are read from: https://raw.githubusercontent.com/<owner>/<repo>/main */
  REPO_RAW_BASE: string;
  /** Tests only: a stand-in PDS. */
  POSTER_SERVICE?: string;
};

export type RunDeps = {
  env: PosterEnv;
  now: Date;
  fetch: typeof fetch;
  /** Tests replace the Bluesky client; production logs in with connectBluesky. */
  connect?: (config: Parameters<typeof connectBluesky>[0]) => Promise<PosterClient>;
  log?: (line: string) => void;
};

export type WorkerOutcome = { outcome: "off"; why: string } | RunResult;

async function getText(f: typeof fetch, url: string): Promise<string> {
  // A query string keeps Cloudflare's own cache out of it; GitHub's raw cache (max-age 300) still applies.
  const res = await f(`${url}?t=${Date.now()}`, { headers: { "user-agent": "rtm-poster (reportsthatmatter.org)" } });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return res.text();
}

/**
 * The deep link must open on the item's paragraph: a re-ingest that dropped the id would otherwise ship a broken link.
 * A moved id still works (the site redirects an alias to the new id), so the id the final URL names is accepted too.
 * `src=bsky` is taken off so the check is not counted as a visit from Bluesky.
 */
export async function checkDeepLink(f: typeof fetch, item: Pick<PosterItem, "id" | "link" | "paragraph">): Promise<void> {
  const probe = new URL(item.link);
  probe.searchParams.delete("src");
  const res = await f(probe.toString(), { redirect: "follow" });
  if (!res.ok) throw new Error(`Deep link for ${item.id} answered HTTP ${res.status}: ${item.link}`);
  const html = await res.text();
  const ids = new Set([item.paragraph]);
  try {
    const final = new URL(res.url || probe.toString());
    if (final.searchParams.get("p")) ids.add(final.searchParams.get("p")!);
    if (final.hash.length > 1) ids.add(decodeURIComponent(final.hash.slice(1)));
  } catch {
    // no usable final URL: only the item's own id counts
  }
  if (![...ids].some((id) => html.includes(`id="${id}"`))) {
    throw new Error(`Deep link for ${item.id} does not open on paragraph ${item.paragraph} (stale queue item?): ${item.link}`);
  }
}

export async function runWorkerPoster(deps: RunDeps): Promise<WorkerOutcome> {
  const { env, now } = deps;
  const f = deps.fetch;
  const log = deps.log ?? ((l: string) => console.log(l));
  const today = now.toISOString().slice(0, 10);

  const live = readSwitch(await getText(f, `${env.REPO_RAW_BASE}/${SWITCH_PATH}`));
  if (!live) {
    const why = `${SWITCH_PATH} does not say live: true`;
    log(`Poster off: ${why}. Nothing read from Bluesky, nothing posted.`);
    return { outcome: "off", why };
  }
  // Same rule as the workflow: live without both credentials throws.
  const mode = decideMode({ POSTER_LIVE: "true", BLUESKY_HANDLE: env.BLUESKY_HANDLE, BLUESKY_APP_PASSWORD: env.BLUESKY_APP_PASSWORD });

  const doc = parse(await getText(f, `${env.REPO_RAW_BASE}/marketing/queue.yaml`));
  const queue: PosterItem[] = doc?.items ?? [];
  if (!Array.isArray(queue)) throw new Error("marketing/queue.yaml has no items list");

  const client = await (deps.connect ?? connectBluesky)({
    service: env.POSTER_SERVICE,
    handle: env.BLUESKY_HANDLE!,
    password: env.BLUESKY_APP_PASSWORD!,
    async readCard(path) {
      const res = await f(`${env.REPO_RAW_BASE}/${path}`);
      if (!res.ok) throw new Error(`Card image ${path}: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    beforePublish: (item) => checkDeepLink(f, item),
  });

  // runPoster lays the account's recent posts over the queue (overlayAccount) before it selects.
  const result = await runPoster({
    queue,
    today,
    mode,
    client,
    siteOrigin: SITE_ORIGIN,
    notBefore: DEFAULT_NOT_BEFORE,
    now: () => now,
  });
  log(describe(result));
  return result;
}

export function describe(r: WorkerOutcome): string {
  switch (r.outcome) {
    case "off": return `off: ${r.why}`;
    case "too-early": return `too early: ${r.item.id} is due, nothing is posted before ${r.notBefore} UTC`;
    case "nothing-due": return `nothing to post: ${r.reason}`;
    case "already-posted-today": return `already posted today: ${r.item.id} -> ${r.item.posted_url}`;
    case "dry-run": return `dry run: would post ${r.item.id}`;
    case "reconciled": return `${r.item.id} was already on the account (${r.post.url}); not posted again`;
    case "posted": return `posted ${r.item.id}: ${r.post.url}`;
  }
}
