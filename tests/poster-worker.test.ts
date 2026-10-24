/** The Worker poster (workers/poster/): on time, one switch, never a double post, never a lost write-back. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { overlayAccount, readSwitch, runPoster, selectNext, type FeedPost, type PosterClient, type PosterItem } from "../src/lib/poster";
import { runWorkerPoster, type PosterEnv } from "../workers/poster/run";

const ORIGIN = "https://reportsthatmatter.org";
const RAW = "https://raw.example/repo/main";
const ENV: PosterEnv = { BLUESKY_HANDLE: "did:plc:test", BLUESKY_APP_PASSWORD: "app-pass", REPO_RAW_BASE: RAW };

function item(id: string, scheduled: string, extra: Partial<PosterItem> = {}): PosterItem {
  return {
    id,
    report: "demo",
    paragraph: `para-${id}`,
    quote: `quote ${id}`,
    text: `“quote ${id}”\n\n— The Demo Report, p. 7`,
    link: `${ORIGIN}/reports/demo?p=para-${id}&src=bsky`,
    card: `assets/cards/demo/${id}.png`,
    scheduled,
    posted_url: null,
    ...extra,
  };
}

/** The world the Worker sees: the repo's main on raw, the site, and the Bluesky account. */
function world(opts: { queue: PosterItem[]; live?: string | null; brokenLinks?: string[] }) {
  const account: FeedPost[] = [];
  const fetched: string[] = [];
  let logins = 0;
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input).replace(/\?t=\d+$/, "");
    fetched.push(url);
    if (url === `${RAW}/marketing/poster-live.yaml`) {
      return opts.live === null ? new Response("404", { status: 404 }) : new Response(`# the switch\nlive: ${opts.live ?? "true"}\n`);
    }
    if (url === `${RAW}/marketing/queue.yaml`) return new Response(`# header\n${stringify({ items: opts.queue })}`);
    if (url.startsWith(`${RAW}/assets/cards/`)) return new Response(new Uint8Array([137, 80, 78, 71]));
    if (url.startsWith(`${ORIGIN}/reports/demo?p=`)) {
      const p = new URL(url).searchParams.get("p")!;
      const id = opts.brokenLinks?.includes(p) ? "somewhere-else" : p;
      return new Response(`<html><p id="${id}">text</p></html>`);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  const connect = async (config: { readCard(p: string): Promise<Uint8Array>; beforePublish?(i: PosterItem): Promise<void> }): Promise<PosterClient> => {
    logins++;
    return {
      async recentPosts() {
        return [...account].reverse();
      },
      async publish(i) {
        await config.beforePublish?.(i);
        await config.readCard(i.card);
        const n = account.length + 1;
        const post = { uri: `at://did:plc:test/app.bsky.feed.post/${n}`, url: `https://bsky.app/profile/did:plc:test/post/${n}`, text: i.text, embedUri: i.link, createdAt: now.toISOString() };
        account.push(post);
        return post;
      },
    };
  };
  let now = new Date();
  const run = (iso: string) => {
    now = new Date(iso);
    return runWorkerPoster({ env: ENV, now, fetch: fetchFn, connect, log: () => {} });
  };
  return { run, account, fetched, logins: () => logins, fetch: fetchFn };
}

describe("readSwitch", () => {
  it("is live only for `live: true`", () => {
    expect(readSwitch("# c\nlive: true\n")).toBe(true);
    expect(readSwitch("live: true # on since 25 Oct")).toBe(true);
    for (const off of ["live: false", "live: \"true\"", "live: yes", "", "# live: true", "nope"]) expect(readSwitch(off)).toBe(false);
  });
  it("the committed switch file parses", () => {
    const text = readFileSync(join(import.meta.dirname, "..", "marketing/poster-live.yaml"), "utf8");
    expect(text).toMatch(/^live: (true|false)$/m);
  });
});

describe("overlayAccount", () => {
  it("marks items found on the account as posted at the post's time, and leaves the input alone", () => {
    const q = [item("a", "2026-10-25"), item("b", "2026-10-26")];
    const post: FeedPost = { uri: "at://x/1", url: "https://bsky.app/profile/x/post/1", text: "edited", embedUri: q[0].link, createdAt: "2026-10-25T13:47:02Z" };
    const out = overlayAccount(q, [post]);
    expect(out[0]).toMatchObject({ posted_url: post.url, posted_at: post.createdAt });
    expect(out[1].posted_url).toBeNull();
    expect(q[0].posted_url).toBeNull();
    expect(selectNext(out, "2026-10-25")).toMatchObject({ kind: "already-today" });
    expect(selectNext(out, "2026-10-26")).toMatchObject({ kind: "item", item: { id: "b" } });
  });
});

describe("runWorkerPoster", () => {
  const queue = [item("a", "2026-10-25"), item("b", "2026-10-26"), item("c", "2026-10-28")];

  it("switch off: no Bluesky login at all, nothing posted", async () => {
    const w = world({ queue, live: "false" });
    expect(await w.run("2026-10-25T13:47:00Z")).toMatchObject({ outcome: "off" });
    expect(w.logins()).toBe(0);
    expect(w.account).toHaveLength(0);
  });

  it("a switch file that cannot be fetched fails loudly rather than guessing", async () => {
    const w = world({ queue, live: null });
    await expect(w.run("2026-10-25T13:47:00Z")).rejects.toThrow(/HTTP 404/);
    expect(w.account).toHaveLength(0);
  });

  it("live without the app password throws, as the workflow does", async () => {
    const w = world({ queue });
    await expect(runWorkerPoster({ env: { ...ENV, BLUESKY_APP_PASSWORD: "" }, now: new Date("2026-10-25T13:47:00Z"), fetch: w.fetch, log: () => {} })).rejects.toThrow(/POSTER_LIVE is true but/);
    expect(w.logins()).toBe(0);
    expect(w.account).toHaveLength(0);
  });

  it("posts at 13:47, the 14:17 and 14:47 retries post nothing more, and the queue is never written", async () => {
    const w = world({ queue });
    expect(await w.run("2026-10-25T13:47:00Z")).toMatchObject({ outcome: "posted", item: { id: "a" } });
    expect(await w.run("2026-10-25T14:17:00Z")).toMatchObject({ outcome: "already-posted-today", item: { id: "a" } });
    expect(await w.run("2026-10-25T14:47:00Z")).toMatchObject({ outcome: "already-posted-today" });
    expect(w.account.map((p) => p.embedUri)).toEqual([queue[0].link]);
    expect(w.fetched.some((u) => u === `${RAW}/assets/cards/demo/a.png`)).toBe(true);
  });

  it("the next days, with no write-back from GitHub at all, posts the next item each day, never a repeat", async () => {
    const w = world({ queue });
    await w.run("2026-10-25T13:47:00Z");
    expect(await w.run("2026-10-26T13:47:00Z")).toMatchObject({ outcome: "posted", item: { id: "b" } });
    expect(await w.run("2026-10-27T13:47:00Z")).toMatchObject({ outcome: "nothing-due" });
    expect(await w.run("2026-10-28T13:47:00Z")).toMatchObject({ outcome: "posted", item: { id: "c" } });
    expect(w.account.map((p) => p.embedUri)).toEqual(queue.map((i) => i.link));
  });

  it("does not post before 13:00 UTC", async () => {
    const w = world({ queue });
    expect(await w.run("2026-10-25T12:59:00Z")).toMatchObject({ outcome: "too-early" });
    expect(w.account).toHaveLength(0);
  });

  it("refuses a deep link that no longer opens on its paragraph, posting nothing", async () => {
    const w = world({ queue, brokenLinks: ["para-a"] });
    await expect(w.run("2026-10-25T13:47:00Z")).rejects.toThrow(/does not open on paragraph para-a/);
    expect(w.account).toHaveLength(0);
  });

  it("a GitHub run after it, on the unrecorded queue, records the Worker's post with today's posted_at and posts nothing", async () => {
    const w = world({ queue });
    await w.run("2026-10-25T13:47:00Z");
    const published: PosterItem[] = [];
    const gh: PosterClient = { recentPosts: async () => [...w.account], publish: async (i) => (published.push(i), Promise.reject(new Error("must not post"))) };
    const r = await runPoster({ queue, today: "2026-10-25", mode: { live: true, hasCredentials: true, why: "" }, client: gh, siteOrigin: ORIGIN, notBefore: "15:00", now: () => new Date("2026-10-25T17:30:00Z") });
    expect(r).toMatchObject({ outcome: "reconciled", changed: true });
    expect(r.queue[0]).toMatchObject({ posted_url: w.account[0].url, posted_at: "2026-10-25T13:47:00.000Z" });
    expect(published).toHaveLength(0);
  });
});

describe("the Worker's and the workflow's schedules", () => {
  const root = join(import.meta.dirname, "..");
  const toml = readFileSync(join(root, "workers/poster/wrangler.toml"), "utf8");
  const workerCrons = JSON.parse(/^crons = (\[.*\])$/m.exec(toml)![1]) as string[];
  const yml = readFileSync(join(root, ".github/workflows/post-next.yml"), "utf8");

  it("the Worker runs from 13:00 and finishes its retries before 15:00 UTC", () => {
    expect(workerCrons.length).toBeGreaterThanOrEqual(2);
    for (const c of workerCrons) {
      const [m, h] = c.split(" ").map(Number);
      expect(h * 60 + m).toBeGreaterThanOrEqual(13 * 60);
      expect(h * 60 + m).toBeLessThan(15 * 60);
    }
  });

  it("a scheduled GitHub run does not post before 15:00 UTC, and the workflow reads the switch file, not a variable", () => {
    expect(yml).toContain("POSTER_NOT_BEFORE: ${{ github.event_name == 'schedule' && '15:00' || '13:00' }}");
    expect(yml).toContain("|| 'file' }}");
    expect(yml).not.toContain("vars.POSTER_LIVE");
  });
});
