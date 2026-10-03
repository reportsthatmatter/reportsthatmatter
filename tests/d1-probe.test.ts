import { describe, expect, it } from "vitest";
import { D1Error, type Runner } from "../scripts/lib/d1";
import { duration, msUntilReset, probeWrite, rowsWrittenToday, verdict, type Probe } from "../scripts/lib/d1-probe";
import { planReport } from "../scripts/lib/reindex-run";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NOW = new Date("2026-10-03T18:30:00Z");

/** A D1 stand-in that answers the probe's statements, reporting `written` rows for the insert and the delete. */
function d1(written: { insert: number; delete: number } | "no-meta" | Error): { run: Runner; commands: string[] } {
  const commands: string[] = [];
  const run: Runner = (_t, sql) => {
    const command = (sql as { command: string }).command;
    commands.push(command);
    if (written instanceof Error) throw written;
    if (command.startsWith("INSERT")) return [{ results: [], meta: written === "no-meta" ? {} : { rows_written: written.insert } }];
    if (command.startsWith("SELECT")) return [{ results: [{ rid: 42 }], meta: {} }];
    return [{ results: [], meta: written === "no-meta" ? {} : { rows_written: written.delete } }];
  };
  return { run, commands };
}

describe("probeWrite", () => {
  it("inserts a sentinel row, removes it, and returns what D1 reported as the cost", () => {
    const { run, commands } = d1({ insert: 7, delete: 5 });
    const probe = probeWrite(run, "--remote");
    expect(probe).toEqual({ ok: true, cost: { insert: 7, delete: 5, version: 1 }, measured: true });
    expect(commands[0]).toMatch(/INSERT INTO passages .*__rtm_probe__/);
    expect(commands[2]).toBe("DELETE FROM passages WHERE rowid = 42");
  });

  it("falls back to the default cost when the database does not report rows written", () => {
    const probe = probeWrite(d1("no-meta").run, "--local");
    expect(probe).toMatchObject({ ok: true, measured: false, cost: { insert: 3, delete: 3 } });
  });

  it("reports the spent quota as blocked", () => {
    const err = new D1Error("D1_ERROR: exceeded free tier daily row write limit: SQLITE_ERROR [code: 7500]");
    const probe = probeWrite(d1(err).run, "--remote");
    expect(probe).toMatchObject({ ok: false, quota: true });
  });

  it("reports any other failure as not a quota problem", () => {
    const probe = probeWrite(d1(new D1Error("Authentication error [code: 10000]")).run, "--remote");
    expect(probe).toMatchObject({ ok: false, quota: false });
  });
});

describe("verdict", () => {
  const ok: Probe = { ok: true, cost: { insert: 3, delete: 3, version: 1 }, measured: true };

  it("blocks, and says when the counters reset, when D1 refused the write", () => {
    const v = verdict({ ok: false, quota: true, message: "code 7500" }, 100, null, 100_000, NOW);
    expect(v.blocked).toBe(true);
    expect(v.lines.join("\n")).toMatch(/resets at 00:00 UTC, in 5h 30m/);
  });

  it("does not block on a probe that failed for another reason", () => {
    expect(verdict({ ok: false, quota: false, message: "not logged in" }, 100, null, 100_000, NOW).blocked).toBe(false);
  });

  it("passes with the usage unknown, saying so", () => {
    const v = verdict(ok, 4_000, null, 100_000, NOW);
    expect(v.blocked).toBe(false);
    expect(v.lines.join("\n")).toMatch(/not known/);
    expect(v.lines.join("\n")).toMatch(/4,000 row write/);
  });

  it("passes when the estimate fits the headroom", () => {
    const v = verdict(ok, 4_000, 90_000, 100_000, NOW);
    expect(v.blocked).toBe(false);
    expect(v.lines.join("\n")).toMatch(/10,000 left/);
    expect(v.lines.join("\n")).toMatch(/it fits/);
  });

  it("blocks when the estimate is known not to fit", () => {
    const v = verdict(ok, 12_000, 90_000, 100_000, NOW);
    expect(v.blocked).toBe(true);
    expect(v.lines.join("\n")).toMatch(/does not fit/);
  });
});

describe("time to reset", () => {
  it("counts to the next 00:00 UTC", () => {
    expect(msUntilReset(NOW)).toBe(5.5 * 3_600_000);
    expect(duration(5.5 * 3_600_000)).toBe("5h 30m");
  });
});

describe("rowsWrittenToday", () => {
  const env = { token: "t", account: "a", databaseId: "d" };
  const reply = (json: unknown, ok = true) => async () => ({ ok, json: async () => json });

  it("is unknown without credentials", async () => {
    expect(await rowsWrittenToday(reply({}), {}, NOW)).toBeNull();
  });

  it("sums rowsWritten and asks about today's UTC date", async () => {
    let body = "";
    const fetchFn = async (_u: string, init: { body: string }) => {
      body = init.body;
      return { ok: true, json: async () => ({ data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [{ sum: { rowsWritten: 61_234 } }] }] } } }) };
    };
    expect(await rowsWrittenToday(fetchFn, env, NOW)).toBe(61_234);
    expect(JSON.parse(body).variables).toEqual({ account: "a", db: "d", day: "2026-10-03" });
  });

  it("is unknown on any surprise rather than a guess", async () => {
    expect(await rowsWrittenToday(reply({ errors: [{ message: "nope" }] }), env, NOW)).toBeNull();
    expect(await rowsWrittenToday(reply({}, false), env, NOW)).toBeNull();
    expect(await rowsWrittenToday(async () => { throw new Error("offline"); }, env, NOW)).toBeNull();
  });
});

describe("planReport", () => {
  /** A prerender on disk with one section of two paragraphs. */
  function prerender() {
    const root = mkdtempSync(join(tmpdir(), "rtm-plan-"));
    const dir = join(root, "assets/generated/reports/r");
    mkdirSync(join(dir, "fragments"), { recursive: true });
    writeFileSync(join(dir, "meta.json"), JSON.stringify({ sections: [{ slug: "one", title: "One" }] }));
    writeFileSync(join(dir, "fragments/one.html"), "<p>x</p>");
    return root;
  }
  const extract = () => [
    { paragraphId: "a", text: "alpha", page: "1" },
    { paragraphId: "b", text: "beta", page: "1" },
  ];

  it("does not read the stored paragraphs when the version row already matches", () => {
    const root = prerender();
    const commands: string[] = [];
    let version = "";
    const run: Runner = (_t, sql) => {
      const command = (sql as { command: string }).command;
      commands.push(command);
      return [{ results: command.includes("search_index_versions") ? [{ content_version: version }] : [], meta: {} }];
    };
    // first call learns the version this prerender hashes to
    const first = planReport({ root, report: "r", target: "--local", run, extract });
    version = first.contentVersion;
    commands.length = 0;
    const again = planReport({ root, report: "r", target: "--local", run, extract });
    expect(again.current).toBe(true);
    expect(again.writes).toBe(1);
    expect(commands.some((c) => c.includes("FROM passages"))).toBe(false);
  });

  it("plans the difference against what is stored", () => {
    const root = prerender();
    const run: Runner = (_t, sql) => {
      const command = (sql as { command: string }).command;
      if (command.includes("search_index_versions")) return [{ results: [], meta: {} }];
      return [{ results: command.includes("rowid > 0") ? [{ rid: 1, section: "One", paragraph_id: "a", page: "1", body: "alpha" }, { rid: 2, section: "One", paragraph_id: "b", page: "1", body: "old beta" }] : [], meta: {} }];
    };
    const planned = planReport({ root, report: "r", target: "--local", run, extract });
    expect(planned.current).toBe(false);
    expect(planned.plan).toMatchObject({ unchanged: 1, changed: 1, added: 0, removed: 0 });
    expect(planned.writes).toBe(3 + 3 + 1);
    expect(planned.fullWrites).toBe(2 * 3 + 2 * 3 + 2);
  });
});
