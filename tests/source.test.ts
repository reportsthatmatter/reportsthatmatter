import { describe, expect, it, vi } from "vitest";
import { loadChangelog } from "../src/lib/source";

vi.mock("../src/lib/bundled", () => ({
  changelogText: "# Bundled Changelog",
}));

describe("source", () => {
  it("loads the changelog from the worker bundle when configured", async () => {
    const markdown = await loadChangelog("bundled");
    expect(markdown).toContain("Bundled Changelog");
  });

  it("loads the changelog from disk otherwise", async () => {
    const markdown = await loadChangelog("local");
    expect(markdown).toContain("#");
  });
});
