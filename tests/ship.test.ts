import { describe, expect, it } from "vitest";
import {
  aliasProblems,
  buildSteps,
  compareVersions,
  d1Fits,
  drive,
  driftedReports,
  estimatedReads,
  estimatedWrites,
  formatPlan,
  freshState,
  guardProblems,
  movedReports,
  pinTable,
  unreadReports,
  versionOf,
  type Cmd,
  type Ctx,
  type ExecResult,
  type Probe,
  type Runtime,
  type State,
} from "../scripts/lib/ship";

const SPEC = (v: string) => `github:reportsthatmatter/ingest#v${v}`;
const IDS = ["alpha", "beta", "gamma"];

function ctx(over: Partial<Ctx> = {}): Ctx {
  return {
    root: "/site",
    spec: SPEC("0.21.0"),
    version: "0.21.0",
    ids: IDS,
    repos: IDS.map((id) => ({ dir: `/repos/${id}`, ids: [id], shared: true })),
    base: "https://prod.example",
    oldRef: "abc123",
    shared: true,
    yes: false,
    allowDirty: false,
    d1Limit: 100_000,
    has: () => false,
    ...over,
  };
}

/** A site and three report repos that exist only in this object. */
function fakeProbe(init: { pins?: Record<string, string>; dirty?: Record<string, string[]>; branch?: Record<string, string>; numstat?: Array<[number, number, string]>; used?: number | null; reads?: number } = {}) {
  const pins: Record<string, string> = { ...Object.fromEntries(IDS.map((id) => [`/repos/${id}`, SPEC("0.20.0")])), ...init.pins };
  const written: Array<[string, string]> = [];
  const probe: Probe = {
    pinOf: (dir) => pins[dir] ?? null,
    writePin: (dir, spec) => {
      pins[dir] = spec;
      written.push([dir, spec]);
    },
    status: (dir, paths) => (init.dirty?.[paths ? `${dir}:${paths[0]}` : dir] ?? (paths ? init.dirty?.[`${dir}:*`] : undefined)) ?? [],
    branch: (dir) => init.branch?.[dir] ?? "main",
    defaultBranch: () => "main",
    unpushed: () => 0,
    behind: () => 0,
    numstat: () => init.numstat ?? [],
    sha: () => null,
    d1Today: async () =>
      init.used === null
        ? { used: null, ledger: { rowsRead: 0, rowsWritten: 0 }, analytics: null, source: "unknown" }
        : { used: { rowsRead: init.reads ?? 0, rowsWritten: init.used ?? 0 }, ledger: { rowsRead: 0, rowsWritten: 0 }, analytics: { rowsRead: init.reads ?? 0, rowsWritten: init.used ?? 0 }, source: "test" },
  };
  return { probe, pins, written };
}

type Handler = (cmd: Cmd) => Partial<ExecResult> | undefined;

function harness(opts: { ctx?: Partial<Ctx>; probe?: Parameters<typeof fakeProbe>[0]; handler?: Handler; state?: State; acks?: string[] } = {}) {
  const calls: string[] = [];
  const lines: string[] = [];
  const f = fakeProbe(opts.probe);
  const state = opts.state ?? freshState(SPEC("0.21.0"), "abc123", "t0");
  if (opts.acks) state.data.acks = opts.acks;
  const saved: string[] = [];
  const rt: Runtime = {
    ctx: ctx(opts.ctx),
    state,
    probe: f.probe,
    async exec(cmd, label) {
      const text = cmd.argv.join(" ");
      calls.push(text);
      const r = opts.handler?.(cmd) ?? {};
      return { code: 0, stdout: "", log: `build/ship/logs/${label}.log`, seconds: 0, ...r };
    },
    save: (s) => saved.push(JSON.stringify(s)),
    out: (l) => lines.push(l),
    now: () => "t1",
    acked: (id) => (state.data.acks ?? []).includes(id),
  };
  return { rt, calls, lines, state, saved, ...f };
}

const out = (h: { lines: string[] }) => h.lines.join("\n");
const ran = (calls: string[], needle: string) => calls.filter((c) => c.includes(needle));

describe("pure helpers", () => {
  it("reads and compares pins", () => {
    expect(versionOf(SPEC("0.21.0"))).toBe("0.21.0");
    expect(versionOf("link:../ingest")).toBeNull();
    expect(compareVersions("0.9.0", "0.21.0")).toBe(-1);
    expect(compareVersions("0.21.0", "0.21.0")).toBe(0);
    expect(compareVersions("1.0.0", "0.99.9")).toBe(1);
  });

  it("classifies each repo's pin: ok, bump, ahead (never backwards), missing", () => {
    const c = ctx();
    const pins: Record<string, string | null> = { "/repos/alpha": SPEC("0.21.0"), "/repos/beta": SPEC("0.20.0"), "/repos/gamma": SPEC("0.22.0") };
    expect(pinTable(c, (d) => pins[d]).map((r) => r.action)).toEqual(["ok", "bump", "ahead"]);
    expect(pinTable(c, () => null)[0].action).toBe("missing");
  });

  it("finds the reports `ingest check` says moved, through colour codes", () => {
    const text = "  \x1b[32m✓\x1b[0m alpha\n  \x1b[31m✗\x1b[0m beta — output moved:\n      words 1 -> 2\n  \x1b[31m✗\x1b[0m gamma: no baseline.json — run `pnpm ingest baseline gamma`";
    expect(movedReports(text)).toEqual(["beta"]);
  });

  it("reads the drift table and the unread line", () => {
    const table = [
      "published content against this checkout's prerender (https://x)",
      "",
      "  report  local         served        state",
      "  alpha   aaaaaaaaaaaa  aaaaaaaaaaaa  current",
      "  beta    bbbbbbbbbbbb  cccccccccccc  DRIFT: republish",
      "  gamma   dddddddddddd  assets        not published (deploy copy)",
      "",
      "2 of 3 report(s) need publishing: beta, gamma",
    ].join("\n");
    expect(driftedReports(table)).toEqual(["beta", "gamma"]);
    expect(unreadReports("1 report(s) could not be read: alpha")).toEqual(["alpha"]);
    expect(unreadReports(table)).toEqual([]);
  });

  it("reads the dry-run's estimated writes", () => {
    expect(estimatedWrites("  estimated D1 row writes: 12,345 (11,000 search reindex + 1 version row)")).toBe(12345);
    expect(estimatedWrites("nothing")).toBeNull();
    expect(estimatedReads("  estimated D1 rows read: 3,214 (the reindex's read through the recorded layout, + the publish probe)")).toBe(3214);
    expect(estimatedReads("  estimated D1 row writes: 1")).toBeNull();
  });

  it("budgets reads as well as writes, holding back a reserve for the Worker", () => {
    const today = (rowsRead: number, rowsWritten = 0) => ({ used: { rowsRead, rowsWritten }, ledger: { rowsRead: 0, rowsWritten: 0 }, analytics: { rowsRead, rowsWritten }, source: "test" });
    expect(d1Fits(1_000, today(1_000_000), 100_000, 500_000).ok).toBe(true);
    // 2026-10-03: 4.7M read by 18:00, and a release needing ~600k more
    const spent = d1Fits(1_000, today(4_700_000), 100_000, 600_000);
    expect(spent.ok).toBe(false);
    expect(spent.readHeadroom).toBe(0);
    expect(spent.lines.join(" ")).toContain("rows read");
    // 3.9M used leaves 600k after the 500k reserve: 600k * 1.1 does not fit
    expect(d1Fits(0, today(3_900_000), 100_000, 600_000).ok).toBe(false);
    expect(d1Fits(0, today(3_800_000), 100_000, 600_000).ok).toBe(true);
  });

  it("checks the D1 estimate against the quota, with a margin, and says when usage is unknown", () => {
    expect(d1Fits(5_000, 10_000, 100_000).ok).toBe(true);
    expect(d1Fits(90_000, 10_000, 100_000).ok).toBe(false); // 99,000 with the margin > 90,000 headroom
    expect(d1Fits(5_000, null, 100_000).lines.join(" ")).toContain("unknown");
    expect(d1Fits(95_000, null, 100_000).ok).toBe(false);
    expect(d1Fits(1, null, 100_000).ok).toBe(false); // unknown refuses even a tiny need (r52n)
    expect(d1Fits(1, null, 100_000).lines.join(" ")).toContain("pnpm d1-usage");
    // the ledger alone (analytics unreachable) is unknown too: it cannot see the Worker's reads (t4al)
    const ledgerOnly = { used: { rowsRead: 5, rowsWritten: 0 }, ledger: { rowsRead: 5, rowsWritten: 0 }, analytics: null, source: "ledger only" };
    expect(d1Fits(1, ledgerOnly, 100_000).ok).toBe(false);
    expect(d1Fits(1, ledgerOnly, 100_000).lines.join(" ")).toContain("analytics is unreachable");
  });

  it("refuses removed alias lines for a report whose text did not move, and any lost published id", () => {
    const rows: Array<[number, number, string]> = [
      [0, 3, "reports/alpha/aliases.yaml"],
      [4, 2, "reports/beta/aliases.yaml"],
      [0, 1, "reports/beta/published-ids.txt"],
      [9, 0, "reports/gamma/aliases.yaml"],
    ];
    const p = aliasProblems(rows, new Set(["beta"]));
    expect(p.map((x) => `${x.id}:${x.file.split("/").pop()}`)).toEqual(["alpha:aliases.yaml", "beta:published-ids.txt"]);
    expect(p[0].restore).toBe("git checkout HEAD -- reports/alpha/aliases.yaml");
  });

  it("evaluates the guard read-only", () => {
    const f = fakeProbe({ pins: { "/repos/beta": SPEC("0.22.0") }, branch: { "/repos/gamma": "wt/x" }, dirty: { "/repos/alpha": [" M full.md"] } });
    const problems = guardProblems(ctx(), f.probe).join("\n");
    expect(problems).toContain("beta");
    expect(problems).toContain("ahead of the site's 0.21.0");
    expect(problems).toContain("/repos/gamma is on wt/x");
    expect(problems).toContain("/repos/alpha has uncommitted changes");
    expect(guardProblems(ctx(), fakeProbe().probe)).toEqual([]);
  });
});

describe("pnpm ship --plan", () => {
  it("prints every step with its commands, marks production, and runs nothing", () => {
    const f = fakeProbe();
    const plan = formatPlan(ctx(), freshState(SPEC("0.21.0"), "abc123", "t0"), buildSteps(), f.probe, { head: "deadbee" });
    for (const id of ["guard", "pin-bump", "install", "reingest", "baseline", "aggregate", "aliases", "prerender", "corpus", "editorial", "cards", "ratchet", "checks", "committed", "status", "d1-estimate", "publish", "deploy", "reindex", "seed", "verify-prod", "record"]) expect(plan).toContain(` ${id}  (`);
    expect(plan).toContain("pnpm ingest run beta --shared");
    expect(plan).toContain("pnpm aliases generate --all --old-ref abc123");
    expect(plan).toContain("publish  (PROD, needs --yes)");
    expect(plan).toContain("RTM_PUBLISH_SECRET=$(cat ~/.rtm-publish-secret)");
    expect(plan).toContain("3 of 3 repos need a pin bump");
    expect(plan).toContain("Guard, evaluated now: passes.");
    expect(plan).not.toContain(process.env.RTM_PUBLISH_SECRET ?? "<no secret in this env>");
  });

  it("says what a pin ahead of the site does to the run", () => {
    const f = fakeProbe({ pins: { "/repos/alpha": SPEC("0.22.0") } });
    const plan = formatPlan(ctx(), freshState(SPEC("0.21.0"), "abc123", "t0"), buildSteps(), f.probe);
    expect(plan).toContain("the run would STOP at step 1");
    expect(plan).toContain("AHEAD of site");
  });

  it("shows the tools a checkout does not have yet as skipped, and the ones it has", () => {
    const f = fakeProbe();
    const without = formatPlan(ctx(), freshState(SPEC("0.21.0"), "a", "t"), buildSteps(), f.probe);
    expect(without).toContain("pnpm marks check is not on this checkout yet: skipped");
    const withAll = formatPlan(ctx({ has: () => true }), freshState(SPEC("0.21.0"), "a", "t"), buildSteps(), f.probe);
    expect(withAll).toContain("pnpm posts --check");
    expect(withAll).toContain("pnpm ingest anchors --all --check");
  });
});

/** Everything passes; the drift table lists beta and gamma. */
const happy: Handler = (cmd) => {
  const text = cmd.argv.join(" ");
  if (text.includes("publish-report --all --status")) return { stdout: "  alpha  aaaaaaaaaaaa  aaaaaaaaaaaa  current\n  beta   bbbbbbbbbbbb  cccccccccccc  DRIFT: republish\n  gamma  dddddddddddd  assets  not published (deploy copy)\n" };
  if (text.includes("--dry-run")) return { stdout: `  estimated D1 row writes: ${text.includes("beta") ? 3000 : 1500} (x)` };
  return undefined;
};

describe("drive: the happy path", () => {
  it("runs the local steps, then stops before production without --yes, having run nothing against it", async () => {
    const h = harness({ handler: happy, probe: { dirty: { "/site:reports": [" M reports/beta/full.md"] } } });
    const code = await drive(h.rt, buildSteps());
    expect(code).toBe(3);
    expect(out(h)).toContain("publish touches production");
    expect(h.state.steps["publish"].status).toBe("awaiting-yes");
    expect(h.state.data.changed).toEqual(["beta"]);
    expect(h.state.data.toPublish).toEqual(["beta", "gamma"]);
    expect(h.state.data.estimate?.total).toBe(4500);
    for (const prod of ["--no-reindex", "deploy-cloudflare", "reindex-search", "seed-highlights", "VERIFY_BASE"]) expect(ran(h.calls, prod)).toEqual([]);
    expect(h.calls).toContain("pnpm ingest run alpha --shared");
    expect(h.calls).toContain("pnpm ingest aggregate --shared");
    expect(h.calls.indexOf("pnpm ingest aggregate --shared")).toBeLessThan(h.calls.indexOf("pnpm aliases generate --all --old-ref abc123"));
  });

  it("with --yes runs publish (no-reindex, secret), deploy, reindex per report, seed, verify and record, in order", async () => {
    const h = harness({ handler: happy, ctx: { yes: true } });
    const code = await drive(h.rt, buildSteps());
    expect(code).toBe(0);
    const order = ["--no-reindex", "deploy-cloudflare", "reindex-search.sh beta", "reindex-search.sh gamma", "seed-highlights --remote", "verify.sh", "quality ratchet --record", "scorecard --record"];
    let at = -1;
    for (const needle of order) {
      const i = h.calls.findIndex((c, k) => k > at && c.includes(needle));
      expect(i, needle).toBeGreaterThan(at);
      at = i;
    }
    // Publishes only the drifted reports, once each, with --no-reindex.
    expect(ran(h.calls, "publish-report beta --base").length).toBe(1);
    expect(ran(h.calls, "publish-report alpha --base")).toEqual([]);
    expect(h.calls.filter((c) => c.startsWith("pnpm publish-report") && c.includes("--no-reindex")).length).toBe(2);
  });
});

describe("drive: the cards step (u09x)", () => {
  it("regenerates cards and the queue after the editorial step, offline, and stops when that changed the tree", async () => {
    const h = harness({ handler: happy, probe: { dirty: { "/site:assets/cards": ["?? assets/cards/us-deepwater-horizon/q-09509400.png", " D assets/cards/us-deepwater-horizon/q-56d39b37.png"] } } });
    expect(await drive(h.rt, buildSteps())).toBe(1);
    expect(out(h)).toContain("STOPPED at cards");
    expect(out(h)).toContain("q-56d39b37.png");
    expect(h.calls.indexOf("pnpm editorial")).toBeLessThan(h.calls.indexOf("pnpm cards"));
    expect(h.calls.indexOf("pnpm cards")).toBeLessThan(h.calls.indexOf("pnpm posts"));
    expect(ran(h.calls, "quality ratchet")).toEqual([]);
    for (const c of ["--remote", "wrangler", "--base"]) expect(h.calls.filter((x) => (x.includes("cards") || x.includes("posts")) && x.includes(c))).toEqual([]);
  });

  it("passes when regeneration changes nothing", async () => {
    const h = harness({ handler: happy });
    await drive(h.rt, buildSteps());
    expect(h.state.steps["cards"].status).toBe("done");
  });
});

describe("drive: resuming", () => {
  it("stops at the failed re-ingest, and a second run starts there without redoing what finished", async () => {
    let fail = true;
    const handler: Handler = (cmd) => (fail && cmd.argv.join(" ") === "pnpm ingest run beta --shared" ? { code: 1, stdout: "checksum mismatch" } : happy(cmd));
    const h = harness({ handler });
    expect(await drive(h.rt, buildSteps())).toBe(1);
    expect(out(h)).toContain("STOPPED at reingest");
    expect(out(h)).toContain("checksum mismatch");
    expect(h.state.steps["reingest"].status).toBe("failed");
    expect(h.state.steps["reingest"].items["alpha"].status).toBe("done");
    expect(h.state.steps["reingest"].items["beta"].status).toBe("failed");
    expect(h.state.steps["install"].status).toBe("done");

    fail = false;
    h.calls.length = 0;
    expect(await drive(h.rt, buildSteps())).toBe(3);
    expect(h.calls).not.toContain("pnpm install");
    expect(h.calls).not.toContain("pnpm ingest run alpha --shared");
    expect(h.calls).toContain("pnpm ingest run beta --shared");
    expect(h.calls).toContain("pnpm ingest run gamma --shared");
  });

  it("round-trips through the saved JSON, as after a reboot", async () => {
    const handler: Handler = (cmd) => (cmd.argv.join(" ") === "pnpm ingest run gamma --shared" ? { code: 1, stdout: "x" } : happy(cmd));
    const h = harness({ handler });
    await drive(h.rt, buildSteps());
    const revived: State = JSON.parse(h.saved[h.saved.length - 1]);
    const h2 = harness({ handler: happy, state: revived });
    await drive(h2.rt, buildSteps());
    expect(h2.calls).not.toContain("pnpm ingest run alpha --shared");
    expect(h2.calls).toContain("pnpm ingest run gamma --shared");
  });

  it("--redo forgets a step and what it found; --skip records one done by hand", async () => {
    const h = harness({ handler: happy });
    await drive(h.rt, buildSteps());
    expect(h.state.data.toPublish).toBeDefined();
    h.calls.length = 0;
    await drive(h.rt, buildSteps(), { redo: ["status"] });
    expect(ran(h.calls, "publish-report --all --status").length).toBe(1);
    const h2 = harness({ handler: happy });
    await drive(h2.rt, buildSteps(), { skip: ["guard", "pin-bump", "install", "reingest"] });
    expect(ran(h2.calls, "ingest run")).toEqual([]);
    expect(h2.state.steps["reingest"].status).toBe("skipped");
  });
});

describe("drive: the pin bump", () => {
  it("rewrites only the repos that differ, installs each, and never moves one backwards", async () => {
    const h = harness({ handler: happy, probe: { pins: { "/repos/alpha": SPEC("0.21.0") } } });
    await drive(h.rt, buildSteps(), { only: "pin-bump" });
    expect(h.written).toEqual([
      ["/repos/beta", SPEC("0.21.0")],
      ["/repos/gamma", SPEC("0.21.0")],
    ]);
    expect(h.calls).toEqual(["pnpm -C /repos/beta install --no-frozen-lockfile", "pnpm -C /repos/gamma install --no-frozen-lockfile"]);

    const ahead = harness({ handler: happy, probe: { pins: { "/repos/alpha": SPEC("0.22.0") } } });
    expect(await drive(ahead.rt, buildSteps())).toBe(1);
    expect(out(ahead)).toContain("STOPPED at guard");
    expect(ahead.written).toEqual([]);
    expect(ahead.calls).toEqual([]);
  });
});

describe("drive: gates and hard stops", () => {
  const moved: Handler = (cmd) => {
    const text = cmd.argv.join(" ");
    if (text === "pnpm ingest check") return { code: 1, stdout: "  ✗ beta — output moved:\n      words 1 -> 2\n" };
    return happy(cmd);
  };

  it("the baseline gate shows what moved and waits; it baselines only those reports once acked", async () => {
    const h = harness({ handler: moved });
    expect(await drive(h.rt, buildSteps(), { only: "baseline" })).toBe(3);
    expect(h.state.steps["baseline"].status).toBe("awaiting-ack");
    expect(out(h)).toContain("pnpm ship --ack baseline");
    expect(ran(h.calls, "ingest baseline")).toEqual([]);

    // After the ack the baselines are written, and `ingest check` must then pass.
    const handler: Handler = (cmd) => {
      const text = cmd.argv.join(" ");
      if (text === "pnpm ingest check") return h.calls.some((c) => c.startsWith("pnpm ingest baseline beta")) ? { code: 0 } : { code: 1, stdout: "  ✗ beta — output moved:\n" };
      return happy(cmd);
    };
    const h2 = harness({ handler, state: h.state, acks: ["baseline"] });
    h2.rt.exec = ((orig) => async (c: Cmd, l: string) => {
      h.calls.push(c.argv.join(" "));
      return orig(c, l);
    })(h2.rt.exec);
    expect(await drive(h2.rt, buildSteps(), { only: "baseline" })).toBe(0);
    expect(h2.calls.filter((c) => c.startsWith("pnpm ingest baseline"))).toEqual(["pnpm ingest baseline beta --shared"]);
    expect(h2.state.data.acks).toEqual([]);
  });

  it("a missing baseline.json or a crash is not a diff to accept", async () => {
    const h = harness({ handler: (c) => (c.argv.join(" ") === "pnpm ingest check" ? { code: 1, stdout: "Error: Cannot find module" } : undefined) });
    expect(await drive(h.rt, buildSteps(), { only: "baseline" })).toBe(1);
    expect(out(h)).toContain("failed without naming a moved report");
  });

  it("the corpus gate accepts only the changed reports, after the ack", async () => {
    let accepted = false;
    const handler: Handler = (cmd) => {
      const text = cmd.argv.join(" ");
      if (text.startsWith("pnpm corpus accept")) accepted = true;
      if (text === "pnpm corpus check") return accepted ? { code: 0 } : { code: 1, stdout: "moved" };
      return undefined;
    };
    const h = harness({ handler });
    h.state.data.changed = ["beta"];
    expect(await drive(h.rt, buildSteps(), { only: "corpus" })).toBe(3);
    expect(ran(h.calls, "corpus accept")).toEqual([]);
    const h2 = harness({ handler, state: h.state, acks: ["corpus"] });
    expect(await drive(h2.rt, buildSteps(), { only: "corpus" })).toBe(0);
    expect(h2.calls).toContain("pnpm corpus accept beta");
    expect(ran(h2.calls, "corpus accept alpha")).toEqual([]);
  });

  it("stops after aliases generate when a report whose text did not move lost lines, and prints the restore", async () => {
    const h = harness({ probe: { numstat: [[0, 2, "reports/alpha/aliases.yaml"]] } });
    h.state.data.changed = ["beta"];
    expect(await drive(h.rt, buildSteps(), { only: "aliases" })).toBe(1);
    expect(out(h)).toContain("git checkout HEAD -- reports/alpha/aliases.yaml");
    expect(out(h)).toContain("pnpm ship --skip aliases");
    // The step's status is failed, so the next run does not skip it unless told.
    expect(h.state.steps["aliases"].status).toBe("failed");
  });

  it("runs every check, then stops once listing each failure with what to read, before anything is published", async () => {
    const handler: Handler = (cmd) => {
      const text = cmd.argv.join(" ");
      if (text === "pnpm quality check") return { code: 1, stdout: "  ✗ alpha bare-footnote-marker 5 > 4" };
      if (text === "pnpm test") return { code: 1, stdout: "FAIL tests/x.test.ts" };
      return happy(cmd);
    };
    const h = harness({ handler, ctx: { yes: true } });
    expect(await drive(h.rt, buildSteps())).toBe(1);
    const text = out(h);
    expect(text).toContain("checks: 2 failed (quality-check, tests)");
    expect(text).toContain("pnpm quality report --diff origin/main");
    expect(text).toContain("bare-footnote-marker 5 > 4");
    expect(ran(h.calls, "--no-reindex")).toEqual([]);
    expect(h.calls).toContain("./scripts/verify.sh"); // later checks still ran
    // A fixed check is rerun alone: the passes are remembered.
    h.calls.length = 0;
    const h2 = harness({ handler: happy, state: h.state, ctx: { yes: true } });
    await drive(h2.rt, buildSteps());
    expect(h2.calls).not.toContain("pnpm aliases check");
    expect(h2.calls).toContain("pnpm quality check");
  });

  it("refuses to publish a tree that is not committed, unless told", async () => {
    const dirty = { "/site": [" M reports/beta/aliases.yaml"] };
    const h = harness({ handler: happy, probe: { dirty }, ctx: { yes: true } });
    h.state.steps["guard"] = { status: "done", items: {} };
    expect(await drive(h.rt, buildSteps(), { from: "committed" })).toBe(1);
    expect(out(h)).toContain("what would be published is not what main records");
    expect(ran(h.calls, "--no-reindex")).toEqual([]);
    const h2 = harness({ handler: happy, probe: { dirty }, ctx: { yes: true, allowDirty: true } });
    expect(await drive(h2.rt, buildSteps(), { from: "committed" })).toBe(0);
  });

  it("stops before publishing when the D1 estimate does not fit today's quota", async () => {
    const handler: Handler = (cmd) => (cmd.argv.join(" ").includes("--dry-run") ? { stdout: "  estimated D1 row writes: 60,000 (x)" } : happy(cmd));
    const h = harness({ handler, ctx: { yes: true }, probe: { used: 50_000 } });
    expect(await drive(h.rt, buildSteps(), { from: "status" })).toBe(1);
    expect(out(h)).toContain("needs about 132,000 row writes");
    expect(out(h)).toContain("50,000 writes");
    expect(h.state.steps["d1-estimate"].status).toBe("failed");
    expect(ran(h.calls, "--no-reindex")).toEqual([]);
    expect(ran(h.calls, "deploy-cloudflare")).toEqual([]);
  });

  it("counts an old dry run's corpus scan when it prints no read estimate", async () => {
    const h = harness({ handler: happy, ctx: { yes: true }, probe: { used: 0, reads: 0 } });
    await drive(h.rt, buildSteps(), { from: "status" });
    // beta and gamma: no read estimate printed, so 45,000 each + 4,000 each for verify-prod
    expect(h.state.data.estimate?.reads).toBe(98_000);
    expect(out(h)).toContain("98,000 rows read");
  });

  it("stops before publishing when the reads do not fit", async () => {
    const handler: Handler = (cmd) => (cmd.argv.join(" ").includes("--dry-run") ? { stdout: "  estimated D1 row writes: 10 (x)\n  estimated D1 rows read: 60,000 (x)" } : happy(cmd));
    // 4.38M used leaves 120,000 after the Worker's 500,000 reserve; 2 x 64,000 + 10% does not fit
    const h = harness({ handler, ctx: { yes: true }, probe: { used: 0, reads: 4_380_000 } });
    expect(await drive(h.rt, buildSteps(), { from: "status" })).toBe(1);
    expect(h.state.data.estimate?.reads).toBe(128_000);
    expect(out(h)).toContain("140,800 rows read");
    expect(h.state.steps["d1-estimate"].status).toBe("failed");
    expect(ran(h.calls, "--no-reindex")).toEqual([]);
  });

  it("stops before the dry runs when today's reads are already spent", async () => {
    const h = harness({ handler: happy, ctx: { yes: true }, probe: { used: 0, reads: 4_800_000 } });
    expect(await drive(h.rt, buildSteps(), { from: "status" })).toBe(1);
    expect(out(h)).toContain("already (nearly) spent");
    expect(ran(h.calls, "--dry-run")).toEqual([]);
  });

  it("a failed reindex (quota spent mid-run) leaves the finished reports done and resumes at the next", async () => {
    let quotaSpent = true;
    const handler: Handler = (cmd) => (quotaSpent && cmd.argv.join(" ") === "./scripts/reindex-search.sh gamma" ? { code: 1, stdout: "D1 code 7500" } : happy(cmd));
    const h = harness({ handler, ctx: { yes: true } });
    expect(await drive(h.rt, buildSteps())).toBe(1);
    expect(out(h)).toContain("D1 code 7500");
    expect(h.state.steps["reindex"].items["beta"].status).toBe("done");
    quotaSpent = false;
    h.calls.length = 0;
    expect(await drive(h.rt, buildSteps())).toBe(0);
    expect(ran(h.calls, "reindex-search.sh beta")).toEqual([]);
    expect(ran(h.calls, "reindex-search.sh gamma").length).toBe(1);
    expect(ran(h.calls, "--no-reindex")).toEqual([]); // publish is not repeated
  });

  it("nothing to publish: no D1 writes, no publish commands, still deploys and verifies", async () => {
    const handler: Handler = (cmd) => (cmd.argv.join(" ").includes("publish-report --all --status") && !cmd.argv.includes("--fail-on-drift") ? { stdout: "  alpha  aaaaaaaaaaaa  aaaaaaaaaaaa  current\nall 3 report(s) are serving what this checkout would publish." } : undefined);
    const h = harness({ handler, ctx: { yes: true } });
    expect(await drive(h.rt, buildSteps())).toBe(0);
    expect(h.state.data.estimate?.total).toBe(0);
    expect(ran(h.calls, "--no-reindex")).toEqual([]);
    expect(h.calls).toContain("./scripts/deploy-cloudflare.sh");
  });
});
