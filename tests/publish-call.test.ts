import { describe, expect, it, vi } from "vitest";
import { makePublishCall, RETRY_DELAYS_MS } from "../scripts/lib/publish-call";

class Exit extends Error {}

function harness(responses: Array<{ status: number; body: string }>) {
  const queue = [...responses];
  const fetchMock = vi.fn(async () => {
    const r = queue.shift() ?? responses.at(-1)!;
    return new Response(r.body, { status: r.status });
  });
  const sleeps: number[] = [];
  const lines: string[] = [];
  const call = makePublishCall({
    base: "https://x.test",
    token: "t",
    rerun: "pnpm publish-report demo --base https://x.test",
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async (ms) => void sleeps.push(ms),
    log: (l) => void lines.push(l),
    fail: () => {
      throw new Exit("exit 1");
    },
  });
  return { call, fetchMock, sleeps, lines };
}

describe("publish-report call (reportsthatmatter-moej)", () => {
  it("retries a 500 and succeeds on the next 200", async () => {
    const h = harness([{ status: 500, body: "Internal Server Error" }, { status: 200, body: '{"published":"demo"}' }]);
    await expect(h.call("/internal/publish/demo/commit", { hash: "h" })).resolves.toEqual({ published: "demo" });
    expect(h.fetchMock).toHaveBeenCalledTimes(2);
    expect(h.sleeps).toEqual([2000]);
    expect(h.lines).toEqual(["retry 1/3 after 500 /internal/publish/demo/commit (in 2s)"]);
  });

  it("gives up after three retries (four calls), prints the body and the command to re-run, and exits 1", async () => {
    const h = harness([{ status: 500, body: "Internal Server Error" }]);
    await expect(h.call("/internal/publish/demo/commit", { hash: "h" })).rejects.toThrow(Exit);
    expect(h.fetchMock).toHaveBeenCalledTimes(4);
    expect(h.sleeps).toEqual(RETRY_DELAYS_MS);
    const out = h.lines.join("\n");
    expect(out).toContain("500 /internal/publish/demo/commit");
    expect(out).toContain("Internal Server Error");
    expect(out).toContain("pnpm publish-report demo --base https://x.test");
    expect(out).toContain("--preflight");
  });

  it("does not retry a 4xx", async () => {
    const h = harness([{ status: 403, body: '{"error":"forbidden"}' }]);
    await expect(h.call("/internal/publish/demo/objects", { hash: "h" })).rejects.toThrow(Exit);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(h.sleeps).toEqual([]);
  });

  it("does not retry a D1 quota error, even as a 5xx", async () => {
    const h = harness([{ status: 500, body: '{"error":"D1_ERROR: Exceeded daily row writes quota"}' }]);
    await expect(h.call("/internal/publish/demo/commit", { hash: "h" })).rejects.toThrow(Exit);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a GET's JSON unchanged", async () => {
    const h = harness([{ status: 200, body: '{"version":"abc"}' }]);
    await expect(h.call("/internal/publish/demo")).resolves.toEqual({ version: "abc" });
  });
});
