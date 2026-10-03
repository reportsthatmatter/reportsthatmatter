import { execFile, execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { buildQueue, type QueueItem, type ResolvedPost } from "../src/lib/posts";
import {
  cardMeta,
  decideMode,
  findPosted,
  runPoster,
  selectNext,
  validateItem,
  type FeedPost,
  type Mode,
  type PosterClient,
  type PosterItem,
} from "../src/lib/poster";

const ORIGIN = "https://reportsthatmatter.org";

function item(id: string, scheduled: string, extra: Partial<PosterItem> = {}): PosterItem {
  return {
    id,
    report: "demo",
    paragraph: id,
    quote: `quote ${id}`,
    text: `“quote ${id}”\n\n— The Demo Report, p. 7`,
    link: `${ORIGIN}/reports/demo?p=${id}&src=bsky`,
    card: "assets/cards/demo/default.png",
    scheduled,
    posted_url: null,
    ...extra,
  };
}

const DRY: Mode = { live: false, hasCredentials: false, why: "" };
const DRY_WITH_CREDS: Mode = { live: false, hasCredentials: true, why: "" };
const LIVE: Mode = { live: true, hasCredentials: true, why: "" };

/** A fake account: remembers what was posted and what is already on it. */
function fakeClient(onAccount: FeedPost[] = []) {
  const published: PosterItem[] = [];
  let feedReads = 0;
  const client: PosterClient = {
    async recentPosts() {
      feedReads++;
      return onAccount;
    },
    async publish(i) {
      published.push(i);
      return { uri: `at://did:plc:x/app.bsky.feed.post/${published.length}`, url: `https://bsky.app/profile/h/post/${published.length}`, text: i.text, embedUri: i.link, createdAt: "2026-10-14T14:00:00.000Z" };
    },
  };
  return { client, published, feedReads: () => feedReads };
}

describe("selectNext: queue selection", () => {
  it("takes the first unposted item whose date has arrived", () => {
    const q = [item("a", "2026-10-14", { posted_url: "https://bsky.app/x/1", posted_at: "2026-10-14T14:00:00Z" }), item("b", "2026-10-15"), item("c", "2026-10-16")];
    const sel = selectNext(q, "2026-10-15");
    expect(sel).toMatchObject({ kind: "item", item: { id: "b" } });
  });

  it("never takes an item scheduled in the future", () => {
    const sel = selectNext([item("a", "2026-10-14")], "2026-10-13");
    expect(sel).toEqual({ kind: "none", reason: "nothing due until 2026-10-14" });
  });

  it("makes up a missed day one item at a time, oldest first", () => {
    const q = [item("late", "2026-10-14"), item("later", "2026-10-15"), item("today", "2026-10-17")];
    expect(selectNext(q, "2026-10-17")).toMatchObject({ kind: "item", item: { id: "late" } });
  });

  it("orders by scheduled date, queue order breaking ties", () => {
    const q = [item("z", "2026-10-15"), item("a", "2026-10-14"), item("b", "2026-10-14")];
    expect(selectNext(q, "2026-10-20")).toMatchObject({ item: { id: "a" } });
  });

  it("posts at most one item per UTC day", () => {
    const q = [item("a", "2026-10-14", { posted_url: "https://bsky.app/x/1", posted_at: "2026-10-15T01:00:00Z" }), item("b", "2026-10-14")];
    expect(selectNext(q, "2026-10-15").kind).toBe("already-today");
    expect(selectNext(q, "2026-10-16").kind).toBe("item");
  });

  it("reports an empty or fully posted queue", () => {
    expect(selectNext([], "2026-10-14")).toMatchObject({ kind: "none" });
    expect(selectNext([item("a", "2026-10-01", { posted_url: "u", posted_at: "2026-10-01T00:00:00Z" })], "2026-10-14")).toMatchObject({ kind: "none", reason: expect.stringContaining("fully posted") });
  });
});

describe("idempotency", () => {
  it("never selects an item that has a posted_url, however old", () => {
    const q = [item("a", "2026-01-01", { posted_url: "https://bsky.app/x/1" }), item("b", "2026-10-14")];
    expect(selectNext(q, "2026-10-14")).toMatchObject({ item: { id: "b" } });
  });

  it("finds an item on the account by its deep link, or by its exact text", () => {
    const a = item("a", "2026-10-14");
    const byLink: FeedPost = { uri: "u", url: "https://bsky.app/x/1", text: "something else", embedUri: a.link, createdAt: "" };
    const byText: FeedPost = { uri: "u", url: "https://bsky.app/x/2", text: `${a.text}\n`, embedUri: null, createdAt: "" };
    const other: FeedPost = { uri: "u", url: "https://bsky.app/x/3", text: "unrelated", embedUri: `${ORIGIN}/reports/demo?p=zzz&src=bsky`, createdAt: "" };
    expect(findPosted(a, [other, byLink])?.url).toBe("https://bsky.app/x/1");
    expect(findPosted(a, [other, byText])?.url).toBe("https://bsky.app/x/2");
    expect(findPosted(a, [other])).toBeNull();
  });

  it("does not post an item the account already has: it records the URL instead (the lost-commit case)", async () => {
    const a = item("a", "2026-10-14");
    const onAccount: FeedPost = { uri: "u", url: "https://bsky.app/profile/h/post/earlier", text: a.text, embedUri: a.link, createdAt: "2026-10-14T14:00:03.000Z" };
    const { client, published } = fakeClient([onAccount]);
    const r = await runPoster({ queue: [a, item("b", "2026-10-15")], today: "2026-10-14", mode: LIVE, client, siteOrigin: ORIGIN });
    expect(published).toHaveLength(0);
    expect(r.outcome).toBe("reconciled");
    expect(r.changed).toBe(true);
    expect(r.queue[0]).toMatchObject({ posted_url: "https://bsky.app/profile/h/post/earlier", posted_at: "2026-10-14T14:00:03.000Z" });
    expect(r.queue[1].posted_url).toBeNull();
  });

  it("running twice on one day posts once", async () => {
    const { client, published } = fakeClient();
    let queue: PosterItem[] = [item("a", "2026-10-14"), item("b", "2026-10-15")];
    const first = await runPoster({ queue, today: "2026-10-14", mode: LIVE, client, siteOrigin: ORIGIN });
    queue = first.queue;
    const second = await runPoster({ queue, today: "2026-10-14", mode: LIVE, client, siteOrigin: ORIGIN });
    expect(first.outcome).toBe("posted");
    expect(second.outcome).toBe("already-posted-today");
    expect(published.map((p) => p.id)).toEqual(["a"]);
  });

  it("writes posted_url and posted_at on the posted item only, and does not mutate its input", async () => {
    const { client } = fakeClient();
    const input: PosterItem[] = [item("a", "2026-10-14"), item("b", "2026-10-15")];
    const before = JSON.stringify(input);
    const r = await runPoster({ queue: input, today: "2026-10-14", mode: LIVE, client, siteOrigin: ORIGIN });
    expect(JSON.stringify(input)).toBe(before);
    expect(r.queue[0]).toMatchObject({ posted_url: "https://bsky.app/profile/h/post/1", posted_at: "2026-10-14T14:00:00.000Z" });
    expect(r.queue[1]).toEqual(input[1]);
  });

  it("a failed publish writes nothing back and throws", async () => {
    const client: PosterClient = {
      recentPosts: async () => [],
      publish: async () => {
        throw new Error("InvalidToken");
      },
    };
    await expect(runPoster({ queue: [item("a", "2026-10-14")], today: "2026-10-14", mode: LIVE, client, siteOrigin: ORIGIN })).rejects.toThrow("InvalidToken");
  });

  it("a failing feed read stops before posting (no blind post)", async () => {
    const published: string[] = [];
    const client: PosterClient = {
      recentPosts: async () => {
        throw new Error("503");
      },
      publish: async (i) => {
        published.push(i.id);
        throw new Error("should not be called");
      },
    };
    await expect(runPoster({ queue: [item("a", "2026-10-14")], today: "2026-10-14", mode: LIVE, client, siteOrigin: ORIGIN })).rejects.toThrow("503");
    expect(published).toEqual([]);
  });

  it("the poster's write-back survives a later `pnpm posts` run (posted_url and posted_at kept, dates unmoved)", () => {
    const posted = item("a", "2026-10-14", { posted_url: "https://bsky.app/x/1", posted_at: "2026-10-14T14:00:00Z" });
    const fresh: ResolvedPost = { id: "n", report: "demo", paragraph: "n", quote: "q", text: "t", link: "l", card: "c", cardIsDefault: true };
    const resolved = [{ ...fresh, id: "a" }, fresh];
    const { queue } = buildQueue({ resolved, existing: [posted as QueueItem], today: "2026-10-20", reportOrder: ["demo"] });
    expect(queue[0]).toEqual(posted);
    expect(queue[1].scheduled).toBe("2026-10-15");
  });
});

describe("dry run", () => {
  it("posts nothing and changes nothing, with or without credentials", async () => {
    for (const [mode, withClient] of [[DRY, false], [DRY_WITH_CREDS, true]] as const) {
      const { client, published } = fakeClient();
      const q = [item("a", "2026-10-14")];
      const r = await runPoster({ queue: q, today: "2026-10-14", mode, client: withClient ? client : null, siteOrigin: ORIGIN });
      expect(r).toMatchObject({ outcome: "dry-run", changed: false, item: { id: "a" }, wouldReconcile: null });
      expect(r.queue).toEqual(q);
      expect(published).toHaveLength(0);
    }
  });

  it("makes no network request without credentials, and reads (never writes) the feed with them", async () => {
    const withCreds = fakeClient();
    await runPoster({ queue: [item("a", "2026-10-14")], today: "2026-10-14", mode: DRY_WITH_CREDS, client: withCreds.client, siteOrigin: ORIGIN });
    expect(withCreds.feedReads()).toBe(1);
    expect(withCreds.published).toHaveLength(0);
  });

  it("reports that a live run would only reconcile when the account already has the item", async () => {
    const a = item("a", "2026-10-14");
    const { client, published } = fakeClient([{ uri: "u", url: "https://bsky.app/x/9", text: a.text, embedUri: a.link, createdAt: "" }]);
    const r = await runPoster({ queue: [a], today: "2026-10-14", mode: DRY_WITH_CREDS, client, siteOrigin: ORIGIN });
    expect(r).toMatchObject({ outcome: "dry-run", changed: false, wouldReconcile: { url: "https://bsky.app/x/9" } });
    expect(published).toHaveLength(0);
  });

  it("live mode without a client is an error, not a silent dry run", async () => {
    await expect(runPoster({ queue: [item("a", "2026-10-14")], today: "2026-10-14", mode: LIVE, client: null, siteOrigin: ORIGIN })).rejects.toThrow("client");
  });
});

describe("decideMode: safe before the secrets exist", () => {
  it("no secrets and no variable is a quiet dry run", () => {
    expect(decideMode({})).toMatchObject({ live: false, hasCredentials: false });
  });
  it("secrets without the variable stay a dry run", () => {
    expect(decideMode({ BLUESKY_HANDLE: "h", BLUESKY_APP_PASSWORD: "p" })).toMatchObject({ live: false, hasCredentials: true });
    expect(decideMode({ BLUESKY_HANDLE: "h", BLUESKY_APP_PASSWORD: "p", POSTER_LIVE: "false" }).live).toBe(false);
    expect(decideMode({ BLUESKY_HANDLE: "h", BLUESKY_APP_PASSWORD: "p", POSTER_LIVE: "yes" }).live).toBe(false);
  });
  it("empty-string secrets (an unset GitHub secret expands to this) count as absent", () => {
    expect(decideMode({ BLUESKY_HANDLE: "", BLUESKY_APP_PASSWORD: "", POSTER_LIVE: "" })).toMatchObject({ live: false, hasCredentials: false });
  });
  it("live needs the variable and both secrets", () => {
    expect(decideMode({ BLUESKY_HANDLE: "h", BLUESKY_APP_PASSWORD: "p", POSTER_LIVE: "true" }).live).toBe(true);
    expect(() => decideMode({ POSTER_LIVE: "true" })).toThrow("POSTER_LIVE is true");
    expect(() => decideMode({ POSTER_LIVE: "true", BLUESKY_HANDLE: "h" })).toThrow("BLUESKY_APP_PASSWORD");
  });
});

describe("validateItem and cardMeta", () => {
  it("refuses an over-long, off-site or untagged item before any network call", () => {
    expect(() => validateItem(item("a", "2026-10-14", { text: "x".repeat(301) }), ORIGIN)).toThrow("graphemes");
    expect(() => validateItem(item("a", "2026-10-14", { link: "https://evil.example/?src=bsky" }), ORIGIN)).toThrow("not on");
    expect(() => validateItem(item("a", "2026-10-14", { link: `${ORIGIN}/reports/demo?p=a` }), ORIGIN)).toThrow("src=bsky");
    expect(() => validateItem(item("a", "2026-10-14"), ORIGIN)).not.toThrow();
  });
  it("takes the card title and page from the source line, adding no commentary", () => {
    expect(cardMeta(item("a", "2026-10-14"))).toEqual({ title: "The Demo Report", description: "Page 7. Read the passage in context." });
  });
});

describe("buildQueue: --drop-stale and --start", () => {
  const r = (id: string): ResolvedPost => ({ id, report: "demo", paragraph: id, quote: id, text: id, link: id, card: "c", cardIsDefault: true });
  it("drops only not-yet-posted items that no longer resolve", () => {
    const existing = [item("gone", "2026-10-14"), item("kept", "2026-10-15"), item("old", "2026-10-01", { posted_url: "u" })] as QueueItem[];
    const { queue } = buildQueue({ resolved: [r("kept")], existing, today: "2026-10-03", reportOrder: ["demo"], dropStale: true });
    expect(queue.map((i) => i.id)).toEqual(["kept", "old"]);
  });
  it("re-dates unposted items from a start date and leaves posted ones alone", () => {
    const existing = [item("old", "2026-10-01", { posted_url: "u" }), item("a", "2026-09-29"), item("b", "2026-09-30")] as QueueItem[];
    const { queue } = buildQueue({ resolved: [r("old"), r("a"), r("b"), r("c")], existing, today: "2026-10-03", reportOrder: ["demo"], restartFrom: "2026-10-14" });
    expect(queue.map((i) => [i.id, i.scheduled])).toEqual([["old", "2026-10-01"], ["a", "2026-10-14"], ["b", "2026-10-15"], ["c", "2026-10-16"]]);
  });
});

describe("scripts/post-next.mjs end to end, offline", () => {
  const root = join(import.meta.dirname, "..");
  function run(queue: PosterItem[], env: Record<string, string>) {
    const path = join(mkdtempSync(join(tmpdir(), "poster-")), "queue.yaml");
    writeFileSync(path, stringify({ items: queue }));
    const cleanEnv = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", POSTER_QUEUE: path, ...env };
    let status = 0;
    let out = "";
    try {
      out = execFileSync("node_modules/.bin/tsx", ["scripts/post-next.mjs"], { cwd: root, env: cleanEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e: any) {
      status = e.status ?? 1;
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    return { status, out, after: parse(readFileSync(path, "utf8")).items as PosterItem[] };
  }
  const real = (id: string, scheduled: string) => item(id, scheduled, { card: "assets/cards/jack-smith-vol1/default.png" });

  it("with no secrets and no variable: exits 0, says dry run, leaves the queue untouched", () => {
    const q = [real("a", "2026-10-14")];
    const { status, out, after } = run(q, { POSTER_TODAY: "2026-10-14" });
    expect(status).toBe(0);
    expect(out).toContain("DRY RUN: would post a");
    expect(after).toEqual(q);
  });

  it("with POSTER_LIVE=true but no secrets: fails loudly and posts nothing", () => {
    const { status, out } = run([real("a", "2026-10-14")], { POSTER_TODAY: "2026-10-14", POSTER_LIVE: "true" });
    expect(status).toBe(1);
    expect(out).toContain("POSTER FAILED");
  });

  it("a malformed queue item fails loudly", () => {
    const { status, out } = run([item("a", "2026-10-14", { text: "x".repeat(400) })], { POSTER_TODAY: "2026-10-14" });
    expect(status).toBe(1);
    expect(out).toContain("not postable");
  });

  it("nothing due is a clean exit 0", () => {
    const { status, out } = run([real("a", "2026-10-14")], { POSTER_TODAY: "2026-10-13" });
    expect(status).toBe(0);
    expect(out).toContain("nothing due until 2026-10-14");
  });
});

/** The Bluesky adapter in scripts/post-next.mjs against a local stand-in for the PDS: login, feed read, blob upload, createRecord. */
describe("scripts/post-next.mjs live, against a local fake PDS", () => {
  const root = join(import.meta.dirname, "..");
  const DID = "did:plc:fakeaccount";
  let server: Server;
  let base = "";
  let calls: { path: string; body: any }[] = [];
  let feed: any[] = [];

  async function start() {
    calls = [];
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks);
        const path = (req.url ?? "").split("?")[0];
        const type = req.headers["content-type"] ?? "";
        calls.push({ path, body: type.includes("json") && raw.length ? JSON.parse(raw.toString()) : { bytes: raw.length } });
        const send = (o: unknown) => {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(o));
        };
        if (path.endsWith("createSession")) return send({ accessJwt: "a", refreshJwt: "r", handle: "rtm.test", did: DID, active: true });
        if (path.endsWith("getAuthorFeed")) return send({ feed });
        if (path.endsWith("uploadBlob")) return send({ blob: { $type: "blob", ref: { $link: "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku" }, mimeType: "image/png", size: raw.length } });
        if (path.endsWith("createRecord")) return send({ uri: `at://${DID}/app.bsky.feed.post/3kfake`, cid: "bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku" });
        res.statusCode = 404;
        send({ error: "NotFound" });
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  }

  async function run(queue: PosterItem[], env: Record<string, string>) {
    const path = join(mkdtempSync(join(tmpdir(), "poster-")), "queue.yaml");
    writeFileSync(path, stringify({ items: queue }));
    let status = 0;
    let out = "";
    try {
      const r = await promisify(execFile)("node_modules/.bin/tsx", ["scripts/post-next.mjs"], {
        cwd: root,
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", POSTER_QUEUE: path, POSTER_TODAY: "2026-10-14", POSTER_SERVICE: base, BLUESKY_HANDLE: "rtm.test", BLUESKY_APP_PASSWORD: "app-pass", ...env },
      });
      out = r.stdout;
    } catch (e: any) {
      status = e.code ?? 1;
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    return { status, out, after: parse(readFileSync(path, "utf8")).items as PosterItem[] };
  }
  const real = (id: string) => item(id, "2026-10-14", { card: "assets/cards/jack-smith-vol1/default.png" });
  /** A feed entry with every field the real getAuthorFeed lexicon requires. */
  const entry = (did: string, rkey: string, text: string, link: string | null, extra: object = {}) => ({
    post: {
      uri: `at://${did}/app.bsky.feed.post/${rkey}`,
      cid: "bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
      author: { did, handle: "x.test" },
      indexedAt: "2026-10-14T14:00:02.000Z",
      record: { $type: "app.bsky.feed.post", text, createdAt: "2026-10-14T14:00:01.000Z" },
      ...(link ? { embed: { $type: "app.bsky.embed.external#view", external: { uri: link, title: "t", description: "d" } } } : {}),
    },
    ...extra,
  });
  const writes = () => calls.filter((c) => c.path.endsWith("createRecord"));

  it("posts the item with a link card carrying the deep link and the thumbnail, and writes the URL back", async () => {
    feed = [];
    await start();
    try {
      const q = [real("a"), real("b")];
      const { status, out, after } = await run(q, { POSTER_LIVE: "true" });
      expect(out).toContain("Posted a");
      expect(status).toBe(0);
      expect(writes()).toHaveLength(1);
      const rec = writes()[0].body.record;
      expect(rec.text).toBe(q[0].text);
      expect(rec.embed).toMatchObject({
        $type: "app.bsky.embed.external",
        external: { uri: q[0].link, title: "The Demo Report", description: "Page 7. Read the passage in context." },
      });
      expect(rec.embed.external.thumb.ref.$link).toBe("bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku");
      expect(calls.find((c) => c.path.endsWith("uploadBlob"))!.body.bytes).toBeGreaterThan(1000);
      expect(after[0]).toMatchObject({ posted_url: "https://bsky.app/profile/rtm.test/post/3kfake" });
      expect(after[0].posted_at).toMatch(/^\d{4}-/);
      expect(after[1].posted_url).toBeNull();
    } finally {
      server.close();
    }
  });

  it("does not post when the account's feed already has the deep link, and records that post instead", async () => {
    const a = real("a");
    feed = [entry(DID, "3kold", "edited", a.link)];
    await start();
    try {
      const { status, out, after } = await run([a], { POSTER_LIVE: "true" });
      expect(status).toBe(0);
      expect(out).toContain("already on the account");
      expect(writes()).toHaveLength(0);
      expect(after[0].posted_url).toBe("https://bsky.app/profile/rtm.test/post/3kold");
    } finally {
      server.close();
    }
  });

  it("a repost of someone else's post with the same link is not ours: it is ignored", async () => {
    const a = real("a");
    feed = [entry("did:plc:other", "1", a.text, a.link, { reason: { $type: "app.bsky.feed.defs#reasonRepost", by: { did: DID, handle: "rtm.test" }, indexedAt: "2026-10-14T14:00:02.000Z" } })];
    await start();
    try {
      const { status } = await run([a], { POSTER_LIVE: "true" });
      expect(status).toBe(0);
      expect(writes()).toHaveLength(1);
    } finally {
      server.close();
    }
  });

  it("with credentials but no POSTER_LIVE: logs in and reads the feed, writes nothing", async () => {
    feed = [];
    await start();
    try {
      const q = [real("a")];
      const { status, out, after } = await run(q, {});
      expect(status).toBe(0);
      expect(out).toContain("DRY RUN: would post a");
      expect(calls.some((c) => c.path.endsWith("getAuthorFeed"))).toBe(true);
      expect(writes()).toHaveLength(0);
      expect(calls.some((c) => c.path.endsWith("uploadBlob"))).toBe(false);
      expect(after).toEqual(q);
    } finally {
      server.close();
    }
  });

  it("a rejected login fails loudly and leaves the queue alone", async () => {
    await start();
    server.removeAllListeners("request");
    server.on("request", (_req, res) => {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "AuthenticationRequired", message: "Invalid identifier or password" }));
    });
    try {
      const q = [real("a")];
      const { status, out, after } = await run(q, { POSTER_LIVE: "true" });
      expect(status).toBe(1);
      expect(out).toContain("POSTER FAILED");
      expect(after).toEqual(q);
    } finally {
      server.close();
    }
  });
});
