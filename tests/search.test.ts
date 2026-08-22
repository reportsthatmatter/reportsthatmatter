import { describe, expect, it } from "vitest";
import {
  buildMatchQuery,
  firstMatchOffsets,
  queryPassages,
  MARK_CLOSE,
  MARK_OPEN,
  type SearchDB,
} from "../src/lib/search";

describe("buildMatchQuery", () => {
  it("turns words into prefix terms", () => {
    expect(buildMatchQuery("credit rating")).toBe("credit* rating*");
  });

  it("lowercases, so a query term cannot collide with an FTS5 operator", () => {
    // "AND" typed by a reader searching for the word, not the operator.
    expect(buildMatchQuery("Cash AND Carry")).toBe("cash* and* carry*");
  });

  it("drops FTS5 syntax characters rather than passing them through", () => {
    expect(buildMatchQuery('"quoted" OR -excluded*')).toBe("quoted* or* excluded*");
  });

  it("returns null for a query with no usable words", () => {
    expect(buildMatchQuery("   ")).toBeNull();
    expect(buildMatchQuery("***")).toBeNull();
  });
});

describe("firstMatchOffsets", () => {
  it("finds the position of the first marked span in the original text's coordinates", () => {
    const marked = `The ${MARK_OPEN}rioters${MARK_CLOSE} at the Capitol.`;
    expect(firstMatchOffsets(marked)).toEqual({ start: 4, end: 11 });

    const plain = "The rioters at the Capitol.";
    expect(plain.slice(4, 11)).toBe("rioters");
  });

  it("uses the first match when there are several", () => {
    const marked = `${MARK_OPEN}Capitol${MARK_CLOSE} police guarded the ${MARK_OPEN}Capitol${MARK_CLOSE}.`;
    expect(firstMatchOffsets(marked)).toEqual({ start: 0, end: 7 });
  });

  it("returns null when nothing is marked", () => {
    expect(firstMatchOffsets("No markers here.")).toBeNull();
  });
});

/** Records the SQL and bound args of the last query, so tests can assert on shape rather than results. */
function fakeDb(rows: unknown[] = []): SearchDB & { lastSql: string; lastArgs: unknown[] } {
  const db = {
    lastSql: "",
    lastArgs: [] as unknown[],
    prepare(sql: string) {
      db.lastSql = sql;
      return {
        bind(...args: unknown[]) {
          db.lastArgs = args;
          return { all: async <T>() => ({ results: rows as T[] }) };
        },
      };
    },
  };
  return db;
}

describe("queryPassages", () => {
  it("does not touch the database for a query with no usable words", async () => {
    const db = fakeDb();
    const results = await queryPassages(db, "   ", null);
    expect(results).toEqual([]);
    expect(db.lastSql).toBe("");
  });

  it("binds the match query and limit, with no report filter, when unscoped", async () => {
    const db = fakeDb();
    await queryPassages(db, "credit rating", null, 20);
    expect(db.lastSql).not.toContain("AND report = ?");
    expect(db.lastArgs).toEqual([MARK_OPEN, MARK_CLOSE, "credit* rating*", 20]);
  });

  it("adds the report filter and binds the scope when scoped", async () => {
    const db = fakeDb();
    await queryPassages(db, "credit rating", "us-psi-financial-crisis", 20);
    expect(db.lastSql).toContain("AND report = ?");
    expect(db.lastArgs).toEqual([
      MARK_OPEN,
      MARK_CLOSE,
      "credit* rating*",
      "us-psi-financial-crisis",
      20,
    ]);
  });

  it("returns the rows the database gives back", async () => {
    const row = { report: "r", section: "s", paragraph_id: "p", page: "1", body: "b", marked: "m" };
    const db = fakeDb([row]);
    expect(await queryPassages(db, "credit", null)).toEqual([row]);
  });
});
