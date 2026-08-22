import { describe, expect, it } from "vitest";
import { renderSnippet } from "../src/templates/search";

describe("renderSnippet", () => {
  it("marks the matched span and escapes the rest", () => {
    const body = "The rioters at the Capitol had been motivated by claims.";
    const start = body.indexOf("Capitol");
    const html = renderSnippet(body, start, start + "Capitol".length, 200);
    expect(html).toBe(
      "The rioters at the <mark>Capitol</mark> had been motivated by claims."
    );
  });

  it("escapes markup that happens to be in the passage text", () => {
    const body = 'He said "<script>" before continuing.';
    const start = body.indexOf("said") + 5;
    const html = renderSnippet(body, start, start + 1, 200);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("truncates a long passage to a window around the match, with an ellipsis", () => {
    const body = `${"a ".repeat(100)}TARGET${" b".repeat(100)}`;
    const start = body.indexOf("TARGET");
    const html = renderSnippet(body, start, start + 6, 20);

    expect(html).toContain("<mark>TARGET</mark>");
    expect(html.startsWith("…")).toBe(true);
    expect(html.endsWith("…")).toBe(true);
    expect(html.length).toBeLessThan(body.length);
  });

  it("does not prepend an ellipsis when the window reaches the start", () => {
    const body = "TARGET word word word word word word word word word word";
    const html = renderSnippet(body, 0, 6, 10);
    expect(html.startsWith("…")).toBe(false);
  });

  it("snaps the window to a word boundary rather than cutting a word in half", () => {
    // window=20 puts the cut 4 characters into "eightlongword" if taken
    // literally by character count — the fix must extend past it to the
    // next space instead of leaving "eigh…" dangling.
    const body = "MATCH word word word eightlongword tail";
    const html = renderSnippet(body, 0, 5, 20);

    expect(html).toContain("eightlongword");
    expect(html).not.toContain("eigh…");
  });
});
