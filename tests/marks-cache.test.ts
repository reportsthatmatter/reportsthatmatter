import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";
import { cachedMarkCounts, evictMarkCounts, marksTtl, MIN_TTL, MAX_TTL, type CacheLike } from "../src/lib/marks-cache";
import type { MarkCount } from "../src/lib/marks";
import { createFakeD1 } from "./support/fake-d1";

function fakeCache() {
  const store = new Map<string, Response>();
  const cache: CacheLike & { store: Map<string, Response> } = {
    store,
    async match(key) {
      return store.get(key.url)?.clone();
    },
    async put(key, response) {
      store.set(key.url, response);
    },
    async delete(key) {
      return store.delete(key.url);
    },
  };
  return cache;
}

const row = (paragraph: string): MarkCount => ({ paragraph, exact: "x", prefix: "", suffix: "", page: 1, readers: 1, editor: false });

describe("cachedMarkCounts", () => {
  it("computes once, then serves the cached counts without calling compute", async () => {
    const cache = fakeCache();
    const compute = vi.fn(async () => ({ counts: [row("a")], rowsRead: 0 }));
    const first = await cachedMarkCounts(cache, "https://x.org", "r1", compute);
    const second = await cachedMarkCounts(cache, "https://x.org", "r1", compute);
    expect(first).toEqual([row("a")]);
    expect(second).toEqual([row("a")]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("scales the TTL with what the read cost, within bounds", () => {
    expect(marksTtl(0)).toBe(MIN_TTL);
    expect(marksTtl(83)).toBe(MIN_TTL);
    expect(marksTtl(2_000)).toBeGreaterThan(MIN_TTL);
    expect(marksTtl(2_000)).toBeLessThan(MAX_TTL);
    expect(marksTtl(1_000_000)).toBe(MAX_TTL);
    // reads a day per location stay under the budget wherever the TTL is not clamped
    expect((86_400 / marksTtl(2_000)) * 2_000).toBeLessThanOrEqual(150_000);
  });

  it("stores the TTL as max-age", async () => {
    const cache = fakeCache();
    await cachedMarkCounts(cache, "https://x.org", "r1", async () => ({ counts: [], rowsRead: 2_000 }));
    expect([...cache.store.values()][0].headers.get("cache-control")).toBe(`public, max-age=${marksTtl(2_000)}`);
  });

  it("stores with the TTL as max-age, per report", async () => {
    const cache = fakeCache();
    await cachedMarkCounts(cache, "https://x.org", "r1", async () => ({ counts: [], rowsRead: 0 }));
    const stored = [...cache.store.values()][0];
    expect(stored.headers.get("cache-control")).toBe(`public, max-age=${MIN_TTL}`);
    const compute = vi.fn(async () => ({ counts: [row("b")], rowsRead: 0 }));
    await cachedMarkCounts(cache, "https://x.org", "r2", compute);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("never caches a failed read", async () => {
    const cache = fakeCache();
    await expect(
      cachedMarkCounts(cache, "https://x.org", "r1", async () => {
        throw new Error("D1 down");
      })
    ).rejects.toThrow();
    expect(cache.store.size).toBe(0);
  });

  it("evicting makes the next read compute again", async () => {
    const cache = fakeCache();
    const compute = vi.fn(async () => ({ counts: [row("a")], rowsRead: 0 }));
    await cachedMarkCounts(cache, "https://x.org", "r1", compute);
    await evictMarkCounts(cache, "https://x.org", "r1");
    await cachedMarkCounts(cache, "https://x.org", "r1", compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("computes every time where there is no Cache API", async () => {
    const compute = vi.fn(async () => ({ counts: [], rowsRead: 0 }));
    await cachedMarkCounts(undefined, "https://x.org", "r1", compute);
    await cachedMarkCounts(undefined, "https://x.org", "r1", compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

describe("the routes through the cache", () => {
  afterEach(() => vi.unstubAllGlobals());

  const event = { report: "jack-smith-vol1", section: "s", paragraph: "p1", exact: "some words", prefix: "", suffix: "", page: 3, kind: "share" };
  const post = (DB: unknown, actor: string) =>
    app.request(
      "http://localhost/api/mark",
      { method: "POST", body: JSON.stringify(event), headers: { "content-type": "application/json", "cf-connecting-ip": actor } },
      { DB }
    );

  it("serves /marks from the cache until the reader's own mark evicts it", async () => {
    const cache = fakeCache();
    vi.stubGlobal("caches", { default: cache });
    const DB = createFakeD1();
    const prepare = vi.spyOn(DB, "prepare");
    const marks = async () => (await app.request("http://localhost/reports/jack-smith-vol1/marks", {}, { DB })).json();
    const groupReads = () => prepare.mock.calls.filter(([sql]) => String(sql).includes("GROUP BY")).length;

    expect(await marks()).toEqual([]);
    expect(await marks()).toEqual([]);
    expect(await marks()).toEqual([]);
    expect(groupReads()).toBe(1); // three views, one read of the marks table

    await post(DB, "1.1.1.1"); // a reader marks a passage: their location drops the cached counts
    const after = (await marks()) as MarkCount[];
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ paragraph: "p1", readers: 1 });
    expect(groupReads()).toBe(2);
    await marks();
    expect(groupReads()).toBe(2);
  });

  it("does not cache a failed read", async () => {
    const cache = fakeCache();
    vi.stubGlobal("caches", { default: cache });
    const DB = createFakeD1();
    vi.spyOn(DB, "prepare").mockImplementation(() => {
      throw new Error("D1 down");
    });
    const res = await app.request("http://localhost/reports/jack-smith-vol1/marks", {}, { DB });
    expect(await res.json()).toEqual([]);
    expect(cache.store.size).toBe(0);
  });
});
