import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accountArgs, ACCOUNTS, insertSql, r2Diff, refuseAtomaticPublish, refuseOverwrite, sqlValue, staleReports } from "../scripts/lib/migrate-hosting";

describe("migrate-hosting", () => {
  it("quotes SQL values", () => {
    expect(sqlValue(null)).toBe("NULL");
    expect(sqlValue(3)).toBe("3");
    expect(sqlValue("it's")).toBe("'it''s'");
  });

  it("splits inserts under the statement limit and keeps every row", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ rowid: i, report: "r", section: "s", paragraph_id: `p${i}`, page: null, body: "x".repeat(1000) }));
    const sql = insertSql("passages", rows, 10_000);
    const statements = sql.trim().split(/;\n/);
    expect(statements.length).toBeGreaterThan(5);
    for (const s of statements) expect(Buffer.byteLength(s)).toBeLessThan(10_000);
    expect(sql.match(/'p\d+'/g)).toHaveLength(50);
    expect(sql).toContain("INSERT INTO passages (rowid,report,section,paragraph_id,page,body) VALUES");
  });

  it("can leave a column out (marks appended without their ids)", () => {
    const sql = insertSql("marks", [{ id: 7, report: "r", section: "s", paragraph: "p", exact: "e", prefix: "", suffix: "", page: null, kind: "share", actor: "a", created_at: 1 }], 90_000, ["report", "kind"]);
    expect(sql).toBe("INSERT INTO marks (report,kind) VALUES ('r','share');\n");
  });

  it("finds R2 objects to copy by key, ETag and size", () => {
    const a = { key: "a", etag: "1", size: 1 };
    const b = { key: "b", etag: "2", size: 2 };
    const d = r2Diff([a, b, { key: "c", etag: "3", size: 3 }], [a, { ...b, etag: "x" }, { key: "z", etag: "9", size: 9 }]);
    expect(d.missing.map((o) => o.key)).toEqual(["c"]);
    expect(d.changed.map((o) => o.key)).toEqual(["b"]);
    expect(d.extra.map((o) => o.key)).toEqual(["z"]);
    expect(d.same).toBe(1);
  });

  it("lists reports reindexed since the copy", () => {
    const v = (report: string, content_version: string, indexed_at = 1) => ({ report, content_version, indexed_at, layout: null });
    expect(staleReports([v("a", "1"), v("b", "2", 5), v("c", "3")], [v("a", "1"), v("b", "2", 4)])).toEqual(["b", "c"]);
  });

  it("selects the account from RTM_CF_ACCOUNT, Datopian (production) when unset", () => {
    expect(accountArgs({})).toEqual(["--env", "", "--profile", "datopian"]);
    expect(accountArgs({ RTM_CF_ACCOUNT: "atomatic" })).toEqual(["--env", "atomatic", "--profile", "default"]);
    expect(() => accountArgs({ RTM_CF_ACCOUNT: "nope" })).toThrow(/expected/);
  });

  it("refuses a publish under RTM_CF_ACCOUNT=atomatic unless --rollback-account is given", () => {
    const msg = refuseAtomaticPublish({ RTM_CF_ACCOUNT: "atomatic" }, false);
    expect(msg).toMatch(/refusing to publish with RTM_CF_ACCOUNT=atomatic/);
    expect(msg).toContain("--rollback-account");
    expect(refuseAtomaticPublish({ RTM_CF_ACCOUNT: "atomatic" }, true)).toBeNull();
    expect(refuseAtomaticPublish({}, false)).toBeNull();
    expect(refuseAtomaticPublish({ RTM_CF_ACCOUNT: "datopian" }, false)).toBeNull();
  });

  it("refuses at the command line: a real publish to a remote base, not a status read or a local base", () => {
    const run = (...args: string[]) => spawnSync("pnpm", ["--silent", "publish-report", "demo", ...args], { cwd: join(import.meta.dirname, ".."), encoding: "utf8", env: { ...process.env, RTM_CF_ACCOUNT: "atomatic", RTM_PUBLISH_SECRET: "" } });
    const refused = run("--base", "https://reportsthatmatter.invalid", "--yes");
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("refusing to publish with RTM_CF_ACCOUNT=atomatic");
    // With the flag (known to the unknown-flag check, jp6i) it gets past the account check and stops at the missing secret (exit 2), calling nothing.
    const allowed = run("--base", "https://reportsthatmatter.invalid", "--rollback-account", "--yes");
    expect(allowed.status).toBe(2);
    expect(allowed.stderr).toContain("RTM_PUBLISH_SECRET is not set");
    // A local base never reindexes a remote D1.
    expect(run("--base", "http://localhost:8799").stderr).not.toContain("refusing");
  });

  it("refuses to wipe or replace production data unless told to (post-cutover default direction)", () => {
    const prod = ACCOUNTS.datopian;
    expect(refuseOverwrite("import-d1", prod, {})).toMatch(/refusing: import-d1 wipes/);
    expect(refuseOverwrite("sync-d1", prod, { versions: true })).toMatch(/refusing: sync-d1 replaces/);
    expect(refuseOverwrite("sync-r2", prod, { changedObjects: 2 })).toMatch(/overwrites 2/);
    expect(refuseOverwrite("sync-d1", prod, {})).toBeNull(); // appends marks only
    expect(refuseOverwrite("sync-r2", prod, { changedObjects: 0 })).toBeNull(); // copies missing objects only
    expect(refuseOverwrite("import-d1", prod, { overwrite: true })).toBeNull();
    expect(refuseOverwrite("import-d1", ACCOUNTS.atomatic, {})).toBeNull(); // the rollback direction
  });
});
