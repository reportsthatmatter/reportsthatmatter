import { describe, expect, it } from "vitest";
import { classify, isDerived, type Facts } from "../scripts/lib/worktrees";

const base: Facts = { path: "/w/a", repo: "site", isMain: false, isCurrent: false, branch: "b", head: "abc12345", mergedIntoDefault: true, pr: "merged", prHeadMatches: true, unpushed: 0, changed: [], scratch: [], ageHours: 100 };

describe("worktrees classify", () => {
  it("removes a clean, pushed, merged, old worktree", () => {
    expect(classify(base).remove).toBe(true);
  });
  it("keeps a young one however clean (the 2026-10-09 failure)", () => {
    const v = classify({ ...base, ageHours: 2 });
    expect(v.remove).toBe(false);
    expect(v.reasons.join()).toMatch(/live session/);
  });
  it("keeps shared checkouts, the current tree, unpushed commits, real changes, scratch, open PRs", () => {
    for (const f of [{ isMain: true }, { isCurrent: true }, { unpushed: 1 }, { changed: ["src/x.ts"] }, { scratch: [".scratch/a"] }, { pr: "open" as const }]) {
      expect(classify({ ...base, ...f }).remove).toBe(false);
    }
  });
  it("squash merges: needs the PR head to be this HEAD", () => {
    const squash = { ...base, mergedIntoDefault: false };
    expect(classify(squash).remove).toBe(true);
    expect(classify({ ...squash, prHeadMatches: false }).remove).toBe(false);
    expect(classify({ ...squash, pr: "none" }).remove).toBe(false);
  });
  it("derived-only changes do not keep it", () => {
    const v = classify({ ...base, changed: ["dist/a.js", "assets/generated/x/y.html", "pnpm-lock.yaml", "node_modules/x"] });
    expect(v.remove).toBe(true);
    expect(v.derivedOnly).toBe(true);
    expect(isDerived("scripts/a.ts")).toBe(false);
  });
  it("honours the keep list", () => {
    expect(classify(base, { keep: [/\/a$/] }).remove).toBe(false);
  });
  it("keeps a new branch made from main before its first commit, with no PR (ancestry is not 'merged')", () => {
    const v = classify({ ...base, pr: "none", prHeadMatches: false });
    expect(v.remove).toBe(false);
    expect(v.reasons.join()).toMatch(/not started/);
    expect(classify({ ...base, pr: "unknown", prHeadMatches: false }).remove).toBe(false);
    // detached at a commit on main (a baseline or trial checkout) is still removable
    expect(classify({ ...base, branch: null, pr: "none", prHeadMatches: false }).remove).toBe(true);
  });
  it("keeps a shared checkout's path, a live site worktree's report worktrees and a linked ingest", () => {
    expect(classify({ ...base, shared: true }).remove).toBe(false);
    expect(classify({ ...base, owner: "/w/rtm-x-1009" }).remove).toBe(false);
    expect(classify({ ...base, linkedFrom: ["/w/rtm-x-1009"] }).remove).toBe(false);
    expect(classify({ ...base, owner: null, linkedFrom: [], shared: false }).remove).toBe(true);
  });
});
