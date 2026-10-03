/**
 * `pnpm ship` (reportsthatmatter-0c6i): the post-merge half of a release as a resumable, step-by-step driver.
 *
 * Two integrations (v0.20.0, v0.21.0) were done by hand from docs/release-checklist.md; the same things went wrong
 * each time (pin bumps across 13 repos, one re-ingest per report, aliases dropping lines, budgets, publishing with
 * --no-reindex then reindexing only what changed under D1's 100k writes a day). This file is the whole procedure as
 * data: an ordered list of steps, each with the exact commands it runs, what to read when it fails, and (for the
 * few that need a human decision) a gate.
 *
 * What it does not do: decide anything. It never merges, resolves a conflict, commits, pushes, raises a budget,
 * accepts a baseline or an alias reuse without an explicit `--ack`, and runs nothing that touches production
 * without `--yes`.
 *
 * Everything here is pure or takes its side effects through `Runtime` (exec, state store, output), so tests/ship.test.ts
 * runs the whole driver against a fake site with no network, no D1 and no git.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------------------------------------------
// Context, commands, state

export type Repo = { dir: string; ids: string[]; shared: boolean };

export type Ctx = {
  /** The site checkout this runs in. */
  root: string;
  /** The site's `@rtm/ingest` spec: what every report repo must pin (`github:reportsthatmatter/ingest#v0.21.0`). */
  spec: string;
  /** `0.21.0`. */
  version: string;
  /** Report ids in manifest order, and the repos that hold them. */
  ids: string[];
  repos: Repo[];
  /** Production origin: `--base`. */
  base: string;
  /** The ref `aliases generate` renders the old text from, resolved to a sha on the first run and kept in the state. */
  oldRef: string;
  /** `--shared`: the integrator's deliberate opt-in to write the shared report checkouts. */
  shared: boolean;
  /** `--yes`: allow steps that touch production. */
  yes: boolean;
  /** `--allow-dirty`: skip the "everything is committed" gate. */
  allowDirty: boolean;
  /** Daily D1 row-write limit (free tier 100,000). */
  d1Limit: number;
  /** Does `file` (relative to the site root) mention `needle`? Used to run a step only where its tool exists. */
  has: (file: string, needle: string) => boolean;
};

export type Cmd = {
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Read RTM_PUBLISH_SECRET from ~/.rtm-publish-secret into the environment; never printed. */
  secret?: boolean;
};

export type ExecResult = { code: number; stdout: string; log: string; seconds: number };

export type ItemState = { status: "done" | "failed"; at: string; log?: string; note?: string };
export type StepStatus = "pending" | "done" | "failed" | "awaiting-ack" | "awaiting-yes" | "skipped";
export type StepState = { status: StepStatus; items: Record<string, ItemState>; at?: string; message?: string };

export type State = {
  version: 1;
  /** The pin this run ships; a state for another pin is refused. */
  spec: string;
  oldRef: string;
  startedAt: string;
  steps: Record<string, StepState>;
  /** Facts one step finds for a later one. */
  data: {
    /** Reports whose served text will differ from main (the site's reports/<id>/ after aggregate). */
    changed?: string[];
    /** Reports whose `ingest check` moved against baseline.json. */
    baselineIds?: string[];
    /** Reports `publish-report --all --status` lists as differing from what is served. */
    toPublish?: string[];
    estimate?: { total: number; perReport: Record<string, number>; headroom: number | null; limit: number };
    acks?: string[];
  };
};

export const freshState = (spec: string, oldRef: string, now: string): State => ({ version: 1, spec, oldRef, startedAt: now, steps: {}, data: {} });

/** A hard stop: what failed and what to read, then exit. `code` 3 is "waiting for you", not a failure. */
export class Stop extends Error {
  constructor(
    message: string,
    public read: string[] = [],
    public code: 1 | 3 = 1,
    public status: StepStatus = "failed"
  ) {
    super(message);
  }
}

export interface Runtime {
  ctx: Ctx;
  state: State;
  exec(cmd: Cmd, label: string): Promise<ExecResult>;
  /** Pure reads of the working tree and git, injected so tests need no git. */
  probe: Probe;
  save(state: State): void;
  out(line: string): void;
  now(): string;
  acked(step: string): boolean;
}

export interface Probe {
  /** package.json `@rtm/ingest` spec of a repo (or the site), null when absent. */
  pinOf(dir: string): string | null;
  writePin(dir: string, spec: string): void;
  /** `git status --porcelain` lines of a repo, or null when not a git repo. */
  status(dir: string, paths?: string[]): string[] | null;
  branch(dir: string): string | null;
  /** The remote's default branch (origin/HEAD): \`main\` for most repos, \`master\` for leveson and columbia. */
  defaultBranch(dir: string): string;
  /** Commits on HEAD not on origin's default branch (as last fetched). */
  unpushed(dir: string): number | null;
  /** Commits on origin's default branch (as last fetched) not on HEAD. */
  behind(dir: string): number | null;
  /** `git diff --numstat` rows [added, removed, path] for the paths against HEAD. */
  numstat(dir: string, paths: string[]): Array<[number, number, string]>;
  sha(file: string): string | null;
  /** Rows written today (UTC) from Cloudflare analytics, when the credentials are set; else null. */
  rowsWrittenToday(): Promise<number | null>;
}

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers (tested directly)

export const versionOf = (spec: string | null | undefined): string | null => spec?.match(/#v?(\d+\.\d+\.\d+(?:[-+][\w.]+)?)$/)?.[1] ?? spec?.match(/^[~^=v]*(\d+\.\d+\.\d+)$/)?.[1] ?? null;

/** -1, 0, 1 by numeric major.minor.patch. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[-+]/)[0].split(".").map(Number);
  const pb = b.split(/[-+]/)[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  return 0;
}

export type PinRow = { dir: string; ids: string[]; pinned: string | null; action: "ok" | "bump" | "ahead" | "missing" };

/** Where every report repo's pin stands against the site's. `ahead` is a hard stop: a pin never moves backwards. */
export function pinTable(ctx: Pick<Ctx, "spec" | "version" | "repos">, pinOf: (dir: string) => string | null): PinRow[] {
  return ctx.repos.map((r) => {
    const pinned = pinOf(r.dir);
    const v = versionOf(pinned);
    const action: PinRow["action"] = pinned === null ? "missing" : pinned === ctx.spec ? "ok" : v && compareVersions(v, ctx.version) > 0 ? "ahead" : "bump";
    return { dir: r.dir, ids: r.ids, pinned, action };
  });
}

/** `pnpm ingest check` prints `✗ <id> — output moved:` for each report that differs from its baseline.json. */
export function movedReports(output: string): string[] {
  const plain = output.replace(/\x1b\[[0-9;]*m/g, "");
  return [...plain.matchAll(/^\s*✗\s+([a-z0-9][\w-]*)\s+—\s+output moved/gim)].map((m) => m[1]);
}

/** Any `✗` line of a check's output that names a report: for the failure summary. */
export function failedLines(output: string, max = 12): string[] {
  const plain = output.replace(/\x1b\[[0-9;]*m/g, "");
  return plain.split("\n").filter((l) => /✗/.test(l)).slice(0, max).map((l) => l.trim());
}

/** `publish-report --all --status` rows: `  <id>  <local>  <served>  DRIFT: republish | not published (deploy copy) | unknown`. */
export function driftedReports(output: string): string[] {
  const plain = output.replace(/\x1b\[[0-9;]*m/g, "");
  return [...plain.matchAll(/^\s+([a-z0-9][\w-]*)\s+\S+\s+\S+\s+(?:DRIFT|not published)/gm)].map((m) => m[1]);
}

/** Reports whose served version could not be read ("could not be read: a, b"). */
export function unreadReports(output: string): string[] {
  const m = output.replace(/\x1b\[[0-9;]*m/g, "").match(/could not be read:\s*([^\n]+)/);
  return m ? m[1].split(/[,\s]+/).filter(Boolean) : [];
}

/** `publish-report <id> --dry-run` prints `estimated D1 row writes: 1,234 (...)`. */
export function estimatedWrites(output: string): number | null {
  const m = output.match(/estimated D1 row writes:\s*([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

export type D1Verdict = { ok: boolean; headroom: number | null; needed: number; lines: string[] };

/** Does the reindex fit today's D1 quota? 10% margin on the estimate; usage unknown is said, not guessed. */
export function d1Fits(total: number, used: number | null, limit: number): D1Verdict {
  const needed = Math.ceil(total * 1.1);
  const headroom = used === null ? null : Math.max(0, limit - used);
  const lines = [`estimated row writes for the reindex and version rows: ${total.toLocaleString()} (with a 10% margin: ${needed.toLocaleString()}) against a daily limit of ${limit.toLocaleString()}`];
  if (used === null) {
    lines.push("today's usage is unknown (set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to read it); writes by a peer's publish today are not counted");
    return { ok: needed <= limit, headroom, needed, lines };
  }
  lines.push(`already written today: ${used.toLocaleString()}; headroom ${headroom!.toLocaleString()}`);
  return { ok: needed <= headroom!, headroom, needed, lines };
}

/**
 * The aliases rule from the v0.21.0 review: after `generate`, a report whose text did not move must show no removed
 * lines in `git diff` (#264 starts from `--old-ref`'s file and discards committed additions), and no report may lose
 * a line of published-ids.txt (it only grows).
 */
export function aliasProblems(rows: Array<[number, number, string]>, moved: Set<string>): Array<{ id: string; file: string; removed: number; moved: boolean; restore: string }> {
  const out = [];
  for (const [, removed, path] of rows) {
    const m = path.match(/reports\/([^/]+)\/(aliases\.yaml|published-ids\.txt)$/);
    if (!m || removed === 0) continue;
    const [, id, file] = m;
    const isMoved = moved.has(id);
    if (file === "aliases.yaml" && isMoved) continue; // a moved report's alias lines are read, not refused
    out.push({ id, file: path, removed, moved: isMoved, restore: `git checkout HEAD -- ${path}` });
  }
  return out;
}

/** Steps' ids in order, for `--from`, `--redo`, `--ack`. */
export const STEP_ORDER = ["guard", "pin-bump", "install", "reingest", "baseline", "aggregate", "aliases", "prerender", "corpus", "editorial", "ratchet", "checks", "committed", "status", "d1-estimate", "publish", "deploy", "reindex", "seed", "verify-prod", "record"] as const;
export type StepId = (typeof STEP_ORDER)[number];

// ---------------------------------------------------------------------------------------------------------------
// Steps

export type Step = {
  id: StepId;
  title: string;
  /** read: touches nothing outside build/; write: edits working trees (reports, site) on this machine; prod: touches production. */
  kind: "read" | "write" | "prod";
  /** Exact commands, as the plan prints them. `state` fills in lists a previous step found. */
  describe(ctx: Ctx, state: State, probe: Probe): string[];
  run(rt: Runtime): Promise<void>;
};

const pnpm = (...argv: string[]): Cmd => ({ argv: ["pnpm", ...argv] });
const show = (c: Cmd) => `${c.secret ? "RTM_PUBLISH_SECRET=$(cat ~/.rtm-publish-secret) " : ""}${c.cwd ? `(cd ${c.cwd} && ` : ""}${c.argv.join(" ")}${c.cwd ? ")" : ""}`;
const sharedArg = (ctx: Ctx) => (ctx.shared ? ["--shared"] : []);
const tail = (text: string, n = 15) => text.replace(/\x1b\[[0-9;]*m/g, "").trim().split("\n").slice(-n).join("\n");

/** Runs one command as a resumable item: done items are skipped on resume, a failure is recorded and stops. */
async function item(rt: Runtime, step: StepId, key: string, cmd: Cmd, read: string[], opts: { allowFail?: boolean } = {}): Promise<ExecResult> {
  const st = (rt.state.steps[step] ??= { status: "pending", items: {} });
  const prev = st.items[key];
  if (prev?.status === "done") {
    rt.out(`  · ${key}: done at ${prev.at} (resumed)`);
    return { code: 0, stdout: "", log: prev.log ?? "", seconds: 0 };
  }
  const result = await rt.exec(cmd, `${step}-${key}`);
  if (result.code === 0 || opts.allowFail) {
    rt.out(`  ${result.code === 0 ? "✓" : "·"} ${key} (${result.seconds.toFixed(0)}s)  ${result.log}`);
    if (result.code === 0) {
      st.items[key] = { status: "done", at: rt.now(), log: result.log };
      rt.save(rt.state);
    }
    return result;
  }
  st.items[key] = { status: "failed", at: rt.now(), log: result.log };
  rt.save(rt.state);
  throw new Stop(`${step}: \`${show(cmd)}\` exited ${result.code}\n${tail(result.stdout)}`, [...read, `full log: ${result.log}`]);
}

/** Marks an item done without a command (for a step's own checks). */
function mark(rt: Runtime, step: StepId, key: string, note?: string) {
  const st = (rt.state.steps[step] ??= { status: "pending", items: {} });
  st.items[key] = { status: "done", at: rt.now(), note };
  rt.save(rt.state);
}

const gateCheck = (rt: Runtime, step: StepId) => rt.acked(step);

const REPORT_READS = {
  ingest: ["pnpm ingest check            (the diff per report)", "git -C <report repo> diff --stat   (what the re-ingest moved)"],
};

/** The guard's checks, read-only; the plan evaluates them too, so it says in advance whether the run would stop at once. */
export function guardProblems(ctx: Ctx, probe: Probe, resumed = false): string[] {
  const problems: string[] = [];
  const branch = probe.branch(ctx.root);
  if (branch !== probe.defaultBranch(ctx.root)) problems.push(`site is on ${branch ?? "no branch"}, not ${probe.defaultBranch(ctx.root)}: ship from the site's main, after the pin-bump PR has merged`);
  const behind = probe.behind(ctx.root);
  if (behind) problems.push(`site main is ${behind} commit(s) behind origin's default branch (as last fetched): \`git pull --ff-only\` first, or the aliases and the deploy are built from old files`);
  const dirty = probe.status(ctx.root, ["."])?.filter((l) => !/ (build|assets\/generated)\//.test(l)) ?? [];
  if (dirty.length && !resumed) problems.push(`site tree is not clean (${dirty.length} path(s): ${dirty.slice(0, 4).join("; ")}${dirty.length > 4 ? "; ..." : ""})`);
  for (const row of pinTable(ctx, probe.pinOf)) {
    const where = `${row.dir} (${row.ids.join(", ")})`;
    if (row.action === "missing") problems.push(`${where}: no @rtm/ingest pin`);
    if (row.action === "ahead") problems.push(`${where} pins ${versionOf(row.pinned)}, ahead of the site's ${ctx.version}: merge the site's pin bump first; a pin never moves backwards`);
  }
  for (const repo of ctx.repos) {
    const b = probe.branch(repo.dir);
    if (b === null) problems.push(`${repo.dir} is not a git repo (clone it alongside the site; reports/manifest.yaml says where)`);
    else if (b !== probe.defaultBranch(repo.dir)) problems.push(`${repo.dir} is on ${b}, not ${probe.defaultBranch(repo.dir)} (a peer's branch? never switch a shared checkout: use a worktree)`);
    const st = probe.status(repo.dir);
    if (st?.length && !resumed) problems.push(`${repo.dir} has uncommitted changes (${st.slice(0, 3).join("; ")}${st.length > 3 ? "; ..." : ""}): peer noise or a half-done run; read \`git -C ${repo.dir} status\``);
  }
  if (!ctx.ids.length) problems.push("reports/manifest.yaml lists no reports");
  return problems;
}

export function buildSteps(): Step[] {
  const steps: Step[] = [
    {
      id: "guard",
      title: "The tree is ready: site and report repos on main, clean, pins in order",
      kind: "read",
      describe: (ctx) => [
        `site ${ctx.root}: on main, clean, \`@rtm/ingest\` pin is ${ctx.spec}`,
        `${ctx.repos.length} report repos (${ctx.ids.length} reports): on main, clean, no pin ahead of the site's`,
        `${ctx.shared ? "--shared given: the shared report checkouts will be written" : "no --shared: a shared report checkout makes the re-ingest refuse (use RTM_REPORT_DIRS worktrees, or pass --shared as the integrator)"}`,
        `aliases are rendered against ${ctx.oldRef}`,
      ],
      async run(rt) {
        const { ctx } = rt;
        const problems = guardProblems(ctx, rt.probe, rt.state.steps["guard"]?.status === "done");
        if (problems.length) throw new Stop(`guard: ${problems.length} problem(s)\n${problems.map((p) => `  ✗ ${p}`).join("\n")}`, ["Fix each, then re-run `pnpm ship`; the state file keeps what is already done."]);
        rt.out(`  ✓ site on main, ${ctx.repos.length} report repos on main and clean, no pin ahead of ${ctx.spec}`);
      },
    },
    {
      id: "pin-bump",
      title: "Bump the @rtm/ingest pin in every report repo to the site's",
      kind: "write",
      describe: (ctx, _s, probe) => {
        const rows = pinTable(ctx, probe.pinOf);
        const lines = rows.map((r) => (r.action === "bump" ? `${r.dir}/package.json: "@rtm/ingest" ${r.pinned} -> "${ctx.spec}", then CI=true pnpm -C ${r.dir} install` : `${r.dir}: ${r.action === "ok" ? "already at the site's pin, untouched" : r.action === "ahead" ? "AHEAD of the site's pin: the guard stops" : "no pin: the guard stops"}`));
        return lines;
      },
      async run(rt) {
        const { ctx, probe } = rt;
        for (const row of pinTable(ctx, probe.pinOf)) {
          const key = row.dir;
          if (rt.state.steps["pin-bump"]?.items[key]?.status === "done") continue;
          if (row.action === "bump") {
            probe.writePin(row.dir, ctx.spec);
            rt.out(`  ✓ ${row.dir}: ${row.pinned} → ${ctx.spec}`);
            await item(rt, "pin-bump", `install ${row.dir.split("/").pop()}`, { argv: ["pnpm", "-C", row.dir, "install"], env: { CI: "true" } }, [`pnpm -C ${row.dir} install  (the lockfile and node_modules must follow the pin)`]);
          } else rt.out(`  = ${row.dir}: already ${ctx.spec}`);
          mark(rt, "pin-bump", key);
        }
      },
    },
    {
      id: "install",
      title: "Site: install, and check every repo's installed @rtm/ingest is the one it pins",
      kind: "write",
      describe: () => ["CI=true pnpm install", "pnpm ingest preflight"],
      async run(rt) {
        await item(rt, "install", "install", { argv: ["pnpm", "install"], env: { CI: "true" } }, ["pnpm install  (network? a lockfile conflict from a merge?)"]);
        await item(rt, "install", "preflight", pnpm("ingest", "preflight"), ["pnpm ingest preflight prints the `pnpm -C <repo> install` for each stale repo"]);
      },
    },
    {
      id: "reingest",
      title: "Re-ingest every report once at the pin",
      kind: "write",
      describe: (ctx) => ctx.ids.map((id) => `pnpm ingest run ${id}${ctx.shared ? " --shared" : ""}`),
      async run(rt) {
        for (const id of rt.ctx.ids) await item(rt, "reingest", id, pnpm("ingest", "run", id, ...sharedArg(rt.ctx)), [`pnpm ingest run ${id}   (a checksum mismatch, a correction matching 0 times, a missing source PDF)`, ...REPORT_READS.ingest]);
      },
    },
    {
      id: "baseline",
      title: "Read what moved against each baseline.json, then baseline exactly those reports (gate)",
      kind: "write",
      describe: (ctx, s) => [
        "pnpm ingest check                 (expected to fail for every report whose output moved)",
        `GATE: prints the reports that moved and \`git diff --stat\` of each; stops until \`pnpm ship --ack baseline\``,
        s.data.baselineIds ? `then: ${s.data.baselineIds.map((id) => `pnpm ingest baseline ${id}${ctx.shared ? " --shared" : ""}`).join("; ") || "(nothing moved)"}` : "then: pnpm ingest baseline <each report that moved>, and `pnpm ingest check` must pass",
      ],
      async run(rt) {
        const { ctx } = rt;
        const st = (rt.state.steps["baseline"] ??= { status: "pending", items: {} });
        if (!rt.state.data.baselineIds) {
          const r = await rt.exec(pnpm("ingest", "check"), "baseline-check");
          const moved = movedReports(r.stdout);
          if (r.code !== 0 && !moved.length) throw new Stop(`baseline: \`pnpm ingest check\` failed without naming a moved report\n${tail(r.stdout)}`, [`full log: ${r.log}`, "A missing baseline.json or a crash is not a diff to accept."]);
          rt.state.data.baselineIds = moved;
          rt.save(rt.state);
          if (!moved.length) {
            rt.out("  ✓ every report matches its baseline.json: nothing to baseline");
            return;
          }
          rt.out(`  ${moved.length} report(s) moved against their baseline: ${moved.join(", ")}`);
          for (const id of moved) {
            const repo = ctx.repos.find((x) => x.ids.includes(id));
            if (repo) {
              const stat = await rt.exec({ argv: ["git", "-C", repo.dir, "diff", "--stat", "--", "full.md", "baseline.json"] }, `baseline-diff-${id}`);
              rt.out(`  ${id}: ${tail(stat.stdout, 4).replace(/\n/g, "\n    ")}`);
            }
          }
        }
        const moved = rt.state.data.baselineIds ?? [];
        if (!moved.length) return;
        if (!gateCheck(rt, "baseline")) {
          throw new Stop(
            `baseline: ${moved.length} report(s) moved and need a read before they are baselined`,
            [
              `pnpm ingest check                    (the lines that moved, per report; log: build/ship/logs/baseline-check.log)`,
              ...moved.map((id) => `git -C ${ctx.repos.find((r) => r.ids.includes(id))?.dir ?? id} diff -- full.md | less     (${id})`),
              "Never baseline to quieten the check. Then: pnpm ship --ack baseline",
            ],
            3,
            "awaiting-ack"
          );
        }
        for (const id of moved) await item(rt, "baseline", `baseline ${id}`, pnpm("ingest", "baseline", id, ...sharedArg(ctx)), [`pnpm ingest baseline ${id}`]);
        const after = await rt.exec(pnpm("ingest", "check"), "baseline-recheck");
        if (after.code !== 0) throw new Stop(`baseline: \`pnpm ingest check\` still fails after the baselines\n${tail(after.stdout)}`, [`full log: ${after.log}`]);
        st.message = `${moved.length} baselined: ${moved.join(", ")}`;
      },
    },
    {
      id: "aggregate",
      title: "Copy each report's full.md and PROCESSING.md into the site; find which reports changed",
      kind: "write",
      describe: (ctx) => [`pnpm ingest aggregate${ctx.shared ? " --shared" : ""}`, "changed = reports whose reports/<id>/full.md or PROCESSING.md now differs from HEAD (recorded in the state)"],
      async run(rt) {
        await item(rt, "aggregate", "aggregate", pnpm("ingest", "aggregate", ...sharedArg(rt.ctx)), ["pnpm ingest aggregate (a report repo without full.md?)"]);
        const dirty = rt.probe.status(rt.ctx.root, ["reports"]) ?? [];
        const changed = rt.ctx.ids.filter((id) => dirty.some((l) => new RegExp(`reports/${id}/(full|PROCESSING)\\.md$`).test(l)));
        rt.state.data.changed = changed;
        rt.save(rt.state);
        rt.out(`  ${changed.length} of ${rt.ctx.ids.length} report text(s) differ from main: ${changed.join(", ") || "none"}`);
        rt.out(`  unchanged (pin bump only): ${rt.ctx.ids.filter((i) => !changed.includes(i)).join(", ") || "none"}`);
      },
    },
    {
      id: "aliases",
      title: "Generate aliases once against the final text; refuse a report that lost lines",
      kind: "write",
      describe: (ctx) => [
        `pnpm aliases generate --all --old-ref ${ctx.oldRef}`,
        "then, from `git diff --numstat`: a report whose text did not move must show no removed lines in aliases.yaml, and no report may lose a published-ids.txt line; otherwise STOP with the `git checkout HEAD -- <file>` to restore",
        "a section id that was REUSED stops `generate` itself; read `pnpm marks check <id>`, then `pnpm aliases generate <id> --accept-reuse` by hand",
      ],
      async run(rt) {
        const { ctx } = rt;
        const r = await item(rt, "aliases", "generate", pnpm("aliases", "generate", "--all", "--old-ref", ctx.oldRef), [
          "pnpm aliases generate prints each report's moves, losses and REUSED ids",
          "REUSED id: nothing in editorial or the queue should cite it; `pnpm marks check <id>` (D1 marks), then `pnpm aliases generate <id> --accept-reuse`",
        ]);
        const paths = ctx.ids.flatMap((id) => [`reports/${id}/aliases.yaml`, `reports/${id}/published-ids.txt`]);
        const problems = aliasProblems(rt.probe.numstat(ctx.root, paths), new Set(rt.state.data.changed ?? []));
        if (problems.length) {
          throw new Stop(
            `aliases: ${problems.length} file(s) lost lines they must keep`,
            [
              ...problems.map((p) => `${p.id}: ${p.removed} removed line(s) in ${p.file}${p.moved ? "" : " (its text did not move)"}\n      ${p.restore}`),
              "Restore, check `pnpm aliases check` after the prerender, then: pnpm ship --skip aliases   (do not re-run generate: it removes them again; bead: base generate on HEAD, not --old-ref)",
            ],
            1
          );
        }
        void r;
      },
    },
    {
      id: "prerender",
      title: "Pre-render (assets/generated/)",
      kind: "write",
      describe: () => ["pnpm prerender"],
      async run(rt) {
        await item(rt, "prerender", "prerender", pnpm("prerender"), ["pnpm prerender"]);
      },
    },
    {
      id: "corpus",
      title: "Corpus check: read what moved, accept those reports (gate)",
      kind: "write",
      describe: (ctx, s) => [
        "pnpm corpus check                 (expected to fail for every report whose ids or sections moved)",
        "GATE: stops until `pnpm ship --ack corpus`",
        `then: ${(s.data.changed ?? []).map((id) => `pnpm corpus accept ${id}`).join("; ") || "pnpm corpus accept <each changed report>"}   and \`pnpm corpus check\` must pass`,
      ],
      async run(rt) {
        const first = await rt.exec(pnpm("corpus", "check"), "corpus-check");
        if (first.code === 0) {
          rt.out("  ✓ corpus check passes: nothing to accept");
          return;
        }
        const changed = rt.state.data.changed ?? [];
        if (!rt.acked("corpus")) {
          throw new Stop("corpus: ids or sections moved", ["pnpm corpus check   (each moved section, and why: folded by the sliver rule, renamed, gone)", `log: ${first.log}`, "Every vanished id needs an alias (the aliases step); every new section is read. Then: pnpm ship --ack corpus"], 3, "awaiting-ack");
        }
        for (const id of changed) await item(rt, "corpus", `accept ${id}`, pnpm("corpus", "accept", id), [`pnpm corpus accept ${id}`]);
        const after = await rt.exec(pnpm("corpus", "check"), "corpus-recheck");
        if (after.code !== 0) throw new Stop(`corpus: still failing after accepting ${changed.join(", ")}\n${tail(after.stdout)}`, [`log: ${after.log}`, "A report outside the changed set moved: that is a defect to read, not accept."]);
      },
    },
    {
      id: "editorial",
      title: "Editorial quotes and ids, posting queue",
      kind: "write",
      describe: (ctx) => [
        "pnpm editorial                    (a broken quote or id in editorial/<id>.yaml fails: fix the yaml in a PR)",
        ctx.has("scripts/posts.mjs", "--check") ? "pnpm posts --check               (a queued excerpt whose paragraph id moved fails)" : "(pnpm posts --check is not on this checkout yet: skipped)",
        ctx.has("scripts/posts.mjs", "--drop-stale") ? "GATE on a stale queue item: `pnpm ship --ack editorial` runs `pnpm posts --drop-stale`, then `pnpm posts --check`" : "",
        ctx.has("scripts/marks.mjs", "check") ? "pnpm marks check --all             (read-only D1: every saved mark still resolves; offline needs --baseline)" : "(pnpm marks check is not on this checkout yet: skipped)",
      ].filter(Boolean),
      async run(rt) {
        const { ctx } = rt;
        await item(rt, "editorial", "editorial", pnpm("editorial"), ["pnpm editorial lists every quote that is no longer verbatim and every citation that no longer resolves", "Paragraph ids move with the re-ingest; fix editorial/<id>.yaml (agent protocol rule 7)"]);
        if (ctx.has("scripts/posts.mjs", "--check")) {
          const r = await rt.exec(pnpm("posts", "--check"), "editorial-posts-check");
          if (r.code !== 0) {
            if (ctx.has("scripts/posts.mjs", "--drop-stale") && rt.acked("editorial")) {
              await item(rt, "editorial", "drop-stale", pnpm("posts", "--drop-stale"), ["pnpm posts --drop-stale"]);
              await item(rt, "editorial", "posts-recheck", pnpm("posts", "--check"), ["pnpm posts --check"]);
            } else {
              throw new Stop("editorial: the posting queue cites a paragraph id that is gone", ["pnpm posts --check   (log: " + r.log + ")", "A stale item is dropped, not moved: marketing/queue.yaml. Then: pnpm ship --ack editorial"], 3, "awaiting-ack");
            }
          } else rt.out("  ✓ pnpm posts --check");
        }
        if (ctx.has("scripts/marks.mjs", "check")) {
          await item(rt, "editorial", "marks", pnpm("marks", "check", "--all"), ["pnpm marks check <id>   (a saved mark whose paragraph id no longer resolves)", "Reads production D1; needs wrangler logged in. Offline: pnpm marks check --all --baseline <previous prerender>"]);
        }
      },
    },
    {
      id: "ratchet",
      title: "Lock in improvements (budgets only ever go down here)",
      kind: "write",
      describe: (ctx) => [
        "pnpm quality ratchet",
        ctx.has("scripts/ingest/cli.ts", "anchors") ? "pnpm ingest anchors --all --ratchet" : "(pnpm ingest anchors is not on this checkout yet: skipped)",
        "A budget that must go UP (a regression you have read and accept) is never automatic: edit the budget yaml with a `# why:` line in a PR",
      ],
      async run(rt) {
        await item(rt, "ratchet", "quality", pnpm("quality", "ratchet"), ["pnpm quality ratchet"]);
        if (rt.ctx.has("scripts/ingest/cli.ts", "anchors")) await item(rt, "ratchet", "anchors", pnpm("ingest", "anchors", "--all", "--ratchet"), ["pnpm ingest anchors --all --ratchet"]);
      },
    },
    {
      id: "checks",
      title: "Every check; any failure is a hard stop that says what to read",
      kind: "read",
      describe: (ctx) =>
        checkList(ctx)
          .map((c) => show(c.cmd))
          .concat(["(all run even after a failure, so one stop lists every failing check)"]),
      async run(rt) {
        const failures: Array<{ name: string; cmd: Cmd; read: string[]; log: string; out: string }> = [];
        for (const c of checkList(rt.ctx)) {
          const key = c.name;
          if (rt.state.steps["checks"]?.items[key]?.status === "done") {
            rt.out(`  · ${key}: passed at ${rt.state.steps["checks"].items[key].at} (resumed)`);
            continue;
          }
          const r = await rt.exec(c.cmd, `checks-${key}`);
          if (r.code === 0) {
            rt.out(`  ✓ ${key} (${r.seconds.toFixed(0)}s)`);
            mark(rt, "checks", key);
          } else {
            rt.out(`  ✗ ${key} (${r.seconds.toFixed(0)}s)`);
            failures.push({ name: key, cmd: c.cmd, read: c.read, log: r.log, out: r.stdout });
          }
        }
        if (failures.length) {
          const lines = failures.flatMap((f) => [`✗ ${f.name}: ${show(f.cmd)}`, ...failedLines(f.out, 6).map((l) => `      ${l}`), ...f.read.map((r) => `    read: ${r}`), `    log: ${f.log}`]);
          throw new Stop(`checks: ${failures.length} failed (${failures.map((f) => f.name).join(", ")}). Nothing is published until all pass.`, lines);
        }
      },
    },
    {
      id: "committed",
      title: "Everything that will be served is committed on main (gate, automatic)",
      kind: "read",
      describe: (ctx) => [
        `site ${ctx.root}: on main, clean (derived files, aliases, budgets, editorial, generated/ merged by a PR), HEAD not ahead of origin/main`,
        `every report repo: on main, clean (the pin bump and the re-ingest committed), nothing unpushed (their full.md is what gets published)`,
        ctx.allowDirty ? "--allow-dirty given: skipped" : "`--allow-dirty` skips this; do not, unless you will commit afterwards",
      ],
      async run(rt) {
        if (rt.ctx.allowDirty) {
          rt.out("  ! --allow-dirty: not checking that what is published is committed");
          return;
        }
        const problems: string[] = [];
        const dirs = [rt.ctx.root, ...rt.ctx.repos.map((r) => r.dir)];
        for (const dir of dirs) {
          const st = (rt.probe.status(dir) ?? []).filter((l) => !/ (build|assets\/generated)\//.test(l));
          if (st.length) problems.push(`${dir}: ${st.length} uncommitted path(s): ${st.slice(0, 5).join("; ")}${st.length > 5 ? "; ..." : ""}`);
          const b = rt.probe.branch(dir);
          if (b !== rt.probe.defaultBranch(dir)) problems.push(`${dir} is on ${b}, not ${rt.probe.defaultBranch(dir)}`);
          const ahead = rt.probe.unpushed(dir);
          if (ahead) problems.push(`${dir}: ${ahead} commit(s) not on origin/main: push or merge them`);
        }
        if (problems.length) throw new Stop(`committed: what would be published is not what main records\n${problems.map((p) => `  ✗ ${p}`).join("\n")}`, ["Commit the derived files in a PR (source and derived apart), merge it, `git pull --ff-only`, then re-run `pnpm ship`: the checks above stay done.", "Production serves this tree's text; a deploy from an uncommitted tree leaves no record of what is live."]);
        rt.out("  ✓ the site and every report repo are committed on main");
      },
    },
    {
      id: "status",
      title: "Which reports does production serve a different text for?",
      kind: "read",
      describe: (ctx) => ["pnpm prerender                    (a merge may have touched mtimes; the prerender refuses a stale stamp)", `pnpm publish-report --all --status --base ${ctx.base}   (read-only: no secret, no writes)`, "to-publish = the DRIFT / not-published reports it lists (recorded in the state)"],
      async run(rt) {
        const pre = await rt.exec(pnpm("prerender"), "status-prerender");
        if (pre.code !== 0) throw new Stop(`status: pnpm prerender failed\n${tail(pre.stdout)}`, [`log: ${pre.log}`]);
        const r = await rt.exec(pnpm("publish-report", "--all", "--status", "--base", rt.ctx.base), "status-table");
        if (r.code !== 0) throw new Stop(`status: could not read the served versions\n${tail(r.stdout)}`, [`log: ${r.log}`, `curl -sI ${rt.ctx.base}/reports/<id> | grep -i x-rtm-content-version`]);
        const unread = unreadReports(r.stdout);
        if (unread.length) throw new Stop(`status: could not read what production serves for ${unread.join(", ")}`, [`log: ${r.log}`, "Network, or a report whose route 404s: curl -sI " + rt.ctx.base + "/reports/<id>"]);
        const toPublish = driftedReports(r.stdout);
        rt.state.data.toPublish = toPublish;
        rt.save(rt.state);
        rt.out(r.stdout.replace(/\x1b\[[0-9;]*m/g, "").trimEnd().split("\n").slice(-30).join("\n"));
        rt.out(`  to publish: ${toPublish.join(", ") || "none"}`);
      },
    },
    {
      id: "d1-estimate",
      title: "D1 write estimate for the reindex; stop if it does not fit today's quota",
      kind: "read",
      describe: (ctx, s) => [
        ...(s.data.toPublish ?? ["<each report to publish>"]).map((id) => `pnpm publish-report ${id} --dry-run --base ${ctx.base}   (reads D1, writes nothing)`),
        `sum + 1 version row per report, +10% margin, against ${ctx.d1Limit.toLocaleString()} less today's use (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID, else unknown)`,
        "STOP when it does not fit: wait for 00:00 UTC, or decide about Workers Paid (reportsthatmatter-2oz); re-run `pnpm ship`",
      ],
      async run(rt) {
        const ids = rt.state.data.toPublish ?? [];
        if (!ids.length) {
          rt.out("  nothing to publish: no D1 writes needed");
          rt.state.data.estimate = { total: 0, perReport: {}, headroom: null, limit: rt.ctx.d1Limit };
          return;
        }
        const perReport: Record<string, number> = {};
        for (const id of ids) {
          const r = await rt.exec(pnpm("publish-report", id, "--dry-run", "--base", rt.ctx.base), `d1-estimate-${id}`);
          const n = estimatedWrites(r.stdout);
          if (r.code !== 0 || n === null) throw new Stop(`d1-estimate: could not estimate ${id}\n${tail(r.stdout)}`, [`log: ${r.log}`, "The estimate reads D1 through wrangler: `pnpm wrangler d1 list` must show reportsthatmatter-marks (account office@atomatic.net)."]);
          perReport[id] = n;
        }
        const total = Object.values(perReport).reduce((a, b) => a + b, 0);
        const verdict = d1Fits(total, await rt.probe.rowsWrittenToday(), rt.ctx.d1Limit);
        rt.state.data.estimate = { total, perReport, headroom: verdict.headroom, limit: rt.ctx.d1Limit };
        rt.save(rt.state);
        for (const [id, n] of Object.entries(perReport).sort((a, b) => b[1] - a[1])) rt.out(`    ${id.padEnd(28)} ${n.toLocaleString().padStart(9)} row writes`);
        for (const l of verdict.lines) rt.out(`  ${l}`);
        if (!verdict.ok) throw new Stop(`d1-estimate: the reindex needs about ${verdict.needed.toLocaleString()} row writes and the quota has ${verdict.headroom?.toLocaleString() ?? "an unknown amount"} left`, ["Free tier: 100,000 row writes a day, reset 00:00 UTC (reportsthatmatter-h6b, -ewm0).", "Wait for the reset and re-run `pnpm ship` (it resumes here), or decide about Workers Paid (reportsthatmatter-2oz). Publishing fewer reports is a decision for the integrator, made outside this tool."]);
      },
    },
    {
      id: "publish",
      title: "Publish each drifted report (objects and commit only, --no-reindex)",
      kind: "prod",
      describe: (ctx, s) => (s.data.toPublish ?? ["<each report to publish>"]).map((id) => show({ argv: ["pnpm", "publish-report", id, "--base", ctx.base, "--no-reindex"], secret: true })),
      async run(rt) {
        for (const id of rt.state.data.toPublish ?? []) await item(rt, "publish", id, { argv: ["pnpm", "publish-report", id, "--base", rt.ctx.base, "--no-reindex"], secret: true }, [`pnpm publish-report ${id} --dry-run --base ${rt.ctx.base}`, "Re-running repeats the same command: uploads are idempotent. D1 code 7500 means the quota is spent: wait for 00:00 UTC."]);
      },
    },
    {
      id: "deploy",
      title: "Deploy the Worker",
      kind: "prod",
      describe: () => ["./scripts/deploy-cloudflare.sh   (prerenders, `wrangler deploy`, prints the drift table, which should list nothing)"],
      async run(rt) {
        await item(rt, "deploy", "deploy", { argv: ["./scripts/deploy-cloudflare.sh"] }, ["pnpm wrangler whoami / pnpm wrangler d1 list (the right account? AGENTS.md, Cloudflare)", "If wrangler's OAuth expired, ask Rufus to run `! pnpm wrangler login`."]);
      },
    },
    {
      id: "reindex",
      title: "Reindex search for the published reports (incremental: only changed paragraphs are written)",
      kind: "prod",
      describe: (ctx, s) => (s.data.toPublish ?? ["<each report to publish>"]).map((id) => `./scripts/reindex-search.sh ${id}`),
      async run(rt) {
        for (const id of rt.state.data.toPublish ?? []) await item(rt, "reindex", id, { argv: ["./scripts/reindex-search.sh", id] }, [`./scripts/reindex-search.sh ${id} --dry-run`, "D1 code 7500: the quota is spent. Wait for 00:00 UTC and re-run `pnpm ship`: the reports already reindexed stay done, and a repeat of a done one writes one row."]);
      },
    },
    {
      id: "seed",
      title: "Seed highlights into production marks",
      kind: "prod",
      describe: () => ["pnpm editorial", "pnpm seed-highlights --remote"],
      async run(rt) {
        await item(rt, "seed", "editorial", pnpm("editorial"), ["pnpm editorial"]);
        await item(rt, "seed", "seed-highlights", pnpm("seed-highlights", "--remote"), ["pnpm seed-highlights --remote  (needs build/editorial-highlights.json)"]);
      },
    },
    {
      id: "verify-prod",
      title: "Production verify, and the drift table must be empty",
      kind: "prod",
      describe: (ctx) => [`VERIFY_SHARED=1 VERIFY_BASE=${ctx.base} ./scripts/verify.sh`, `pnpm publish-report --all --status --fail-on-drift --base ${ctx.base}`],
      async run(rt) {
        await item(rt, "verify-prod", "verify", { argv: ["./scripts/verify.sh"], env: { VERIFY_BASE: rt.ctx.base, VERIFY_SHARED: "1" } }, ["The failing check's own lines; verify.sh prints where it kept its logs", "check-search-staleness: a reindex that did not run"]);
        await item(rt, "verify-prod", "drift", pnpm("publish-report", "--all", "--status", "--fail-on-drift", "--base", rt.ctx.base), ["pnpm publish-report --all --status --base " + rt.ctx.base, "A report still listed was not published (or was published and the CDN has not caught up: re-run)."]);
      },
    },
    {
      id: "record",
      title: "Record the release: quality-last, verify-last, scores",
      kind: "write",
      describe: () => ["pnpm quality ratchet --record   (reports/quality-last.json)", "pnpm scorecard --record           (reports/verify-last.json, docs/scores.json; re-runs score and verify, minutes)", "then YOU: commit those files in a PR, record the release in the changelog, close the beads"],
      async run(rt) {
        await item(rt, "record", "quality", pnpm("quality", "ratchet", "--record"), ["pnpm quality ratchet --record"]);
        await item(rt, "record", "scorecard", pnpm("scorecard", "--record"), ["pnpm scorecard --record  (reads the pipeline's own verify run)"]);
        rt.out("  Now: commit reports/quality-last.json reports/verify-last.json docs/scores.json in a PR, add the changelog entry (AGENTS.md, Changelog), close the beads, `bd dolt push`.");
      },
    },
  ];
  return steps;
}

/** The checks of the `checks` step, cheapest first, each with what to read when it fails. */
export function checkList(ctx: Ctx): Array<{ name: string; cmd: Cmd; read: string[] }> {
  const list: Array<{ name: string; cmd: Cmd; read: string[] }> = [
    { name: "aliases-check", cmd: pnpm("aliases", "check"), read: ["pnpm aliases check: a published id that neither resolves nor is listed in `unmatched`", "`git diff reports/<id>/aliases.yaml`: a report whose text did not move must show no removed lines"] },
    { name: "corpus-check", cmd: pnpm("corpus", "check"), read: ["pnpm corpus check: the moved sections"] },
    { name: "quality-check", cmd: pnpm("quality", "check"), read: ["pnpm quality report --diff origin/main  (every regression needs a bead, or a budget raise with `# why:` in a PR)"] },
    { name: "ingest-check", cmd: pnpm("ingest", "check"), read: ["pnpm ingest check: a report moved against baseline.json after the baseline step"] },
    { name: "ingest-verify", cmd: pnpm("ingest", "verify"), read: ["pnpm ingest verify <id> --findings   (oracle counts against reports/oracle-budget.yaml; golden pages)"] },
  ];
  if (ctx.has("scripts/ingest/cli.ts", "anchors")) list.push({ name: "anchors-check", cmd: pnpm("ingest", "anchors", "--all", "--check"), read: ["pnpm ingest anchors <id>   (markers-wrong, markers-stacked, blocks-wrong against reports/anchor-budget.yaml)"] });
  if (ctx.has("scripts/posts.mjs", "--check")) list.push({ name: "posts-check", cmd: pnpm("posts", "--check"), read: ["pnpm posts --check: a queued excerpt whose id moved"] });
  list.push(
    { name: "typecheck", cmd: pnpm("typecheck"), read: ["pnpm typecheck"] },
    { name: "tests", cmd: pnpm("test"), read: ["pnpm test"] },
    { name: "verify", cmd: { argv: ["./scripts/verify.sh"], env: { VERIFY_SHARED: "1" } }, read: ["./scripts/verify.sh prints each failing check and 'Logs kept at <dir>'"] }
  );
  return list;
}

// ---------------------------------------------------------------------------------------------------------------
// The plan

export function formatPlan(ctx: Ctx, state: State, steps: Step[], probe: Probe, extra: { head?: string; moved?: string[] } = {}): string {
  const out: string[] = [];
  out.push(`pnpm ship --plan: nothing below has been run${extra.head ? ` (site ${extra.head})` : ""}`, "");
  out.push(`  ships        @rtm/ingest ${ctx.spec}`, `  site         ${ctx.root}`, `  prod base    ${ctx.base}`, `  aliases from ${ctx.oldRef}`, `  D1 limit     ${ctx.d1Limit.toLocaleString()} row writes a day`, `  flags        ${ctx.shared ? "--shared " : ""}${ctx.yes ? "--yes " : ""}${ctx.allowDirty ? "--allow-dirty " : ""}${!ctx.shared && !ctx.yes && !ctx.allowDirty ? "(none: production steps will not run without --yes)" : ""}`.trimEnd(), "");
  out.push("Report repos (the pin each holds, and whether its text already matches the site's copy):");
  const pins = pinTable(ctx, probe.pinOf);
  for (const row of pins) {
    const repo = ctx.repos.find((r) => r.dir === row.dir)!;
    const dirty = probe.status(row.dir);
    const same = repo.ids.map((id) => {
      const a = probe.sha(join(row.dir, "full.md"));
      const b = probe.sha(join(ctx.root, "reports", id, "full.md"));
      return a && b ? (a === b ? "text = site copy" : "text differs from the site's copy") : "text not comparable";
    });
    const state2 = row.action === "ok" ? "pin ok" : row.action === "bump" ? `pin ${versionOf(row.pinned) ?? row.pinned} -> ${ctx.version}` : row.action === "ahead" ? `pin ${versionOf(row.pinned)} AHEAD of site: guard will stop` : "no pin";
    out.push(`  ${repo.ids.join(", ").padEnd(28)} ${state2.padEnd(28)} ${(dirty === null ? "not a repo" : dirty.length ? `${dirty.length} uncommitted` : "clean").padEnd(14)} ${same[0]}${repo.shared ? "" : "  (worktree)"}`);
  }
  const bumps = pins.filter((p) => p.action === "bump").length;
  out.push(`  ${bumps} of ${pins.length} repos need a pin bump`);
  const differs = pins.flatMap((row) => row.ids.filter((id) => { const a = probe.sha(join(row.dir, "full.md")); const b = probe.sha(join(ctx.root, "reports", id, "full.md")); return a && b && a !== b; }));
  out.push(`  repo text already differs from the site's copy (it will change the site on aggregate): ${differs.join(", ") || "none"}`);
  const problems = guardProblems(ctx, probe);
  out.push("", problems.length ? `Guard, evaluated now: the run would STOP at step 1 with ${problems.length} problem(s):` : "Guard, evaluated now: passes.", ...problems.map((p) => `  ✗ ${p}`));
  if (extra.moved) out.push("", `Reports whose output moves (\`pnpm ingest check\`, --measure): ${extra.moved.join(", ") || "none"}`);
  else out.push("", "Which reports change is known only after the re-ingest (step reingest, then aggregate records it); `--plan --measure` runs `pnpm ingest check` now (in memory, writes nothing, a few minutes) to say in advance.");
  out.push("");
  let n = 0;
  for (const step of steps) {
    n++;
    const st = state.steps[step.id];
    const tag = step.kind === "prod" ? "PROD, needs --yes" : step.kind === "write" ? "writes this machine" : "read-only";
    const status = st && st.status !== "pending" ? `  [${st.status}${st.message ? `: ${st.message}` : ""}]` : "";
    out.push(`${String(n).padStart(2)}. ${step.id}  (${tag})${status}`, `    ${step.title}`);
    for (const l of step.describe(ctx, state, probe)) if (l) out.push(`      ${l}`);
    out.push("");
  }
  out.push("A failed check, a failed command or a gate stops the run and prints what to read; `pnpm ship` again resumes at that step (state: build/ship/state.json). `--ack <step>` passes a gate you have read; `--skip <step>` records a step you did by hand; `--redo <step>` forgets one.");
  return out.join("\n");
}

/** A hash for a file's text (used to compare a report repo's full.md with the site's copy). */
export const sha1 = (text: Buffer | string) => createHash("sha1").update(text).digest("hex");

export const fileSha = (path: string): string | null => (existsSync(path) ? sha1(readFileSync(path)) : null);

// ---------------------------------------------------------------------------------------------------------------
// The driver

export type RunOptions = {
  from?: StepId;
  only?: StepId;
  redo?: StepId[];
  skip?: StepId[];
  ack?: StepId[];
};

/** Runs steps in order from the first not done. Returns the exit code: 0 finished, 1 a failure, 3 waiting for you. */
export async function drive(rt: Runtime, steps: Step[], opts: RunOptions = {}): Promise<number> {
  const { state } = rt;
  for (const id of opts.redo ?? []) {
    delete state.steps[id];
    if (id === "baseline") delete state.data.baselineIds;
    if (id === "aggregate") delete state.data.changed;
    if (id === "status") delete state.data.toPublish;
    if (id === "d1-estimate") delete state.data.estimate;
  }
  for (const id of opts.skip ?? []) state.steps[id] = { status: "skipped", items: state.steps[id]?.items ?? {}, at: rt.now(), message: "recorded as done by hand (--skip)" };
  rt.save(state);

  const started = opts.from ? STEP_ORDER.indexOf(opts.from) : 0;
  for (const step of steps) {
    if (opts.only && step.id !== opts.only) continue;
    if (STEP_ORDER.indexOf(step.id) < started) continue;
    const st = state.steps[step.id];
    if (st?.status === "done" || st?.status === "skipped") {
      rt.out(`= ${step.id}: ${st.status}${st.at ? ` at ${st.at}` : ""}`);
      continue;
    }
    if (step.kind === "prod" && !rt.ctx.yes) {
      state.steps[step.id] = { status: "awaiting-yes", items: st?.items ?? {}, at: rt.now() };
      rt.save(state);
      rt.out(`\n■ ${step.id} touches production. Everything before it is done. Read \`pnpm ship --plan\`, then re-run with --yes: pnpm ship --yes`);
      return 3;
    }
    rt.out(`\n▶ ${step.id}: ${step.title}`);
    state.steps[step.id] = { status: "pending", items: st?.items ?? {}, at: rt.now() };
    try {
      await step.run(rt);
    } catch (error) {
      if (error instanceof Stop) {
        state.steps[step.id] = { ...(state.steps[step.id] ?? { items: {} }), status: error.status, at: rt.now(), message: error.message.split("\n")[0], items: state.steps[step.id]?.items ?? {} };
        rt.save(state);
        rt.out(`\n${error.code === 3 ? "■ WAITING" : "✗ STOPPED"} at ${step.id}: ${error.message}`);
        if (error.read.length) rt.out(`\nRead:\n${error.read.map((r) => `  - ${r}`).join("\n")}`);
        rt.out(`\nThen re-run \`pnpm ship\`: it resumes at ${step.id}.`);
        return error.code;
      }
      throw error;
    }
    state.steps[step.id] = { ...state.steps[step.id], status: "done", at: rt.now(), items: state.steps[step.id]?.items ?? {} };
    state.data.acks = (state.data.acks ?? []).filter((a) => a !== step.id);
    rt.save(state);
  }
  if (opts.only) return 0;
  rt.out("\n✓ every step is done. Commit reports/quality-last.json, reports/verify-last.json and docs/scores.json in a PR; add the changelog entry; close the beads.");
  return 0;
}
