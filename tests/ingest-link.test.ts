import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { linkAll, linkLockPathFor, readLinkLock, unlinkAll } from "../scripts/lib/ingest-link";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ingest-link-"));
  for (const d of ["pinned", "linked", "site/node_modules/@rtm", "repo/node_modules/@rtm", "bare/node_modules"]) mkdirSync(join(dir, d), { recursive: true });
  symlinkSync(join(dir, "pinned"), join(dir, "site/node_modules/@rtm/ingest"));
  symlinkSync(join(dir, "pinned"), join(dir, "repo/node_modules/@rtm/ingest"));
  return { dir, site: join(dir, "site/node_modules/@rtm/ingest"), repo: join(dir, "repo/node_modules/@rtm/ingest"), bare: join(dir, "bare/node_modules/@rtm/ingest"), lock: linkLockPathFor(dir), linked: join(dir, "linked") };
}

describe("pnpm ingest link bookkeeping", () => {
  it("links the site and a report worktree, then restores each to what it was, including one that did not exist", () => {
    const f = fixture();
    linkAll(f.lock, f.linked, [f.site, f.repo, f.bare]);
    for (const p of [f.site, f.repo, f.bare]) expect(readlinkSync(p)).toBe(f.linked);
    expect(readLinkLock(f.lock)?.links.map((l) => l.originalTarget)).toEqual([join(f.dir, "pinned"), join(f.dir, "pinned"), null]);
    const said = unlinkAll(f.lock);
    expect(said).toHaveLength(3);
    expect(readlinkSync(f.site)).toBe(join(f.dir, "pinned"));
    expect(readlinkSync(f.repo)).toBe(join(f.dir, "pinned"));
    expect(existsSync(f.bare) || (() => { try { lstatSync(f.bare); return true; } catch { return false; } })()).toBe(false);
    expect(existsSync(f.lock)).toBe(false);
  });

  it("refuses a second link while one is recorded", () => {
    const f = fixture();
    linkAll(f.lock, f.linked, [f.site]);
    expect(() => linkAll(f.lock, f.linked, [f.repo])).toThrow(/already linked/);
  });

  it("undoes its own work when a path is a real directory, which relink refuses to replace", () => {
    const f = fixture();
    mkdirSync(f.bare, { recursive: true });
    writeFileSync(join(f.bare, "x"), "real install");
    expect(() => linkAll(f.lock, f.linked, [f.site, f.bare])).toThrow(/not a symlink/);
    expect(readlinkSync(f.site)).toBe(join(f.dir, "pinned"));
    expect(existsSync(f.lock)).toBe(false);
  });

  it("restore with nothing recorded is a no-op", () => {
    expect(unlinkAll(join(mkdtempSync(join(tmpdir(), "ingest-link-")), ".rtm-link.lock"))).toEqual([]);
  });
});
