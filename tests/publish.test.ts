/**
 * Route wiring for the publish endpoint. The pure hashing/token/validation
 * logic these routes are built on (contentHash, manifestFor, tokenFor,
 * authorises, manifestProblems, isPublishablePath, isReportId) lives in
 * @rtm/ingest now, and is tested there — the same functions the Worker
 * imports here, so this suite and that one can never quietly test two
 * different implementations of what a hash means. What's left here is
 * everything that only exists once this logic is wired into HTTP routes
 * against real (faked) R2/D1 bindings.
 */
import { describe, expect, it } from "vitest";
import { contentHash, manifestFor, tokenFor } from "@rtm/ingest";
import { contentKey } from "../src/lib/content";
import { app } from "../src/index";

const SECRET = "a-test-secret";

/** R2 and D1 stand-ins that actually remember what was written. */
function stores() {
  const objects = new Map<string, string>();
  const pointers = new Map<string, string>();
  return {
    objects,
    pointers,
    CONTENT: {
      async get(key: string) {
        const value = objects.get(key);
        return value === undefined ? null : { text: async () => value };
      },
      async put(key: string, value: string) {
        objects.set(key, value);
      },
    },
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          run: async () => {
            if (sql.includes("INSERT INTO report_versions")) pointers.set(String(args[0]), String(args[1]));
          },
          all: async () => ({ results: [] }),
          first: async () => {
            if (sql.includes("SELECT content_hash")) {
              const hash = pointers.get(String(args[0]));
              return hash ? { content_hash: hash, published_at: 1 } : null;
            }
            return null;
          },
        }),
      }),
    },
  };
}

const FILES = [
  { path: "meta.json", body: '{"words":2,"sections":[{"slug":"s","title":"S"}],"paragraphToSection":{}}' },
  { path: "full-body.html", body: '<p id="a">Alpha.</p>' },
  { path: "fragments/s.html", body: '<p id="a">Alpha.</p>' },
];

async function publish(env: ReturnType<typeof stores>, reportId: string, files = FILES) {
  const manifest = await manifestFor(files);
  const hash = await contentHash(manifest);
  const token = await tokenFor(SECRET, reportId);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const bindings = { ...env, PUBLISH_SECRET: SECRET };

  const wrote = await app.request(
    `http://localhost/internal/publish/${reportId}/objects`,
    { method: "POST", headers, body: JSON.stringify({ hash, files }) },
    bindings
  );
  const committed = await app.request(
    `http://localhost/internal/publish/${reportId}/commit`,
    { method: "POST", headers, body: JSON.stringify({ hash, manifest }) },
    bindings
  );
  return { hash, manifest, wrote, committed };
}

describe("the publish endpoint", () => {
  it("publishes, then serves the published version", async () => {
    const env = stores();
    const { hash, committed } = await publish(env, "report-a");

    expect(committed.status).toBe(200);
    expect(await committed.json()).toMatchObject({ published: "report-a", version: hash, objects: 3 });
    expect(env.pointers.get("report-a")).toBe(hash);
    expect(env.objects.has(contentKey("report-a", hash, "fragments/s.html"))).toBe(true);
  });

  it("refuses a caller with no token, or another report's token", async () => {
    const env = { ...stores(), PUBLISH_SECRET: SECRET };
    const body = JSON.stringify({ hash: "0".repeat(16), files: FILES });

    const none = await app.request(
      "http://localhost/internal/publish/report-a/objects",
      { method: "POST", body, headers: { "content-type": "application/json" } },
      env
    );
    expect(none.status).toBe(401);

    const wrong = await app.request(
      "http://localhost/internal/publish/report-a/objects",
      {
        method: "POST",
        body,
        headers: { "content-type": "application/json", authorization: `Bearer ${await tokenFor(SECRET, "report-b")}` },
      },
      env
    );
    expect(wrong.status).toBe(401);
  });

  it("refuses everything when no secret is configured", async () => {
    const res = await app.request(
      "http://localhost/internal/publish/report-a/objects",
      {
        method: "POST",
        body: JSON.stringify({ hash: "0".repeat(16), files: FILES }),
        headers: { "content-type": "application/json", authorization: "Bearer anything" },
      },
      stores()
    );
    expect(res.status).toBe(401);
  });

  /** The gate the endpoint exists for: it must be able to refuse a bad publish. */
  it("refuses to point at a version whose objects were never written", async () => {
    const env = stores();
    const manifest = await manifestFor(FILES);
    const hash = await contentHash(manifest);

    const res = await app.request(
      `http://localhost/internal/publish/report-a/commit`,
      {
        method: "POST",
        body: JSON.stringify({ hash, manifest }),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await tokenFor(SECRET, "report-a")}`,
        },
      },
      { ...env, PUBLISH_SECRET: SECRET }
    );

    expect(res.status).toBe(409);
    expect((await res.json() as any).missing).toContain("meta.json");
    expect(env.pointers.has("report-a")).toBe(false);
  });

  it("refuses a hash that does not describe the manifest", async () => {
    const env = stores();
    const manifest = await manifestFor(FILES);

    const res = await app.request(
      `http://localhost/internal/publish/report-a/commit`,
      {
        method: "POST",
        body: JSON.stringify({ hash: "0123456789abcdef", manifest }),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await tokenFor(SECRET, "report-a")}`,
        },
      },
      { ...env, PUBLISH_SECRET: SECRET }
    );

    expect(res.status).toBe(400);
    expect(env.pointers.has("report-a")).toBe(false);
  });

  it("refuses when an object's contents differ from the manifest", async () => {
    const env = stores();
    const manifest = await manifestFor(FILES);
    const hash = await contentHash(manifest);
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${await tokenFor(SECRET, "report-a")}`,
    };
    const bindings = { ...env, PUBLISH_SECRET: SECRET };

    // Upload something other than what the manifest describes.
    await app.request(
      `http://localhost/internal/publish/report-a/objects`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          hash,
          files: FILES.map((f) => (f.path === "full-body.html" ? { ...f, body: "<p>tampered</p>" } : f)),
        }),
      },
      bindings
    );
    const res = await app.request(
      `http://localhost/internal/publish/report-a/commit`,
      { method: "POST", headers, body: JSON.stringify({ hash, manifest }) },
      bindings
    );

    expect(res.status).toBe(409);
    expect((await res.json() as any).missing).toContain("full-body.html (contents differ)");
    expect(env.pointers.has("report-a")).toBe(false);
  });

  it("rolls back by pointing at a version that is still there", async () => {
    const env = stores();
    const first = await publish(env, "report-a");
    const changed = FILES.map((f) =>
      f.path === "fragments/s.html" ? { ...f, body: '<p id="a">Beta.</p>' } : f
    );
    const second = await publish(env, "report-a", changed);
    expect(env.pointers.get("report-a")).toBe(second.hash);

    // The old objects were never collected, so the old hash still commits.
    const rolled = await app.request(
      `http://localhost/internal/publish/report-a/commit`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await tokenFor(SECRET, "report-a")}`,
        },
        body: JSON.stringify({ hash: first.hash, manifest: first.manifest }),
      },
      { ...env, PUBLISH_SECRET: SECRET }
    );

    expect(rolled.status).toBe(200);
    expect(env.pointers.get("report-a")).toBe(first.hash);
  });
});
