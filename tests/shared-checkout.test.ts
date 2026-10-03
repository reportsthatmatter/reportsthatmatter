import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLinkedWorktree, isSharedCheckout, sharedMessage, sharedTargets, worktreePlan } from "../scripts/lib/shared-checkout";
import { goldenVsAdjudicated } from "../scripts/lib/golden-adjudicated";
import { selectReports } from "../scripts/lib/recheck";

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, "-c", "user.email=t@t", "-c", "user.name=t", ...args], { encoding: "utf8" });

function repoWithWorktree() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rtm-shared-")));
  const main = join(root, "report-repo");
  mkdirSync(main);
  git(main, "init", "-q", "-b", "main");
  writeFileSync(join(main, "a.txt"), "a");
  git(main, "add", ".");
  git(main, "commit", "-q", "-m", "init");
  const wt = join(root, "wt", "report-repo");
  mkdirSync(join(root, "wt"));
  git(main, "worktree", "add", "-q", wt, "-b", "work");
  return { root, main, wt };
}

describe("shared checkout detection", () => {
  const { root, main, wt } = repoWithWorktree();

  it("tells a main working tree from a linked worktree", () => {
    expect(isLinkedWorktree(main)).toBe(false);
    expect(isLinkedWorktree(wt)).toBe(true);
    expect(isLinkedWorktree(join(root, "nope"))).toBeNull();
  });

  it("is shared only at the default location and only for a main working tree", () => {
    expect(isSharedCheckout(main, main)).toBe(true);
    expect(isSharedCheckout(wt, main)).toBe(false); // RTM_REPORT_DIRS pointing at a worktree
    expect(isSharedCheckout(wt, wt)).toBe(false); // a worktree sitting at the default path is private
    const plain = join(root, "plain");
    mkdirSync(plain);
    expect(isSharedCheckout(plain, plain)).toBe(false); // not a git repo: no peers to disturb
  });

  it("filters targets, and --shared opts out", () => {
    const targets = [
      { id: "a", dir: main, defaultDir: main },
      { id: "b", dir: wt, defaultDir: main },
    ];
    expect(sharedTargets(targets, { shared: false }).map((t) => t.id)).toEqual(["a"]);
    expect(sharedTargets(targets, { shared: true })).toEqual([]);
  });

  it("the refusal names the repo, the worktrees helper and --shared", () => {
    const msg = sharedMessage("run", [{ id: "a", dir: main, defaultDir: main }]);
    expect(msg).toContain(main);
    expect(msg).toContain("pnpm ingest worktrees a");
    expect(msg).toContain("RTM_REPORT_DIRS");
    expect(msg).toContain("--shared");
  });

  it("plans one worktree per distinct repo", () => {
    const plan = worktreePlan(
      [
        { id: "x", source: "/s/repo-1" },
        { id: "y", source: "/s/repo-1" },
        { id: "z", source: "/s/repo-2" },
      ],
      "/d"
    );
    expect(plan.map((p) => p.dest)).toEqual(["/d/repo-1", "/d/repo-2"]);
  });
});

describe("golden pages against adjudicated breaks", () => {
  const adjudicated = `breaks:
  - {page: 10, next: "The Rogers Commission concluded that", verdict: join}
  - {page: 20, next: "Chapter 2 Begins", verdict: split}
  - {page: 30, next: "Opening words here", verdict: join}
  - {page: 40, next: "whatever", verdict: unjudgeable}
`;
  it("passes agreeing pages", () => {
    const golden = `pages:
  - {pdf: 10, continues_previous: true, opens_with: "The Rogers Commission concluded"}
  - {pdf: 20, blocks: [{heading: "Chapter 2"}]}
`;
    expect(goldenVsAdjudicated(golden, adjudicated)).toEqual([]);
  });
  it("flags each kind of contradiction", () => {
    const golden = `pages:
  - {pdf: 10, blocks: [{paragraph: {start: a, end: b}}]}
  - {pdf: 20, continues_previous: true}
  - {pdf: 30, continues_previous: true, opens_with: "Something else entirely"}
  - {pdf: 40, blocks: [{heading: x}]}
`;
    expect(goldenVsAdjudicated(golden, adjudicated).map((c) => [c.page, c.kind])).toEqual([
      [10, "join-vs-opens-new"],
      [20, "split-vs-continues"],
      [30, "opening-differs"],
    ]);
  });
  it("ignores pages the golden does not assert and later volumes", () => {
    const golden = `pages:
  - {pdf: 10, must_contain: ["x"]}
  - {pdf: 20, volume: 2, continues_previous: true}
`;
    expect(goldenVsAdjudicated(golden, adjudicated)).toEqual([]);
  });
});

describe("recheck selection", () => {
  const reports = [
    { id: "a", passes: ["listedHeadings", "endnotes"] },
    { id: "b", passes: ["numberedSections"] },
  ];
  it("runs only reports declaring a changed pass", () => {
    const { run, skipped } = selectReports(reports, ["endnotes"]);
    expect(run.map((r) => r.id)).toEqual(["a"]);
    expect(skipped.map((r) => r.id)).toEqual(["b"]);
  });
  it("runs everything when no pass is named (a shared default changed)", () => {
    expect(selectReports(reports, []).run).toHaveLength(2);
  });
});
