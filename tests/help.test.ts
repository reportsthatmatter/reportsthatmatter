import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { headerOf, wantsHelp } from "../scripts/lib/help.mjs";
import { parsePin } from "../scripts/lib/old-ingest";

const root = join(import.meta.dirname, "..");
const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts as Record<string, string>;

// Every `node|tsx <file>` entry point in package.json.
const entries = Object.entries(scripts)
  .map(([name, cmd]) => [name, cmd.match(/(?:^|&& )(?:tsx|node) (scripts\/[^\s]+\.(?:mjs|ts))/)?.[1]] as const)
  .filter((e): e is readonly [string, string] => !!e[1] && !e[1].includes("prerender-stamp")); // typecheck only stamps

describe("--help on pnpm entry points (hxo4)", () => {
  it("finds the entry points", () => expect(entries.length).toBeGreaterThan(15));

  it.each(entries)("pnpm %s imports lib/help.mjs before anything else", (_name, file) => {
    const src = readFileSync(join(root, file), "utf8");
    const imports = [...src.matchAll(/^import .*$/gm)].map((m) => m[0]);
    expect(imports[0]).toMatch(/^import "(?:\.\/lib|\.\.\/lib)\/help\.mjs";$/);
  });

  it("prints the usage block and exits 0 without running the command", () => {
    // quality ratchet writes budgets; with --help it must print the header and touch nothing
    const out = execFileSync("node_modules/.bin/tsx", ["scripts/quality.mjs", "ratchet", "--help"], { cwd: root, encoding: "utf8" });
    expect(out).toContain("pnpm quality ratchet");
    expect(out).not.toMatch(/ratcheted|lowered \d/i);
    const al = execFileSync("node_modules/.bin/tsx", ["scripts/aliases.ts", "generate", "--help"], { cwd: root, encoding: "utf8" });
    expect(al).toContain("pnpm aliases generate");
  });

  it("extracts block and line-comment headers", () => {
    expect(headerOf("/* One\n *\n *   usage: x\n */\nimport a")).toBe("One\n\n  usage: x");
    expect(headerOf("#!/usr/bin/env bash\n# Done\n# more\nset -e")).toBe("Done\nmore");
    expect(wantsHelp(["generate", "--help"])).toBe(true);
    expect(wantsHelp(["generate"])).toBe(false);
  });
});

describe("old ingest pin", () => {
  it("parses a github pin and refuses link: and ranges", () => {
    expect(parsePin("github:reportsthatmatter/ingest#v0.19.0")).toEqual({ repo: "reportsthatmatter/ingest", ref: "v0.19.0" });
    expect(parsePin("link:../ingest")).toBeNull();
    expect(parsePin("^0.19.0")).toBeNull();
    expect(parsePin(undefined)).toBeNull();
  });
});
