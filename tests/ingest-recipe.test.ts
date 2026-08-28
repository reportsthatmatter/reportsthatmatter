import { describe, expect, it } from "vitest";
import { parseRecipe, resolveVolume } from "../scripts/ingest/recipe";

const LEVESON = `
id: uk-leveson-inquiry
title: "An Inquiry into the Culture, Practices and Ethics of the Press"
authors: "The Right Honourable Lord Justice Leveson"
published_at: "29 November 2012"
source_url: "https://example.invalid/leveson"
repo: ../uk-leveson-inquiry
volumes:
  - path: archive/0780_i.pdf
    sha256: aa11
  - path: archive/0780_ii.pdf
    sha256: bb22
`;

describe("parseRecipe", () => {
  it("reads metadata and volumes in order", () => {
    const recipe = parseRecipe(LEVESON, "uk-leveson-inquiry");
    expect(recipe.title).toBe(
      "An Inquiry into the Culture, Practices and Ethics of the Press"
    );
    expect(recipe.volumes.map((v) => v.path)).toEqual([
      "archive/0780_i.pdf",
      "archive/0780_ii.pdf",
    ]);
  });

  it("rejects a recipe whose id does not match the directory it came from", () => {
    // A copy-pasted recipe silently ingesting the wrong PDFs is the exact
    // failure this guards; the id is the one field we can cross-check.
    expect(() => parseRecipe(LEVESON, "challenger-accident")).toThrow(/id/i);
  });

  it("rejects a recipe with no volumes", () => {
    expect(() =>
      parseRecipe("id: x\ntitle: X\nrepo: ../x\nvolumes: []", "x")
    ).toThrow(/volume/i);
  });

  it("rejects a volume path that escapes the report repo", () => {
    const evil = "id: x\ntitle: X\nrepo: ../x\nvolumes:\n  - path: ../../etc/passwd\n";
    expect(() => parseRecipe(evil, "x")).toThrow(/path/i);
  });

  it("resolves a volume against the repo, not the site root", () => {
    const recipe = parseRecipe(LEVESON, "uk-leveson-inquiry");
    expect(resolveVolume(recipe, recipe.volumes[0], "/site")).toBe(
      "/uk-leveson-inquiry/archive/0780_i.pdf"
    );
  });
});

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkVolume, fileChecksum } from "../scripts/ingest/recipe";

describe("checkVolume", () => {
  const root = mkdtempSync(join(tmpdir(), "rtm-recipe-"));
  mkdirSync(join(root, "repo/archive"), { recursive: true });
  writeFileSync(join(root, "repo/archive/a.pdf"), "hello");
  const sha = fileChecksum(join(root, "repo/archive/a.pdf"));

  const recipe = parseRecipe(
    `id: x\ntitle: X\nrepo: repo\nvolumes:\n  - path: archive/a.pdf\n    sha256: ${sha}\n`,
    "x"
  );

  it("matches a correct checksum", () => {
    expect(checkVolume(recipe, recipe.volumes[0], root).matched).toBe(true);
  });

  it("reports a mismatch rather than throwing", () => {
    const wrong = parseRecipe(
      "id: x\ntitle: X\nrepo: repo\nvolumes:\n  - path: archive/a.pdf\n    sha256: deadbeef\n",
      "x"
    );
    expect(checkVolume(wrong, wrong.volumes[0], root).matched).toBe(false);
  });

  it("returns null when the recipe records no checksum", () => {
    const none = parseRecipe(
      "id: x\ntitle: X\nrepo: repo\nvolumes:\n  - path: archive/a.pdf\n",
      "x"
    );
    expect(checkVolume(none, none.volumes[0], root).matched).toBeNull();
  });
});
