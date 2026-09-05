import { describe, expect, it } from "vitest";
import { contentFor, contentKey, type ContentBucket, type VersionsDB } from "../src/lib/content";
import { app } from "../src/index";

/** An R2 stand-in holding exactly the keys given to it. */
function bucket(objects: Record<string, string>): ContentBucket {
  return {
    async get(key: string) {
      const value = objects[key];
      return value === undefined ? null : { text: async () => value };
    },
  };
}

/** A D1 stand-in that answers the one pointer query, or throws. */
function versions(rows: Record<string, string>, throws = false): VersionsDB {
  return {
    prepare: () => ({
      bind: (reportId: unknown) => ({
        first: async () => {
          if (throws) throw new Error("no such table: report_versions");
          const hash = rows[String(reportId)];
          return hash ? { content_hash: hash } : null;
        },
      }),
    }),
  } as VersionsDB;
}

describe("contentFor", () => {
  it("serves the deploy's own copy when a report has never been published", async () => {
    const content = await contentFor({}, "jack-smith-vol1");
    expect(content.version).toBe("assets");
    expect(await content.text("meta.json")).toContain('"sections"');
  });

  it("serves the deploy's copy when there is a bucket but no pointer row", async () => {
    const content = await contentFor(
      { CONTENT: bucket({}), DB: versions({}) },
      "jack-smith-vol1"
    );
    expect(content.version).toBe("assets");
    expect(await content.text("meta.json")).toContain('"sections"');
  });

  it("serves the pinned version from R2 once a report is published", async () => {
    const key = contentKey("jack-smith-vol1", "abc123", "fragments/x.html");
    const content = await contentFor(
      {
        CONTENT: bucket({ [key]: "<p id=\"published\">from R2</p>" }),
        DB: versions({ "jack-smith-vol1": "abc123" }),
      },
      "jack-smith-vol1"
    );

    expect(content.version).toBe("abc123");
    expect(await content.text("fragments/x.html")).toBe('<p id="published">from R2</p>');
  });

  it("pins one report without touching another", async () => {
    const env = {
      CONTENT: bucket({ [contentKey("a", "h1", "meta.json")]: "{}" }),
      DB: versions({ a: "h1" }),
    };
    expect((await contentFor(env, "a")).version).toBe("h1");
    expect((await contentFor(env, "jack-smith-vol1")).version).toBe("assets");
  });

  /**
   * Objects are written before the pointer is flipped, so these two cannot
   * happen in a correct publish. They are here because the site staying up is
   * worth more than the purity of failing loudly — and the version header is
   * what keeps the fallback observable rather than silent.
   */
  it("falls back to the deploy's copy if a pinned object is missing", async () => {
    const content = await contentFor(
      { CONTENT: bucket({}), DB: versions({ "jack-smith-vol1": "abc123" }) },
      "jack-smith-vol1"
    );
    expect(content.version).toBe("abc123");
    expect(await content.text("meta.json")).toContain('"sections"');
  });

  it("falls back if the pointer table does not exist yet", async () => {
    const content = await contentFor(
      { CONTENT: bucket({}), DB: versions({}, true) },
      "jack-smith-vol1"
    );
    expect(content.version).toBe("assets");
    expect(await content.text("meta.json")).toContain('"sections"');
  });
});

describe("serving a published report", () => {
  it("renders R2 content and names the version it served", async () => {
    const meta = JSON.parse(
      (await (await contentFor({}, "jack-smith-vol1")).text("meta.json"))!
    );
    const slug = meta.sections[0].slug;
    const hash = "deadbeef1234";

    const res = await app.request(
      `http://localhost/reports/jack-smith-vol1/${slug}`,
      {},
      {
        CONTENT: bucket({
          [contentKey("jack-smith-vol1", hash, "meta.json")]: JSON.stringify(meta),
          [contentKey("jack-smith-vol1", hash, `fragments/${slug}.html`)]:
            '<p id="only-in-r2">Published text, not the deploy’s.</p>',
        }),
        DB: versions({ "jack-smith-vol1": hash }),
      }
    );

    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-rtm-content-version")).toBe(hash);
    expect(html).toContain("Published text, not the deploy");
    expect(html).toContain('id="only-in-r2"');
  });

  it("names the deploy as the version when nothing is published", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1/full");
    expect(res.headers.get("x-rtm-content-version")).toBe("assets");
  });
});
