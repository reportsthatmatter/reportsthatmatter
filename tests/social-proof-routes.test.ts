import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { extractParagraph } from "../src/templates/report";
import { RATE_LIMIT_PER_DAY, recordMark } from "../src/lib/marks";
import { createFakeD1 } from "./support/fake-d1";

const validPayload = {
  report: "jack-smith-vol1",
  section: "the-law",
  paragraph: "some-paragraph",
  exact: "some words a reader selected",
  prefix: "",
  suffix: "",
  page: 12,
  kind: "share",
};

describe("POST /api/mark", () => {
  it("accepts a well-formed event and is silent about it", async () => {
    const DB = createFakeD1();
    const res = await app.request(
      "http://localhost/api/mark",
      { method: "POST", body: JSON.stringify(validPayload), headers: { "content-type": "application/json" } },
      { DB }
    );
    expect(res.status).toBe(204);
    expect(DB.rows).toHaveLength(1);
    expect(DB.rows[0]).toMatchObject({ report: "jack-smith-vol1", paragraph: "some-paragraph", kind: "share" });
  });

  it("computes actor from ip and user agent, not from the client", async () => {
    const DB = createFakeD1();
    await app.request(
      "http://localhost/api/mark",
      {
        method: "POST",
        body: JSON.stringify(validPayload),
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "9.9.9.9",
          "user-agent": "test-agent",
        },
      },
      { DB, MARK_SALT: "s3cr3t" }
    );
    expect(DB.rows[0].actor).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a malformed payload without touching the database", async () => {
    const DB = createFakeD1();
    const res = await app.request(
      "http://localhost/api/mark",
      { method: "POST", body: JSON.stringify({ ...validPayload, kind: "delete" }), headers: { "content-type": "application/json" } },
      { DB }
    );
    expect(res.status).toBe(400);
    expect(DB.rows).toHaveLength(0);
  });

  it("rejects a body that is not JSON", async () => {
    const DB = createFakeD1();
    const res = await app.request(
      "http://localhost/api/mark",
      { method: "POST", body: "not json", headers: { "content-type": "application/json" } },
      { DB }
    );
    expect(res.status).toBe(400);
  });

  it("is a no-op, not a crash, when no database is configured", async () => {
    const res = await app.request("http://localhost/api/mark", {
      method: "POST",
      body: JSON.stringify(validPayload),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(204);
  });

  it("returns 429 once the same reader exceeds the daily cap for a report", async () => {
    const DB = createFakeD1();
    // Same ip+ua means the same actor hash on every request.
    const headers = { "content-type": "application/json", "cf-connecting-ip": "1.1.1.1" };
    let last;
    for (let i = 0; i <= RATE_LIMIT_PER_DAY; i++) {
      last = await app.request(
        "http://localhost/api/mark",
        { method: "POST", body: JSON.stringify(validPayload), headers },
        { DB }
      );
    }
    expect(last!.status).toBe(429);
  });
});

describe("GET /reports/:id/marks", () => {
  it("returns an empty list when no database is configured", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1/marks");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns aggregated counts at or above the configured threshold", async () => {
    const DB = createFakeD1();
    const event = {
      report: "jack-smith-vol1",
      section: "the-law",
      paragraph: "some-paragraph",
      exact: "some words",
      prefix: "",
      suffix: "",
      page: 12,
      kind: "share" as const,
    };
    await recordMark(DB, event, "reader-1", 1);

    const res = await app.request(
      "http://localhost/reports/jack-smith-vol1/marks",
      {},
      { DB, MARK_THRESHOLD: "1" }
    );
    const body = await res.json();
    expect(body).toEqual([
      { paragraph: "some-paragraph", exact: "some words", prefix: "", suffix: "", page: 12, readers: 1 },
    ]);
  });

  it("respects a higher configured threshold", async () => {
    const DB = createFakeD1();
    const event = {
      report: "jack-smith-vol1",
      section: "the-law",
      paragraph: "some-paragraph",
      exact: "some words",
      prefix: "",
      suffix: "",
      page: 12,
      kind: "share" as const,
    };
    await recordMark(DB, event, "reader-1", 1);

    const res = await app.request(
      "http://localhost/reports/jack-smith-vol1/marks",
      {},
      { DB, MARK_THRESHOLD: "3" }
    );
    expect(await res.json()).toEqual([]);
  });
});

describe("Most marked passages", () => {
  it("shows a passage on the contents page once a reader has marked it", async () => {
    const first = await app.request("http://localhost/reports/jack-smith-vol1/full");
    const html = await first.text();
    const id = html.match(/<p id="([a-z0-9-]+)"/)?.[1];
    expect(id).toBeTruthy();
    const paragraph = extractParagraph(html, id!)!;
    const exact = paragraph.slice(0, Math.min(30, paragraph.length));

    const DB = createFakeD1();
    await recordMark(
      DB,
      {
        report: "jack-smith-vol1",
        section: "the-law",
        paragraph: id!,
        exact,
        prefix: "",
        suffix: "",
        page: null,
        kind: "share",
      },
      "reader-1",
      1
    );

    const res = await app.request(
      "http://localhost/reports/jack-smith-vol1",
      {},
      { DB, MARK_THRESHOLD: "1" }
    );
    const body = await res.text();
    expect(body).toContain("Most marked passages");
    expect(body).toContain(exact);
    expect(body).toContain("1 reader");
  });

  it("renders the contents page fine with no database configured", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1");
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("Most marked passages");
  });
});
