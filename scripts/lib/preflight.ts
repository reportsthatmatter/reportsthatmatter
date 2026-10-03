/**
 * Does each report repo's installed @rtm/ingest match the version its own package.json pins?
 *
 * A pin bump changes package.json; the installed copy only changes when someone runs `pnpm install` in
 * that repo. Report repos are separate checkouts, so after a bump they are stale until reinstalled, and a
 * stale one does not fail cleanly: `pnpm ingest check` crashed on a missing export (`layoutPageJoins`)
 * instead of reporting a diff (reportsthatmatter-14su). This is the check that says so first, with the fix.
 *
 * Pure apart from reading `package.json` and `node_modules/@rtm/ingest/package.json` under each directory.
 */
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

export type PreflightRow = {
  /** Report id, or "site" for this repo itself. */
  id: string;
  dir: string;
  pinned: string | null;
  installed: string | null;
  /** The installed copy is a link to a working tree (pnpm add link:…), not a registry or git install. */
  linked: boolean;
  ok: boolean;
  problem?: string;
  /** The command that fixes it. */
  fix?: string;
};

const norm = (version: string) => version.trim().replace(/^v/, "");

/** `github:reportsthatmatter/ingest#v0.18.0` or `^0.18.0` or `0.18.0` → `0.18.0`; null for a pin that names no version (a link, a branch). */
export function pinnedVersion(spec: string | undefined): string | null {
  if (!spec) return null;
  const tag = spec.match(/#v?(\d+\.\d+\.\d+(?:[-+][\w.]+)?)$/);
  if (tag) return tag[1];
  const plain = spec.match(/^[~^=v]*(\d+\.\d+\.\d+(?:[-+][\w.]+)?)$/);
  return plain ? plain[1] : null;
}

function readJson(path: string): { version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** True when `<dir>/node_modules/@rtm/ingest` resolves outside pnpm's store, i.e. it was linked to a checkout. */
export function isLinked(dir: string): boolean {
  const path = join(dir, "node_modules/@rtm/ingest");
  try {
    if (!lstatSync(path).isSymbolicLink()) return false;
    return !/[\\/]node_modules[\\/]\.pnpm[\\/]/.test(realpathSync(path));
  } catch {
    return false;
  }
}

export function checkRepo(id: string, dir: string): PreflightRow {
  const pkg = readJson(join(dir, "package.json"));
  const spec = pkg?.dependencies?.["@rtm/ingest"] ?? pkg?.devDependencies?.["@rtm/ingest"];
  const pinned = pinnedVersion(spec);
  const base = { id, dir, pinned, installed: null as string | null, linked: false };
  const fix = `pnpm -C ${dir} install`;

  if (!existsSync(dir)) return { ...base, ok: false, problem: `${dir} does not exist`, fix: "clone the report repo alongside this one (reports/manifest.yaml names where)" };
  if (!pkg) return { ...base, ok: false, problem: "no package.json", fix };
  if (!spec) return { ...base, ok: false, problem: "package.json does not depend on @rtm/ingest", fix };

  const installedPkg = readJson(join(dir, "node_modules/@rtm/ingest/package.json"));
  if (!installedPkg?.version) return { ...base, ok: false, problem: "@rtm/ingest is not installed", fix };
  const installed = installedPkg.version;
  const linked = isLinked(dir);
  // A link is a deliberate override (pnpm ingest try, or a hand link); say so but do not fail on it.
  if (linked) return { ...base, installed, linked, ok: true };
  if (pinned === null) return { ...base, installed, ok: true };
  if (norm(installed) !== norm(pinned)) {
    return { ...base, installed, ok: false, problem: `pins v${norm(pinned)} but v${norm(installed)} is installed`, fix };
  }
  return { ...base, installed, ok: true };
}

/** Site first, then each report's repo (deduplicated: several reports can share one repo). */
export function preflight(site: string, reports: Array<[string, string]>): PreflightRow[] {
  const rows = [checkRepo("site", site)];
  const seen = new Set<string>([site]);
  for (const [id, dir] of reports) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    rows.push(checkRepo(id, dir));
  }
  return rows;
}

/** Report repos pinned to a different version than the site, grouped by pin: not a failure, but results then mix two pipelines. */
export function pinSkew(rows: PreflightRow[]): string[] {
  const site = rows.find((r) => r.id === "site");
  if (!site?.pinned) return [];
  const by = new Map<string, string[]>();
  for (const r of rows) {
    if (r.id === "site" || !r.pinned || norm(r.pinned) === norm(site.pinned)) continue;
    by.set(norm(r.pinned), [...(by.get(norm(r.pinned)) ?? []), r.id]);
  }
  return [...by].map(([pin, ids]) => `${ids.length} report repo(s) pin v${pin}, the site pins v${norm(site.pinned!)}: ${ids.join(", ")}`);
}

export function formatPreflight(rows: PreflightRow[]): string {
  const lines: string[] = [];
  for (const r of rows) {
    const tag = r.linked ? ` (linked override, v${r.installed})` : r.installed ? ` v${norm(r.installed)}` : "";
    lines.push(r.ok ? `  ✓ ${r.id}${tag}` : `  ✗ ${r.id}: ${r.problem}\n      fix: ${r.fix}`);
  }
  for (const s of pinSkew(rows)) lines.push(`  ! ${s}`);
  return lines.join("\n");
}
