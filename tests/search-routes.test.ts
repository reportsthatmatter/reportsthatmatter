import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { MARK_CLOSE, MARK_OPEN } from "../src/lib/search";

/** A fake D1 for the /search route: returns fixed rows regardless of the query, so tests can focus on routing/shaping. */
function fakeSearchDb(rows: unknown[]) {
  return {
    prepare() {
      return {
        bind() {
          return { all: async () => ({ results: rows }) };
        },
      };
    },
  };
}

describe("GET /search", () => {
  it("renders the search form with no query", async () => {
    const res = await app.request("http://localhost/search");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('name="q"');
    expect(body).not.toContain("No matches");
  });

  it("says search is unavailable when there is a query but no database", async () => {
    const res = await app.request("http://localhost/search?q=credit");
    const body = await res.text();
    expect(body).toContain("unavailable");
  });

  it("says no matches for a query with no usable words, without needing the database to say so", async () => {
    // queryPassages returns [] before ever touching the db for an unusable query.
    const res = await app.request(
      "http://localhost/search?q=%2A%2A%2A",
      {},
      { DB: fakeSearchDb([]) }
    );
    const body = await res.text();
    expect(body).toContain("No matches");
  });

  it("turns a real matching row into a result linking through a quote anchor", async () => {
    const row = {
      report: "jack-smith-vol1",
      section: "DELIVERY BY HAND",
      paragraph_id: "u-s-department-justice",
      page: null,
      body: "U.S. Department of Justice",
      marked: `U.S. Department of ${MARK_OPEN}Justice${MARK_CLOSE}`,
    };

    const res = await app.request(
      "http://localhost/search?q=justice",
      {},
      { DB: fakeSearchDb([row]) }
    );
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain("<mark>Justice</mark>");
    expect(body).toContain("DELIVERY BY HAND");
    expect(body).toMatch(
      /href="\/reports\/jack-smith-vol1\/delivery-by-hand\?p=u-s-department-justice&amp;h=[^"]+#u-s-department-justice"/
    );
  });

  it("drops a row whose paragraph no longer resolves to a section, rather than linking it broken", async () => {
    const row = {
      report: "jack-smith-vol1",
      section: "Somewhere",
      paragraph_id: "not-a-real-paragraph-id",
      page: null,
      body: "Some text",
      marked: `Some ${MARK_OPEN}text${MARK_CLOSE}`,
    };

    const res = await app.request(
      "http://localhost/search?q=text",
      {},
      { DB: fakeSearchDb([row]) }
    );
    const body = await res.text();
    expect(body).toContain("No matches");
  });

  it("scopes to a report and offers to widen the search", async () => {
    const res = await app.request(
      "http://localhost/search?q=justice&report=jack-smith-vol1",
      {},
      { DB: fakeSearchDb([]) }
    );
    const body = await res.text();
    expect(body).toContain("Search everything instead");
  });

  it("is linked from the header and footer navigation", async () => {
    const res = await app.request("http://localhost/");
    const body = await res.text();
    expect(body).toContain('href="/search"');
  });

  it("gives a report's contents page a search box scoped to it", async () => {
    const res = await app.request("http://localhost/reports/jack-smith-vol1");
    const body = await res.text();
    expect(body).toContain('name="report" value="jack-smith-vol1"');
  });
});
