// docs/CHANGELOG.md entries carry an image (AGENTS.md "Changelog"): Rufus, 2026-11-13, after entries kept shipping
// without one. An entry dated after the cutoff needs a Markdown image or an explicit `<!-- no-image: reason -->`.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CUTOFF = "2026-11-13";
const text = readFileSync(join(import.meta.dirname, "..", "docs/CHANGELOG.md"), "utf8");
const entries = text.split(/^## /m).slice(1).map((e) => ({ date: e.slice(0, 10), title: e.split("\n")[0], body: e }));

describe("changelog (AGENTS.md, Changelog)", () => {
  it("parses dated entries", () => expect(entries.length).toBeGreaterThan(10));

  it("every entry after the cutoff has an image or a no-image reason", () => {
    const missing = entries
      .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date > CUTOFF)
      .filter((e) => !/!\[[^\]]*\]\([^)]+\)/.test(e.body) && !/<!--\s*no-image:\s*\S/.test(e.body))
      .map((e) => e.title);
    expect(missing).toEqual([]);
  });
});
