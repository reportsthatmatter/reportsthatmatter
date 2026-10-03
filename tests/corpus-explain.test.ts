import { describe, expect, it } from "vitest";
import { explainGone, explainNew, type Section } from "../scripts/lib/corpus-explain";

const s = (slug: string, paragraphs: number, ids = `ids-${slug}-${paragraphs}`): Section => ({ slug, title: slug, paragraphs, ids });

describe("explainGone", () => {
  it("says a short section was folded into the one before it, when that one gained its paragraphs", () => {
    const before = [s("intro", 40), s("preface", 3), s("chapter-1", 100)];
    const after = [s("intro", 43), s("chapter-1", 100)];
    const why = explainGone(before, after, "preface");
    expect(why).toMatch(/folded into the section before it, intro, which gained 3 paragraphs/);
    expect(why).toMatch(/sliver rule/);
  });

  it("falls forward to the next section when the previous one did not grow", () => {
    const before = [s("intro", 40), s("part-1", 2), s("chapter-1", 100)];
    const after = [s("intro", 40), s("chapter-1", 102)];
    expect(explainGone(before, after, "part-1")).toMatch(/folded forward into the section after it, chapter-1, which gained 2/);
  });

  it("counts every vanished section in a gap, and names them", () => {
    const before = [s("a", 10), s("b", 2), s("c", 3), s("d", 10)];
    const after = [s("a", 15), s("d", 10)];
    const why = explainGone(before, after, "b");
    expect(why).toMatch(/folded into the section before it, a, which gained 5 paragraphs/);
    expect(why).toMatch(/with 1 other section in the same gap, 5 paragraphs in all/);
  });

  it("recognises a rename by its unchanged paragraph ids", () => {
    const before = [s("a", 10), s("old-name", 7, "same")];
    const after = [s("a", 10), s("new-name", 7, "same")];
    expect(explainGone(before, after, "old-name")).toBe("renamed to new-name (same 7 paragraph ids)");
  });

  it("does not claim a merge when no neighbour gained the paragraphs", () => {
    const before = [s("a", 10), s("b", 8), s("c", 10)];
    const after = [s("a", 10), s("c", 10)];
    expect(explainGone(before, after, "b")).toMatch(/no neighbouring section gained its 8 paragraphs/);
  });

  it("explains a section lost when the neighbour gained too few", () => {
    const before = [s("a", 10), s("b", 8), s("c", 10)];
    const after = [s("a", 12), s("c", 10)];
    expect(explainGone(before, after, "b")).toMatch(/no neighbouring section gained/);
  });
});

describe("explainNew", () => {
  it("says a new section was split out of a neighbour that lost the paragraphs", () => {
    const before = [s("a", 50), s("c", 10)];
    const after = [s("a", 40), s("b", 10), s("c", 10)];
    expect(explainNew(before, after, "b")).toMatch(/split out of the section before it, a, which lost 10 paragraphs/);
  });

  it("recognises a rename", () => {
    const before = [s("old", 5, "same")];
    const after = [s("new", 5, "same")];
    expect(explainNew(before, after, "new")).toBe("renamed from old (same 5 paragraph ids)");
  });

  it("is honest when nothing shrank", () => {
    expect(explainNew([s("a", 5)], [s("a", 5), s("b", 4)], "b")).toMatch(/not taken from a neighbouring section/);
  });
});
