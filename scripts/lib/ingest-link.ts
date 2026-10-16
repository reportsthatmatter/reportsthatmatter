/**
 * `pnpm ingest link`: the link-override dance for testing an unreleased ingest from a site worktree, and its undo.
 *
 * The by-hand version (`pnpm add @rtm/ingest@link:../ingest-x` here and in every report repo) edits package.json and
 * the lockfile, which then have to be remembered and reverted, and must never be committed. This replaces only the
 * `node_modules/@rtm/ingest` symlink (what `pnpm ingest try` does for the length of one trial), records what each
 * pointed at in `.rtm-link.lock`, and `--restore` puts every one back. Nothing tracked changes, so there is nothing
 * to commit by accident; `pnpm install` also undoes it, as it undoes any node_modules edit.
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { relink } from "./trial-links";

export type LinkLock = { ingestDir: string; links: Array<{ linkPath: string; originalTarget: string | null }>; at: string };

export const linkLockPathFor = (root: string) => join(root, ".rtm-link.lock");

export function readLinkLock(path: string): LinkLock | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as LinkLock) : null;
}

function targetOf(path: string): string | null {
  try {
    return lstatSync(path).isSymbolicLink() ? readlinkSync(path) : null;
  } catch {
    return null;
  }
}

export type LinkState = { linkPath: string; linked: boolean; /** Where it points now; "(missing)" or "(not a symlink)" when it is not a link. */ target: string };

const realOrNull = (path: string): string | null => {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
};

/**
 * Does each link the lock recorded still point at the lock's ingest dir? A `pnpm install` resets
 * `node_modules/@rtm/ingest` to the pin without touching `.rtm-link.lock` (reportsthatmatter-irfs), so the lock alone
 * does not say the override is live.
 */
export function linkStates(lock: LinkLock): LinkState[] {
  const want = realOrNull(lock.ingestDir);
  return lock.links.map(({ linkPath }) => {
    const here = targetOf(linkPath);
    const target = here ?? (existsSync(linkPath) ? "(not a symlink)" : "(missing)");
    const linked = here !== null && (here === lock.ingestDir || (want !== null && realOrNull(linkPath) === want));
    return { linkPath, linked, target };
  });
}

/** A lock whose links no longer all point at its ingest dir (some, or all, were undone behind its back). */
export const isDrifted = (lock: LinkLock): boolean => linkStates(lock).some((s) => !s.linked);

/** Points every `linkPath` at `ingestDir`, recording the old targets first. A lock whose links no longer point at its ingest dir is cleared first; a live one refuses. Throws, having undone its own work, if one is a real directory. */
export function linkAll(lockPath: string, ingestDir: string, linkPaths: string[]): LinkLock {
  const existing = readLinkLock(lockPath);
  if (existing && !isDrifted(existing)) throw new Error(`already linked (${lockPath}): run \`pnpm ingest link --restore\` first`);
  // a drifted lock (a pnpm install undid some or all of its links) is stale, not a live override: clear it and link afresh
  if (existing) unlinkAll(lockPath);
  const lock: LinkLock = { ingestDir, links: linkPaths.map((linkPath) => ({ linkPath, originalTarget: targetOf(linkPath) })), at: new Date().toISOString() };
  // the lock goes down before the first link, so a crash half-way is still undoable
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  try {
    for (const { linkPath } of lock.links) relink(linkPath, ingestDir);
  } catch (error) {
    unlinkAll(lockPath);
    throw error;
  }
  return lock;
}

/**
 * Puts every link that still points at the lock's ingest dir back where the lock says it was (removing one that did not
 * exist) and deletes the lock. A link that no longer points there is left alone: `pnpm install` owns it now, and the
 * lock's recorded original may be a pin since bumped (reportsthatmatter-irfs). Returns one line per link changed.
 */
export function unlinkAll(lockPath: string): string[] {
  const lock = readLinkLock(lockPath);
  if (!lock) return [];
  const live = new Set(linkStates(lock).filter((s) => s.linked).map((s) => s.linkPath));
  const said: string[] = [];
  for (const { linkPath, originalTarget } of lock.links) {
    if (!live.has(linkPath)) continue;
    rmSync(linkPath, { force: true });
    if (originalTarget !== null) symlinkSync(originalTarget, linkPath);
    said.push(`${linkPath} → ${originalTarget ?? "(absent)"}`);
  }
  rmSync(lockPath, { force: true });
  return said;
}
