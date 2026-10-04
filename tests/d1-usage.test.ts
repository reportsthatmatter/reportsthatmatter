import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyticsToday, combine, fits, ledgerToday, metaTotals, recordUsage, topQueries } from "../scripts/lib/d1-usage";

const NOW = new Date("2026-10-03T18:30:00Z");

describe("the ledger", () => {
  it("records each call's cost and sums today's (UTC) entries only, skipping torn lines", () => {
    const path = join(mkdtempSync(join(tmpdir(), "rtm-ledger-")), "sub/d1-usage.jsonl");
    recordUsage({ at: "2026-10-02T23:59:00Z", label: "yesterday", queries: 1, rowsRead: 999, rowsWritten: 9 }, path);
    recordUsage({ at: "2026-10-03T07:00:00Z", tool: "reindex-search.mjs", label: "SELECT  rowid\n FROM passages", queries: 1, rowsRead: 39_688, rowsWritten: 0 }, path);
    appendFileSync(path, '{"at":"2026-10-03T08:0'); // a torn concurrent append
    appendFileSync(path, "\n");
    recordUsage({ at: "2026-10-03T08:00:00Z", label: "file build/x.sql", ...metaTotals([{ meta: { rows_read: 10, rows_written: 5 } }, { meta: { rows_read: 2 } }]) }, path);
    expect(ledgerToday(NOW, path)).toEqual({ rowsRead: 39_700, rowsWritten: 5, entries: 2 });
  });

  it("is empty, not an error, when the file does not exist", () => {
    expect(ledgerToday(NOW, "/nonexistent/ledger.jsonl")).toEqual({ rowsRead: 0, rowsWritten: 0, entries: 0 });
  });

  it("never throws on a ledger it cannot write", () => {
    const dir = mkdtempSync(join(tmpdir(), "rtm-ledger-"));
    writeFileSync(join(dir, "file"), "x");
    expect(() => recordUsage({ label: "x", queries: 1, rowsRead: 1, rowsWritten: 0 }, join(dir, "file/under/a/file.jsonl"))).not.toThrow();
  });
});

describe("analytics", () => {
  const creds = { token: "t", accounts: ["a"], databaseId: "d" };
  const reply = (json: unknown, ok = true) => async () => ({ ok, json: async () => json });

  it("sums today's rows read and written, and asks for the UTC date", async () => {
    let body = "";
    const fetchFn = async (_u: string, init: { body: string }) => {
      body = init.body;
      return { ok: true, json: async () => ({ data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: 5_000_000, rowsWritten: 100 } }, { sum: { rowsRead: 479_804, rowsWritten: 14 } }] }] } } }) };
    };
    expect(await analyticsToday(fetchFn, creds, NOW)).toEqual({ rowsRead: 5_479_804, rowsWritten: 114 });
    expect(JSON.parse(body).variables).toEqual({ account: "a", db: "d", day: "2026-10-03" });
  });

  it("is unknown without credentials or on any surprise", async () => {
    expect(await analyticsToday(reply({}), {}, NOW)).toBeNull();
    expect(await analyticsToday(reply({ errors: [{ message: "no" }] }), creds, NOW)).toBeNull();
    expect(await analyticsToday(reply({}, false), creds, NOW)).toBeNull();
    expect(await analyticsToday(async () => { throw new Error("offline"); }, creds, NOW)).toBeNull();
  });

  it("lists the day's most expensive queries", async () => {
    const groups = [{ count: 33, sum: { rowsRead: 1_289_556, rowsWritten: 0 }, dimensions: { query: "SELECT rowid AS rid FROM passages WHERE report = '__rtm_probe__' LIMIT ?" } }];
    const top = await topQueries(reply({ data: { viewer: { accounts: [{ d1QueriesAdaptiveGroups: groups }] } } }), creds, "2026-10-03");
    expect(top).toEqual([{ query: groups[0].dimensions.query, count: 33, rowsRead: 1_289_556, rowsWritten: 0 }]);
  });
});

describe("budget", () => {
  it("takes the larger of the ledger and analytics, per counter", () => {
    const t = combine({ rowsRead: 200_000, rowsWritten: 50, entries: 3 }, { rowsRead: 150_000, rowsWritten: 900 });
    expect(t.used).toEqual({ rowsRead: 200_000, rowsWritten: 900 });
    expect(combine({ rowsRead: 0, rowsWritten: 0, entries: 0 }, null).used).toBeNull();
    expect(combine({ rowsRead: 7, rowsWritten: 0, entries: 1 }, null).source).toMatch(/ledger only/);
  });

  it("refuses what does not fit what is left after the Worker's reserve, reads or writes", () => {
    const today = combine({ rowsRead: 0, rowsWritten: 0, entries: 0 }, { rowsRead: 4_000_000, rowsWritten: 10_000 });
    expect(fits({ rowsRead: 400_000, rowsWritten: 1_000 }, today).ok).toBe(true); // 440k <= 500k left
    expect(fits({ rowsRead: 500_000, rowsWritten: 1_000 }, today).ok).toBe(false); // 550k > 500k
    expect(fits({ rowsRead: 0, rowsWritten: 80_000 }, today).ok).toBe(false); // 88k > 85k
  });

  it("with usage unknown, fits only what the whole day could hold, and says so", () => {
    const unknown = combine({ rowsRead: 0, rowsWritten: 0, entries: 0 }, null);
    const v = fits({ rowsRead: 1_000_000, rowsWritten: 1_000 }, unknown);
    expect(v.ok).toBe(true);
    expect(v.lines.join(" ")).toMatch(/unknown/);
    expect(fits({ rowsRead: 4_400_000, rowsWritten: 0 }, unknown).ok).toBe(false);
  });
});
