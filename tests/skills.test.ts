// The runbooks in .claude/skills/ (AGENTS.md "Skills"): each is discoverable by Claude Code and Codex, listed in
// AGENTS.md, and names only pnpm scripts, ingest subcommands and repo paths that exist, so a skill cannot quietly
// rot when a command is renamed or a doc moves.
import { describe, expect, it } from "vitest";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const skillsDir = join(root, ".claude/skills");
const skills = readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, "SKILL.md"))).sort();
const read = (name: string) => readFileSync(join(skillsDir, name, "SKILL.md"), "utf8");
const scripts = new Set(Object.keys(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts));
const ingestCommands = new Set([...readFileSync(join(root, "scripts/ingest/cli.ts"), "utf8").matchAll(/command === "([a-z-]+)"/g)].map((m) => m[1]));

// pnpm built-ins and commands a skill names as not existing yet. Remove a pending entry when its script lands:
// the test fails while one is both pending and present, so this list cannot go stale.
const builtins = new Set(["install", "exec", "run", "add", "-C", "-s", "dlx", "wrangler", "vitest"]);
// Scripts of the @rtm/ingest repo (run in an ingest checkout), not this one.
const ingestRepo = new Set(["build", "release", "check-dist"]);
const pending: Record<string, string> = {
  "bump-pin": "site #299",
  worktrees: "site #299",
  source: "ifb5.10 (pnpm source probe)",
  report: "ifb5.11, ifb5.12 (pnpm report new/lint/ready)",
};

describe("skills (AGENTS.md, Skills)", () => {
  it("finds the skills", () => expect(skills.length).toBeGreaterThanOrEqual(15));

  it(".agents/skills (Codex) resolves to .claude/skills (Claude Code)", () => {
    const link = join(root, ".agents/skills");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(realpathSync(link)).toBe(realpathSync(skillsDir));
  });

  it.each(skills)("%s has frontmatter name = directory and a description", (name) => {
    const fm = read(name).match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
    expect(fm.match(/^name: (.+)$/m)?.[1]).toBe(name);
    const description = fm.match(/^description: (.+)$/m)?.[1] ?? "";
    expect(description.length).toBeGreaterThan(40);
    expect(description.length).toBeLessThanOrEqual(1024);
  });

  it("AGENTS.md lists every skill, and only those", () => {
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    const section = agents.split(/^## Skills$/m)[1]?.split(/^## /m)[0] ?? "";
    const listed = [...section.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]).sort();
    expect(listed).toEqual(skills);
  });

  it.each(skills)("%s names only pnpm scripts and ingest subcommands that exist", (name) => {
    const bad: string[] = [];
    for (const m of read(name).matchAll(/`[^`]*?\bpnpm ((?:-[Cs] \S+ )?)([a-z][\w-]*)(?: ([a-z][\w-]*))?/g)) {
      const [, , script, sub] = m;
      if (builtins.has(script) || ingestRepo.has(script)) continue;
      if (script in pending) continue;
      if (!scripts.has(script)) bad.push(`pnpm ${script}`);
      else if (script === "ingest" && sub && !ingestCommands.has(sub)) bad.push(`pnpm ingest ${sub}`);
    }
    expect(bad).toEqual([]);
  });

  it("no pending command already exists (remove it from the list)", () => {
    expect(Object.keys(pending).filter((s) => scripts.has(s))).toEqual([]);
  });

  it.each(skills)("%s names only repo paths that exist", (name) => {
    const missing: string[] = [];
    const text = read(name);
    const candidates = [
      ...[...text.matchAll(/`((?:docs|scripts|reports|tests|src|editorial|marketing|assets)\/[^`\s]*)`/g)].map((m) => m[1]),
      ...[...text.matchAll(/\]\((\.\.\/\.\.\/\.\.\/[^)#\s]+)/g)].map((m) => join(".claude/skills", name, m[1])),
    ];
    for (const p of candidates) {
      if (/[<>*{]|\.\.\.|…/.test(p)) continue; // a placeholder, not a path
      if (/^build\//.test(p)) continue;
      if (!existsSync(join(root, p))) missing.push(p);
    }
    expect(missing).toEqual([]);
  });
});
