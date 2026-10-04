import { afterEach, describe, expect, it, vi } from "vitest";
import { app, cacheKeyFor } from "../src/index";

/** A Cache API stand-in: a Map keyed on the request URL. */
function fakeCaches() {
  const store = new Map<string, Response>();
  const stub = {
    default: {
      match: async (req: Request) => store.get(req.url)?.clone(),
      put: async (req: Request, res: Response) => void store.set(req.url, res),
    },
  };
  return { store, stub };
}

const URL_P = "http://localhost/reports/jack-smith-vol1/full?p=anything";

describe("cacheKeyFor", () => {
  it("differs by deploy and keeps the rest of the URL", () => {
    const a = cacheKeyFor(URL_P, "deploy-1");
    const b = cacheKeyFor(URL_P, "deploy-2");
    expect(a.url).not.toBe(b.url);
    expect(a.url).toContain("p=anything");
    expect(a.url).toBe(cacheKeyFor(URL_P, "deploy-1").url);
  });
});

describe("the ?p=/?h= edge cache (reportsthatmatter-h3iu)", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function get(url: string, env: object, waits: Promise<unknown>[]) {
    const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException() {} };
    return app.fetch(new Request(url), env, ctx as any);
  }

  it("does not serve one deploy's cached page to the next", async () => {
    const { store, stub } = fakeCaches();
    vi.stubGlobal("caches", stub);
    const waits: Promise<unknown>[] = [];

    const first = await get(URL_P, { CF_VERSION_METADATA: { id: "deploy-1" } }, waits);
    expect(first.status).toBe(200);
    await Promise.all(waits);
    expect(store.size).toBe(1);

    // Same deploy: a hit, nothing new stored.
    await get(URL_P, { CF_VERSION_METADATA: { id: "deploy-1" } }, waits);
    await Promise.all(waits);
    expect(store.size).toBe(1);

    // A new deploy misses, builds, and stores under its own key.
    const second = await get(URL_P, { CF_VERSION_METADATA: { id: "deploy-2" } }, waits);
    await Promise.all(waits);
    expect(second.status).toBe(200);
    expect(store.size).toBe(2);
  });

  it("does not cache at all without a deploy id", async () => {
    const { store, stub } = fakeCaches();
    vi.stubGlobal("caches", stub);
    const waits: Promise<unknown>[] = [];
    const res = await get(URL_P, {}, waits);
    expect(res.status).toBe(200);
    await Promise.all(waits);
    expect(store.size).toBe(0);
  });
});
