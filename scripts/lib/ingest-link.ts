/**
 * `pnpm ingest link`: the link-override dance for testing an unreleased ingest from a site worktree, and its undo.
 *
 * The by-hand version (`pnpm add @rtm/ingest@link:../ingest-x` here and in every report repo) edits package.json and
 * the lockfile, which then have to be remembered and reverted, and must never be committed. This replaces only the
 * `node_modules/@rtm/ingest` symlink (what `pnpm ingest try` does for the length of one trial), records what each
 * pointed at in `.rtm-link.lock`, and `--restore` puts every one back. Nothing tracked changes, so there is nothing
 * to commit by accident; `pnpm install` also undoes it, as it undoes any node_modules edit.
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

/** Points every `linkPath` at `ingestDir`, recording the old targets first. Throws, having undone its own work, if one is a real directory. */
export function linkAll(lockPath: string, ingestDir: string, linkPaths: string[]): LinkLock {
  if (existsSync(lockPath)) throw new Error(`already linked (${lockPath}): run \`pnpm ingest link --restore\` first`);
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

/** Puts every link back where the lock says it was (removing one that did not exist) and deletes the lock. Returns one line per link changed. */
export function unlinkAll(lockPath: string): string[] {
  const lock = readLinkLock(lockPath);
  if (!lock) return [];
  const said: string[] = [];
  for (const { linkPath, originalTarget } of lock.links) {
    if (targetOf(linkPath) === originalTarget) continue;
    rmSync(linkPath, { force: true });
    if (originalTarget !== null) symlinkSync(originalTarget, linkPath);
    said.push(`${linkPath} → ${originalTarget ?? "(absent)"}`);
  }
  rmSync(lockPath, { force: true });
  return said;
}
