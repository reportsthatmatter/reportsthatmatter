/* Bump the @rtm/ingest pin everywhere (reportsthatmatter-jsk3).
 *
 *   pnpm bump-pin <version> [--dry-run] [--shared] [--no-install]
 *
 * <version> is the ingest release (0.25.0 or v0.25.0; `pnpm release X.Y.Z` in ingest tags it). It edits the site's
 * package.json, refreshes the site's lockfile and node_modules (`pnpm install --no-frozen-lockfile`: a frozen install
 * refuses a changed pin), does the same in every report repo (RTM_REPORT_DIRS worktrees where they exist), then runs
 * `pnpm ingest preflight`. Report repos that are shared checkouts are refused unless --shared (the integrator's
 * flag, as for `pnpm ingest baseline`). --dry-run prints what it would do and writes nothing. It never commits:
 * commit package.json and pnpm-lock.yaml in the site PR, and in each report repo as that repo's process says.
 * `pnpm ship` does the report-repo half itself (its pin-bump step); use this to open the pin-bump PR.
 */
import "./lib/help.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installArgv, normaliseVersion, pinWith, rewritePin, type BumpStep } from "./lib/bump-pin.ts";
import { reportDirs } from "./lib/report-dirs.ts";
import { sharedMessage, sharedTargets, type Target } from "./lib/shared-checkout.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));
const known = ["--dry-run", "--shared", "--no-install"];
const bad = flags.filter((f) => !known.includes(f));
const tag = positional.length === 1 ? normaliseVersion(positional[0]) : null;
if (bad.length || !tag) {
  console.error(bad.length ? `unknown flag ${bad.join(" ")}` : "usage: pnpm bump-pin <version> [--dry-run] [--shared] [--no-install]   (e.g. 0.25.0)");
  process.exit(2);
}
const dry = flags.includes("--dry-run");
const install = !flags.includes("--no-install");

const pinOf = (dir: string): string | null => {
  try {
    const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return p.dependencies?.["@rtm/ingest"] ?? p.devDependencies?.["@rtm/ingest"] ?? null;
  } catch {
    return null;
  }
};

const siteSpec = pinOf(root);
const to = siteSpec ? pinWith(siteSpec, tag) : null;
if (!siteSpec || !to) {
  console.error('the site package.json has no "@rtm/ingest" pin with a #tag to replace');
  process.exit(1);
}

const dirs = [...reportDirs(root).values()];
const targets: Target[] = dirs.map((r) => ({ id: r.id, dir: r.dir, defaultDir: r.defaultDir }));
const offenders = sharedTargets(targets, { shared: flags.includes("--shared") });
if (offenders.length && dry) console.log(`note: ${offenders.length} report repo(s) are shared checkouts; a real run needs --shared or RTM_REPORT_DIRS worktrees\n`);
else if (offenders.length) {
  console.error(sharedMessage("bump-pin", offenders));
  process.exit(1);
}

const seen = new Set<string>();
const steps: BumpStep[] = [{ dir: root, label: "site", from: siteSpec, to, argv: installArgv(root) }];
for (const r of dirs) {
  if (seen.has(r.dir)) continue;
  seen.add(r.dir);
  if (!existsSync(join(r.dir, "package.json"))) {
    console.error(`  ✗ ${r.dir}: no package.json (${r.id}); clone or make a worktree first`);
    process.exit(1);
  }
  steps.push({ dir: r.dir, label: r.id, from: pinOf(r.dir), to, argv: installArgv(r.dir) });
}

for (const s of steps) {
  const note = s.from === s.to ? "already at the pin" : `${s.from ?? "no pin"} -> ${s.to}`;
  console.log(`${dry ? "would " : ""}${s.label}: ${note}${install ? `; ${s.argv.join(" ")}` : ""}`);
}
if (!dry) {
  for (const s of steps) {
    const path = join(s.dir, "package.json");
    const text = readFileSync(path, "utf8");
    try {
      const next = rewritePin(text, s.to);
      if (next !== text) writeFileSync(path, next);
    } catch (e) {
      console.error(`  ✗ ${path}: ${(e as Error).message}`);
      process.exit(1);
    }
    if (install) {
      const r = spawnSync(s.argv[0], s.argv.slice(1), { stdio: "inherit", env: { ...process.env, CI: "true" } });
      if (r.status !== 0) {
        console.error(`  ✗ ${s.argv.join(" ")} failed (${r.status}); fix it and re-run (already-bumped repos are left as they are)`);
        process.exit(1);
      }
    }
  }
  if (install) {
    const r = spawnSync("pnpm", ["ingest", "preflight"], { cwd: root, stdio: "inherit" });
    process.exit(r.status ?? 1);
  }
  console.log("pins edited; run `pnpm install` / `pnpm ingest preflight` yourself (--no-install)");
}
