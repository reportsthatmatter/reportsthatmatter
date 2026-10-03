#!/usr/bin/env node
/**
 * `pnpm ship`: the post-merge half of a release, one resumable step at a time (reportsthatmatter-0c6i).
 *
 *   pnpm ship --plan [--measure]        print every step, its exact commands and which repos change; run nothing
 *   pnpm ship [--shared] [--yes]        run from the first step not done; stop at a failed check, a gate or production
 *   pnpm ship --status                  the state file as a table
 *   pnpm ship --ack <step>[,<step>]     pass a gate you have read (baseline, corpus, editorial), then continue
 *   pnpm ship --skip <step>             record a step you did by hand (e.g. aliases, after restoring lost lines), then continue
 *   pnpm ship --redo <step>             forget a step (and what it found) so it runs again
 *   pnpm ship --from <step> | --only <step>
 *   pnpm ship --reset                   delete the state file (a new release)
 *
 * Options: --base <url> (default https://reportsthatmatter.org), --old-ref <ref> (aliases are rendered against it;
 * default origin/main, resolved to a sha on the first run and kept), --d1-limit <n>, --allow-dirty, --state <file>,
 * --verbose (stream each command's output), --root <dir> (a site checkout other than this one: for tests).
 *
 * The site pin is the source of truth: merge the site's pin-bump PR first; every report repo is then moved to it.
 * Steps that touch production (publish, deploy, reindex, seed, verify-prod) need --yes. `--shared` is the integrator's
 * deliberate opt-in to write the shared report checkouts (without it `ingest run` refuses them, as it does for anyone).
 * Merging, conflict resolution, committing, raising a budget and accepting a baseline stay with the integrator.
 * State: build/ship/state.json (gitignored); logs: build/ship/logs/. Exit 0 finished, 1 stopped on a failure, 3 waiting for you.
 */
import "./lib/help.mjs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import { FREE_TIER_DAILY_WRITES, rowsWrittenToday } from "./lib/d1-probe.ts";
import { buildSteps, drive, fileSha, formatPlan, freshState, movedReports, STEP_ORDER, versionOf, type Cmd, type Ctx, type ExecResult, type Probe, type Repo, type Runtime, type State, type StepId } from "./lib/ship.ts";

const SITE = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string): string | undefined => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const list = (f: string): string[] => (opt(f) ?? "").split(",").map((s) => s.trim()).filter(Boolean);

if (flag("--help") || flag("-h")) {
  console.log(readFileSync(import.meta.filename, "utf8").split("*/")[0].replace(/^#!.*\n/, "").replace(/^\/\*\*?\n?| \* ?/gm, "").trim());
  process.exit(0);
}

const root = resolve(opt("--root") ?? SITE);
// GIT_OPTIONAL_LOCKS=0: a status here must not take the index lock of a shared checkout another agent is using.
const git = (dir: string, a: string[]) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
const statePath = resolve(opt("--state") ?? join(root, "build/ship/state.json"));
const logDir = join(root, "build/ship/logs");

for (const id of [...list("--ack"), ...list("--skip"), ...list("--redo"), ...list("--from"), ...list("--only")]) {
  if (!(STEP_ORDER as readonly string[]).includes(id)) {
    console.error(`unknown step "${id}"; steps: ${STEP_ORDER.join(", ")}`);
    process.exit(2);
  }
}

// ---- context ---------------------------------------------------------------------------------------------------

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const spec: string = pkg.dependencies?.["@rtm/ingest"];
const manifest = parse(readFileSync(join(root, "reports/manifest.yaml"), "utf8")) as { reports: Array<{ id: string; dir: string }> };
const override = process.env.RTM_REPORT_DIRS;
const repos: Repo[] = [];
for (const r of manifest.reports) {
  const alt = override ? join(resolve(override), basename(r.dir)) : undefined;
  const dir = alt && existsSync(alt) ? alt : resolve(root, r.dir);
  const found = repos.find((x) => x.dir === dir);
  if (found) found.ids.push(r.id);
  else repos.push({ dir, ids: [r.id], shared: dir === resolve(root, r.dir) });
}
const hasCache = new Map<string, string>();
const has = (file: string, needle: string) => {
  const path = join(root, file);
  if (!hasCache.has(path)) hasCache.set(path, existsSync(path) ? readFileSync(path, "utf8") : "");
  return hasCache.get(path)!.includes(needle);
};

let existing: State | null = null;
if (flag("--reset") && existsSync(statePath)) rmSync(statePath);
if (existsSync(statePath)) existing = JSON.parse(readFileSync(statePath, "utf8"));

const resolveRef = (ref: string) => git(root, ["rev-parse", "--short=12", "--verify", "-q", ref]).stdout.trim() || ref;
const ctx: Ctx = {
  root,
  spec,
  version: versionOf(spec) ?? spec,
  ids: manifest.reports.map((r) => r.id),
  repos,
  base: (opt("--base") ?? "https://reportsthatmatter.org").replace(/\/$/, ""),
  oldRef: existing?.oldRef ?? resolveRef(opt("--old-ref") ?? "origin/main"),
  shared: flag("--shared"),
  yes: flag("--yes"),
  allowDirty: flag("--allow-dirty"),
  d1Limit: Number(opt("--d1-limit") ?? FREE_TIER_DAILY_WRITES),
  has,
};

// ---- real side effects -----------------------------------------------------------------------------------------

const probe: Probe = {
  pinOf(dir) {
    try {
      const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      return p.dependencies?.["@rtm/ingest"] ?? p.devDependencies?.["@rtm/ingest"] ?? null;
    } catch {
      return null;
    }
  },
  writePin(dir, to) {
    const path = join(dir, "package.json");
    const text = readFileSync(path, "utf8");
    const next = text.replace(/("@rtm\/ingest"\s*:\s*")[^"]*(")/, `$1${to}$2`);
    if (next === text) throw new Error(`no "@rtm/ingest" entry to rewrite in ${path}`);
    writeFileSync(path, next);
  },
  status(dir, paths) {
    const r = git(dir, ["status", "--porcelain", ...(paths ? ["--", ...paths] : [])]);
    return r.status === 0 ? r.stdout.split("\n").filter(Boolean) : null;
  },
  branch(dir) {
    const r = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return r.status === 0 ? r.stdout.trim() : null;
  },
  defaultBranch(dir) {
    const r = git(dir, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
    return r.status === 0 ? r.stdout.trim().replace(/^origin\//, "") : "main";
  },
  unpushed(dir) {
    const r = git(dir, ["rev-list", "--count", `origin/${probe.defaultBranch(dir)}..HEAD`]);
    return r.status === 0 ? Number(r.stdout.trim()) : null;
  },
  behind(dir) {
    const r = git(dir, ["rev-list", "--count", `HEAD..origin/${probe.defaultBranch(dir)}`]);
    return r.status === 0 ? Number(r.stdout.trim()) : null;
  },
  numstat(dir, paths) {
    const r = git(dir, ["diff", "--numstat", "HEAD", "--", ...paths]);
    return r.stdout.split("\n").filter(Boolean).map((l) => {
      const [a, d, p] = l.split("\t");
      return [Number(a) || 0, Number(d) || 0, p] as [number, number, string];
    });
  },
  sha: fileSha,
  async rowsWrittenToday() {
    const dbId = (readFileSync(join(root, "wrangler.toml"), "utf8").match(/database_id\s*=\s*"([^"]+)"/) ?? [])[1];
    return rowsWrittenToday(fetch as never, { token: process.env.CLOUDFLARE_API_TOKEN, account: process.env.CLOUDFLARE_ACCOUNT_ID, databaseId: dbId });
  },
};

function exec(cmd: Cmd, label: string): Promise<ExecResult> {
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, `${label.replace(/[^\w.-]+/g, "_")}.log`);
  const log = relative(root, logFile);
  const env: NodeJS.ProcessEnv = { ...process.env, ...cmd.env };
  if (cmd.secret) {
    const file = join(homedir(), ".rtm-publish-secret");
    if (!existsSync(file)) return Promise.resolve({ code: 1, stdout: `no ${file}: the publish secret is needed (AGENTS.md, Cloudflare)`, log, seconds: 0 });
    env.RTM_PUBLISH_SECRET = readFileSync(file, "utf8").trim();
  }
  const started = Date.now();
  return new Promise((done) => {
    const stream = createWriteStream(logFile);
    stream.write(`$ ${cmd.argv.join(" ")}   (cwd ${cmd.cwd ?? root}, ${new Date().toISOString()})\n`);
    const child = spawn(cmd.argv[0], cmd.argv.slice(1), { cwd: cmd.cwd ?? root, env });
    let out = "";
    const take = (b: Buffer) => {
      stream.write(b);
      out = (out + b.toString()).slice(-400_000);
      if (flag("--verbose")) process.stdout.write(b);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (e) => take(Buffer.from(String(e))));
    child.on("close", (code) => stream.end(() => done({ code: code ?? 1, stdout: out, log, seconds: (Date.now() - started) / 1000 })));
  });
}

function save(state: State) {
  mkdirSync(join(statePath, ".."), { recursive: true });
  writeFileSync(`${statePath}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(`${statePath}.tmp`, statePath);
}

// ---- go --------------------------------------------------------------------------------------------------------

const steps = buildSteps();
const head = git(root, ["rev-parse", "--short", "HEAD"]).stdout.trim();

if (existing && existing.spec !== spec) {
  console.error(`${statePath} is for ${existing.spec}, the site pins ${spec}. A new release starts clean: pnpm ship --reset (or --state <file>).`);
  process.exit(2);
}
const state: State = existing ?? freshState(spec, ctx.oldRef, new Date().toISOString());

if (flag("--status")) {
  console.log(`state ${statePath}\n  ships ${state.spec}, aliases from ${state.oldRef}, started ${state.startedAt}`);
  for (const s of steps) {
    const st = state.steps[s.id];
    const items = st ? Object.values(st.items) : [];
    console.log(`  ${s.id.padEnd(12)} ${(st?.status ?? "pending").padEnd(13)} ${items.length ? `${items.filter((i) => i.status === "done").length}/${items.length} items` : ""} ${st?.message ?? ""}`);
  }
  const d = state.data;
  if (d.changed) console.log(`  changed: ${d.changed.join(", ") || "none"}`);
  if (d.toPublish) console.log(`  to publish: ${d.toPublish.join(", ") || "none"}`);
  if (d.estimate) console.log(`  D1 estimate: ${d.estimate.total.toLocaleString()} row writes`);
  process.exit(0);
}

if (flag("--plan")) {
  let moved: string[] | undefined;
  if (flag("--measure")) {
    const r = spawnSync("pnpm", ["ingest", "check"], { cwd: root, encoding: "utf8", maxBuffer: 256 << 20 });
    moved = movedReports(`${r.stdout}\n${r.stderr}`);
    if (r.status !== 0 && !moved.length) moved = undefined;
  }
  console.log(formatPlan(ctx, state, steps, probe, { head, moved }));
  process.exit(0);
}

state.data.acks = [...new Set([...(state.data.acks ?? []), ...list("--ack")])];
const rt: Runtime = {
  ctx,
  state,
  exec: (cmd, label) => exec(cmd, label),
  probe,
  save,
  out: (l) => console.log(l),
  now: () => new Date().toISOString(),
  acked: (id) => (state.data.acks ?? []).includes(id),
};
// An ack passes the gate at its step; a gate already passed does not need it again, so clear acks for done steps.
const code = await drive(rt, steps, {
  from: opt("--from") as StepId | undefined,
  only: opt("--only") as StepId | undefined,
  redo: list("--redo") as StepId[],
  skip: list("--skip") as StepId[],
});
process.exit(code);
