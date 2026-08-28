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
