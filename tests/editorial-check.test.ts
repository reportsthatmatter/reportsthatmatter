import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// pnpm editorial --check (reportsthatmatter-v724): read-only, fails when src/generated/editorial.ts is stale.
// The script's data root is a fixture (EDITORIAL_ROOT); the code it runs is the real script.
const root = join(import.meta.dirname, "..");
const tsx = join(root, "node_modules/.bin/tsx");

const BODY = `<p id="so-what" data-page="30"><a class="permalink" href="#so-what">¶</a>When an advisor learned this, he informed Mr. Trump, who replied "So what?" The riot continued.</p>`;
const META = { sections: [{ slug: "one", title: "One", page: "30" }], paragraphToSection: { "so-what": "one" } };
const yaml = (quote: string) => `report: demo
status: draft
why_it_matters: Why it matters.
findings:
  - text: A finding.
    cites: [so-what]
    excerpt:
      paragraph: so-what
      quote: ${JSON.stringify(quote)}
reading_guide:
  - section: one
    why: Start here.
`;

let dir: string;
const run = (...args: string[]) =>
  spawnSync(tsx, ["scripts/editorial.mjs", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, EDITORIAL_ROOT: dir } });
const generated = () => join(dir, "src/generated/editorial.ts");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "editorial-check-"));
  for (const sub of ["editorial", "reports", "src/generated", "assets/generated/reports/demo"]) mkdirSync(join(dir, sub), { recursive: true });
  writeFileSync(join(dir, "reports/registry.yaml"), "reports:\n  - id: demo\n");
  writeFileSync(join(dir, "assets/generated/reports/demo/full-body.html"), BODY);
  writeFileSync(join(dir, "assets/generated/reports/demo/meta.json"), JSON.stringify(META));
  writeFileSync(join(dir, "editorial/demo.yaml"), yaml('who replied "So what?"'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("pnpm editorial --check", () => {
  it("fails, writing nothing, when src/generated/editorial.ts is missing or stale", () => {
    const missing = run("--check");
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("src/generated/editorial.ts differs");
    expect(existsSync(generated())).toBe(false);
    expect(existsSync(join(dir, "build"))).toBe(false);
  });

  it("passes after a plain run, and still writes nothing", () => {
    expect(run().status).toBe(0);
    const before = readFileSync(generated(), "utf8");
    rmSync(join(dir, "build"), { recursive: true });
    const clean = run("--check");
    expect(clean.status).toBe(0);
    expect(readFileSync(generated(), "utf8")).toBe(before);
    expect(existsSync(join(dir, "build"))).toBe(false);
  });

  it("fails when an editorial quote is edited after the last run, and leaves the file as it was", () => {
    run();
    const before = readFileSync(generated(), "utf8");
    writeFileSync(join(dir, "editorial/demo.yaml"), yaml("The riot continued."));
    const stale = run("--check");
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain("src/generated/editorial.ts differs");
    expect(readFileSync(generated(), "utf8")).toBe(before);
    // a plain run brings it current, and then --check passes
    expect(run().status).toBe(0);
    expect(run("--check").status).toBe(0);
  });

  it("still fails on a quote the report does not contain", () => {
    run();
    writeFileSync(join(dir, "editorial/demo.yaml"), yaml("words that are not in the report"));
    const bad = run("--check");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/problem/);
  });

  it("a plain run leaves a current file untouched", () => {
    run();
    const mtime = statSync(generated()).mtimeMs;
    expect(run().stdout).toContain("kept src/generated/editorial.ts");
    expect(statSync(generated()).mtimeMs).toBe(mtime);
  });

  it("is documented in --help", () => {
    expect(run("--help").stdout).toContain("--check");
  });
});

describe("Tier C card: true in an affected-community report (zh1w)", () => {
  const withHighlight = (quote: string) => {
    writeFileSync(join(dir, "reports/registry.yaml"), "reports:\n  - id: demo\n    affected_community: true\n");
    writeFileSync(join(dir, "editorial/demo.yaml"), yaml('who replied "So what?"').replace("status: draft", "status: approved") + `highlights:\n  - paragraph: so-what\n    quote: ${JSON.stringify(quote)}\n    card: true\n`);
  };

  it("passes a Tier A card without a warning", () => {
    withHighlight("The riot continued.");
    const out = run();
    expect(out.status).toBe(0);
    expect(out.stderr).not.toContain("Tier C");
  });

  it("warns, naming file, paragraph and word, for a Tier C card (a warning until decision 63cd)", () => {
    withHighlight("Many died as the riot continued.");
    writeFileSync(join(dir, "assets/generated/reports/demo/full-body.html"), BODY.replace("The riot continued.", "Many died as the riot continued."));
    const out = run();
    expect(out.status).toBe(0);
    expect(out.stderr).toContain('demo/so-what: card: true on a Tier C highlight (word "died")');
  });
});
