import { describe, expect, it } from "vitest";
import {
  contentHash,
  manifestFor,
  manifestProblems,
  tokenFor,
  authorises,
  isPublishablePath,
  isReportId,
} from "../src/lib/publish";
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

describe("content hashing", () => {
  it("is the same for the same content and different for different content", async () => {
    const a = await contentHash(await manifestFor(FILES));
    const b = await contentHash(await manifestFor([...FILES].reverse()));
    const c = await contentHash(
      await manifestFor([...FILES.slice(1), { path: "meta.json", body: "{} " }])
    );

    expect(a).toBe(b); // order of the files is not part of the version
    expect(a).not.toBe(c);
  });

  it("cannot be collided by shifting a boundary between fields", async () => {
    const one = await contentHash([{ path: "a", hash: "x".repeat(64) }, { path: "b", hash: "y".repeat(64) }]);
    const two = await contentHash([{ path: "ab", hash: "x".repeat(64) }, { path: "", hash: "y".repeat(64) }]);
    expect(one).not.toBe(two);
  });
});

describe("what may be published", () => {
  it("accepts the paths the reader actually asks for", () => {
    expect(isPublishablePath("meta.json")).toBe(true);
    expect(isPublishablePath("full-body.html")).toBe(true);
    expect(isPublishablePath("fragments/board-statement.html")).toBe(true);
  });

  it("refuses anything that could climb out of the version prefix", () => {
    for (const path of [
      "../../etc/passwd",
      "fragments/../../x.html",
      "/meta.json",
      "fragments/x.html/../../y",
      "search-index.sql",
      "fragments/nested/x.html",
    ]) {
      expect(isPublishablePath(path), path).toBe(false);
    }
  });

  it("refuses a report id that is not one", () => {
    for (const id of ["../x", "A", "", "x/y", "-leading"]) expect(isReportId(id), id).toBe(false);
    expect(isReportId("uk-leveson-inquiry")).toBe(true);
  });

  it("refuses a version missing anything the reader needs", async () => {
    expect(manifestProblems(await manifestFor(FILES))).toEqual([]);
    expect(manifestProblems(await manifestFor(FILES.slice(1)))).toContain("no meta.json");
    expect(manifestProblems(await manifestFor([FILES[0], FILES[1]]))).toContain("no fragments");
  });
});

describe("a report's publish token", () => {
  it("publishes that report and no other", async () => {
    const token = await tokenFor(SECRET, "report-a");
    expect(await authorises(SECRET, "report-a", token)).toBe(true);
    expect(await authorises(SECRET, "report-b", token)).toBe(false);
  });

  it("is worthless without the secret, and publishing is off without one", async () => {
    expect(await authorises(SECRET, "report-a", await tokenFor("other-secret", "report-a"))).toBe(false);
    expect(await authorises(undefined, "report-a", "anything")).toBe(false);
  });
});

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
