import { describe, expect, it } from "vitest";
import { computeBaseline, diffBaselines } from "../scripts/ingest/baseline";

const result = (markdown: string) => ({
  markdown,
  sourceText: "",
  footnotes: [{ number: 1, text: "note", page: 1 }],
  suspects: [],
  autoFixes: 0,
  pages: 3,
});

const DOC = `---
title: "x"
---

## A Heading

Body text here.

%%page 12%%

> A quotation.

- an item
`;

describe("computeBaseline", () => {
  it("counts the structure a heuristic change would move", () => {
    const baseline = computeBaseline(result(DOC), "26.08.0");
    expect(baseline.headings).toEqual(["A Heading"]);
    expect(baseline.pageMarkers).toBe(1);
    expect(baseline.blocks.quote).toBe(1);
    expect(baseline.blocks.list).toBe(1);
    expect(baseline.poppler).toBe("26.08.0");
  });

  it("changes its markdownSha when the text changes", () => {
    const a = computeBaseline(result(DOC), "26.08.0");
    const b = computeBaseline(result(DOC.replace("Body", "Bodies")), "26.08.0");
    expect(a.markdownSha).not.toBe(b.markdownSha);
  });
});

describe("diffBaselines", () => {
  it("is empty for identical baselines", () => {
    const a = computeBaseline(result(DOC), "26.08.0");
    expect(diffBaselines(a, a)).toEqual([]);
  });

  it("names a heading that disappeared", () => {
    const a = computeBaseline(result(DOC), "26.08.0");
    const b = computeBaseline(result(DOC.replace("## A Heading", "A Heading")), "26.08.0");
    expect(diffBaselines(a, b).join("\n")).toMatch(/A Heading/);
  });

  it("reports a poppler change, because that is tool drift not a code change", () => {
    const a = computeBaseline(result(DOC), "26.08.0");
    const b = computeBaseline(result(DOC), "25.01.0");
    expect(diffBaselines(a, b).join("\n")).toMatch(/poppler/i);
  });
});
