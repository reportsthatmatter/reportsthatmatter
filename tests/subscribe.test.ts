import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { isValidEmail, normaliseSource, parseSubscription, recordSubscription, subscribersCsv } from "../src/lib/subscribe";
import type { MarksDB } from "../src/lib/marks";

/** A fake D1 holding `subscribers` in memory, honouring the UNIQUE email. `missing` acts as if migration 0006 is not applied. */
function fakeDb(missing = false) {
  const rows: Array<{ email: string; source: string; created_at: number }> = [];
  const db: MarksDB = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (missing) throw new Error("D1_ERROR: no such table: subscribers");
              expect(sql).toContain("ON CONFLICT(email) DO NOTHING");
              const [email, source, created_at] = args as [string, string, number];
              if (!rows.some((row) => row.email === email)) rows.push({ email, source, created_at });
              return {};
            },
            async all<T>() {
              return { results: [] as T[] };
            },
            async first<T>() {
              return null as T | null;
            },
          };
        },
      };
    },
  };
  return { db, rows };
}

const form = (fields: Record<string, string>, accept?: string) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", ...(accept ? { accept } : {}) },
  body: new URLSearchParams(fields).toString(),
});

describe("parseSubscription", () => {
  it("normalises the address and keeps a known source", () => {
    expect(parseSubscription({ email: "  Reader@Example.ORG ", source: "report:uk-leveson-inquiry" })).toEqual({
      email: "reader@example.org",
      source: "report:uk-leveson-inquiry",
      spam: false,
    });
  });

  it("rejects what is not an address", () => {
    for (const email of ["", "reader", "reader@", "@example.org", "reader@example", "a b@example.org", "<x>@example.org", `${"a".repeat(250)}@example.org`]) {
      expect(isValidEmail(email), email).toBe(false);
    }
    expect(parseSubscription({})).toBeNull();
    expect(parseSubscription({ email: 42 })).toBeNull();
  });

  it("records an unknown source as other, never as free text", () => {
    expect(normaliseSource("home")).toBe("home");
    expect(normaliseSource("post:from-the-archives-1")).toBe("post:from-the-archives-1");
    expect(normaliseSource("<script>")).toBe("other");
    expect(normaliseSource(undefined)).toBe("other");
  });

  it("flags a filled honeypot", () => {
    expect(parseSubscription({ email: "bot@example.org", website: "http://spam" })?.spam).toBe(true);
  });
});

describe("recordSubscription", () => {
  it("stores an address once, however often it is given", async () => {
    const { db, rows } = fakeDb();
    expect(await recordSubscription(db, { email: "a@example.org", source: "home" }, 1)).toBe("ok");
    expect(await recordSubscription(db, { email: "a@example.org", source: "blog" }, 2)).toBe("ok");
    expect(rows).toEqual([{ email: "a@example.org", source: "home", created_at: 1 }]);
  });

  it("is unavailable with no database or no table", async () => {
    expect(await recordSubscription(undefined, { email: "a@example.org", source: "home" }, 1)).toBe("unavailable");
    expect(await recordSubscription(fakeDb(true).db, { email: "a@example.org", source: "home" }, 1)).toBe("unavailable");
  });
});

describe("POST /api/subscribe", () => {
  it("a plain form post is stored and redirected to the thank-you", async () => {
    const { db, rows } = fakeDb();
    const res = await app.request("http://localhost/api/subscribe", form({ email: "Reader@example.org", source: "home" }), { DB: db });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/newsletter?subscribed");
    expect(rows.map((row) => row.email)).toEqual(["reader@example.org"]);
  });

  it("answers JSON to the script, with the words to show", async () => {
    const { db } = fakeDb();
    const res = await app.request("http://localhost/api/subscribe", form({ email: "reader@example.org" }, "application/json"), { DB: db });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(true);
    expect(body.message).toContain("confirm");
  });

  it("refuses a malformed address and stores nothing", async () => {
    const { db, rows } = fakeDb();
    const res = await app.request("http://localhost/api/subscribe", form({ email: "not-an-address" }), { DB: db });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/newsletter?error=invalid");
    const json = await app.request("http://localhost/api/subscribe", form({ email: "nope" }, "application/json"), { DB: db });
    expect(json.status).toBe(400);
    expect(rows).toEqual([]);
  });

  it("thanks a bot that filled the honeypot, and stores nothing", async () => {
    const { db, rows } = fakeDb();
    const res = await app.request("http://localhost/api/subscribe", form({ email: "bot@example.org", website: "x" }), { DB: db });
    expect(res.headers.get("location")).toBe("/newsletter?subscribed");
    expect(rows).toEqual([]);
  });

  it("says try later when the table is missing (migration 0006 not applied)", async () => {
    const res = await app.request("http://localhost/api/subscribe", form({ email: "reader@example.org" }, "application/json"), { DB: fakeDb(true).db });
    expect(res.status).toBe(503);
  });
});

describe("the signup on the site", () => {
  const signup = /<form class="signup-form" method="post" action="\/api\/subscribe" data-signup>[\s\S]*?name="source" value="([^"]+)"/;

  it("is on the homepage, a report's contents, a section, the blog and a post, each saying where it is", async () => {
    const pages: Array<[string, string]> = [
      ["/", "home"],
      ["/reports/challenger-accident", "report:challenger-accident"],
      ["/blog", "blog"],
    ];
    for (const [path, source] of pages) {
      const body = await (await app.request(`http://localhost${path}`)).text();
      expect(body.match(signup)?.[1], path).toBe(source);
      expect(body, path).toContain('src="/assets/signup.js"');
      expect(body, path).toContain("unsubscribe link");
      expect(body, path).toContain('<label class="visually-hidden" for="signup-email">Email address</label>');
    }
  });

  it("is at the end of a report section, compact", async () => {
    const overview = await (await app.request("http://localhost/reports/challenger-accident")).text();
    const slug = overview.match(/href="\/reports\/challenger-accident\/([a-z0-9-]+)"/)?.[1];
    expect(slug).toBeTruthy();
    const body = await (await app.request(`http://localhost/reports/challenger-accident/${slug}`)).text();
    expect(body.match(signup)?.[1]).toBe("report:challenger-accident");
    expect(body).not.toContain("signup-title");
    expect(body).toContain('src="/assets/signup.js"');
  });

  it("/newsletter explains what is kept and confirms a signup", async () => {
    const page = await (await app.request("http://localhost/newsletter")).text();
    expect(page).toContain('id="privacy"');
    expect(page).toContain("contact@reportsthatmatter.org");
    expect(page).not.toContain("noindex");
    const thanks = await (await app.request("http://localhost/newsletter?subscribed")).text();
    expect(thanks).toContain("you are on the list");
    expect(thanks).toContain("noindex");
    const unknown = await (await app.request("http://localhost/newsletter?error=<b>")).text();
    expect(unknown).not.toContain("signup-notice");
  });

  it("/newsletter is in the sitemap", async () => {
    const sitemap = await (await app.request("http://localhost/sitemap.xml")).text();
    expect(sitemap).toContain("/newsletter</loc>");
  });
});

describe("subscribersCsv", () => {
  it("writes a header and quotes what needs it", () => {
    expect(subscribersCsv([{ email: "a@example.org", source: "home", created_at: 0, status: "unconfirmed" }])).toBe(
      "email,subscribed_at,source,status\na@example.org,1970-01-01T00:00:00.000Z,home,unconfirmed\n"
    );
  });
});
