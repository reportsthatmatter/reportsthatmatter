import { describe, expect, it } from "vitest";
import { checkAnchors, numberCandidates, parseServed, readPrinted, wordsOf, type PageText } from "../src/lib/anchors";
import { formatEditionReport } from "../scripts/ingest/edition-report";

// Deterministic nonsense words, so every 6-word shingle is unique to its page.
let seed = 7;
const word = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  const letters = "bcdfghjklmnpqrstvwxz";
  let w = "";
  for (let i = 0; i < 6; i++) w += letters[(seed >> (i * 3)) % letters.length] + "aeiou"[(seed >> (i * 2 + 1)) % 5];
  return w;
};
const sentence = (n: number) => Array.from({ length: n }, word).join(" ");

/** Two paragraphs per page; the second of page k runs onto page k+1 when `runOn` is set. */
function book(printedFrom: number, pages: number) {
  const paras = Array.from({ length: pages * 2 }, () => sentence(40));
  const layout: string[] = [];
  const text: string[] = [];
  for (let p = 0; p < pages; p++) {
    const own = [paras[2 * p], paras[2 * p + 1]];
    text.push(own.join("\n"));
    layout.push(`Running head of the report\n\n${own.join("\n\n")}\n\n                    ${printedFrom + p}\n`);
  }
  return { paras, pages: layout.map((l, i): PageText => ({ volume: 1, pdfIndex: i + 1, layout: l, words: text[i] })) };
}

describe("printed page numbers from the text layer", () => {
  it("reads a folio alone, beside a running head, in parentheses or as Page N", () => {
    expect(numberCandidates("Head\nbody\n\n        49\n")).toContain("49");
    expect(numberCandidates("Chapter 2: Outline of events   49\nbody text\n")).toContain("49");
    expect(numberCandidates("body\n(3)\n")).toContain("3");
    expect(numberCandidates("body\n- 12 -\n")).toContain("12");
    expect(numberCandidates("body\nPage 7 of 20\n")).toContain("7");
    expect(numberCandidates("body\n   xii\n")).toContain("xii");
  });

  it("keeps a number only where a neighbour runs in step, and infers a gap between two that agree", () => {
    const pages = ["a\n 10\n", "b\n 11\n", "c (figure, no folio)\n", "d\n 13\n", "e\n 99\n", "f\n 15\n"];
    const read = readPrinted(pages);
    expect(read.map((r) => r.number)).toEqual(["10", "11", "12", "13", "14", "15"]);
    expect(read[2].inferred).toBe(true);
    // page e's "99" has no neighbour in step: the page number is inferred from 13 and 15
    expect(read[4]).toEqual({ number: "14", inferred: true });
  });
});

describe("the served text", () => {
  it("records each marker's word position and each block's first word, and stops at the notes", () => {
    const s = parseServed("---\ntitle: x\n---\n\n# Head\n\n%%page 3%%\n\nOne two[^1] three.\n\n%%page 4#2%%\n\nFour five.\n\n## Notes\n\n[^1]: Note words.\n");
    expect(s.words).toEqual(["head", "one", "two", "three", "four", "five"]);
    expect(s.markers.map((m) => [m.label, m.occurrence, m.pos])).toEqual([["3", undefined, 1], ["4", 2, 4]]);
    expect(s.boundaries).toEqual([0, 1, 4, 6]);
    expect(s.markers[0].line).toBe(7);
  });

  it("folds case, diacritics and apostrophes, and drops short numbers (note markers, folios)", () => {
    expect(wordsOf("Café O’Donnell’s 12 1972 ﬁnal")).toEqual(["cafe", "odonnells", "1972", "final"]);
  });
});

describe("checkAnchors", () => {
  it("passes markers at the page break, and at the end of a block a page starts inside", () => {
    const { paras, pages } = book(1, 4);
    // page 2 starts with its own paragraph (marker exact); page 3's first paragraph is page 2's run-on
    // tail joined into one block, marked after it (the cleanEdition convention)
    pages[1].words = `${paras[2]}\n${paras[3].slice(0, 120)}`;
    pages[2].words = `${paras[3].slice(120)}\n${paras[5]}`;
    const md = [`%%page 1%%`, paras[0], paras[1], `%%page 2%%`, paras[2], paras[3], `%%page 3%%`, paras[5], `%%page 4%%`, paras[6], paras[7]].join("\n\n");
    const r = checkAnchors(md, pages);
    expect(r.scheme).toBe("printed");
    expect(r.verdicts.map((v) => v.verdict)).toEqual(["exact", "exact", "block", "exact"]);
    expect(r.wrong).toBe(0);
    expect(r.blocks.wrong).toBe(0);
  });

  it("fails a marker a paragraph late, and the paragraph it leaves under the wrong page", () => {
    const { paras, pages } = book(1, 3);
    const md = [`%%page 1%%`, paras[0], paras[1], paras[2], `%%page 2%%`, paras[3], `%%page 3%%`, paras[4], paras[5]].join("\n\n");
    const r = checkAnchors(md, pages);
    expect(r.verdicts[1]).toMatchObject({ label: "2", verdict: "wrong" });
    expect(r.verdicts[1].delta).toBeGreaterThan(30);
    expect(r.blocks.wrong).toBe(1);
    expect(r.blocks.wrongBlocks[0]).toMatchObject({ marker: "1", printedOn: "2" });
  });

  it("names a page no marker carries, and counts the blocks left under the previous page", () => {
    const { paras, pages } = book(1, 4);
    const md = [`%%page 1%%`, paras[0], paras[1], `%%page 2%%`, paras[2], paras[3], paras[4], paras[5], `%%page 4%%`, paras[6], paras[7]].join("\n\n");
    const r = checkAnchors(md, pages);
    expect(r.unmarked).toEqual([{ volume: 1, pdfIndex: 3, label: "3" }]);
    expect(r.blocks).toMatchObject({ wrong: 2, onUnmarked: 2 });
  });

  it("counts markers stacked after a block that runs over more than one page break", () => {
    const { paras, pages } = book(1, 3);
    // one block holding the end of page 1, all of page 2 and the start of page 3 (a long table)
    const long = [paras[1], paras[2], paras[3], paras[4]].join(" ");
    const md = [`%%page 1%%`, paras[0], long, `%%page 2%%`, `%%page 3%%`, paras[5]].join("\n\n");
    const r = checkAnchors(md, pages);
    expect(r.verdicts.map((v) => v.verdict)).toEqual(["exact", "block", "block"]);
    expect(r.stacked).toBe(1);
  });

  it("reads labels as PDF page indexes when that is what the markers are", () => {
    const { paras, pages } = book(101, 3);
    const md = [`%%page 1%%`, paras[0], paras[1], `%%page 2%%`, paras[2], paras[3], `%%page 3%%`, paras[4], paras[5]].join("\n\n");
    const r = checkAnchors(md, pages);
    expect(r.scheme).toBe("pdf-volume");
    expect(r.exact).toBe(3);
  });

  it("does not take a stray match of a running head for the page's start", () => {
    const { paras, pages } = book(1, 3);
    // page 3 opens with a running head that the served text prints once, as a heading, a long way
    // before (followed by front matter the PDF pages here do not hold)
    const heading = sentence(7);
    pages[2].words = `${heading}\n${pages[2].words}`;
    const front = Array.from({ length: 10 }, () => sentence(40));
    const md = [`## ${heading}`, ...front, `%%page 1%%`, paras[0], paras[1], `%%page 2%%`, paras[2], paras[3], `%%page 3%%`, paras[4], paras[5]].join("\n\n");
    const r = checkAnchors(md, pages);
    expect(r.verdicts.map((v) => v.verdict)).toEqual(["exact", "exact", "exact"]);
  });
});

describe("formatEditionReport", () => {
  it("prints the edition's alignment, pages and disagreements", () => {
    const out = formatEditionReport({
      sources: [{ path: "reference/raw/a.htm", sha256: "x" }],
      editionWords: 1000,
      alignedWords: 990,
      oov: 2,
      oovExamples: ["teh", "adn"],
      pdfWords: 1010,
      pdfAligned: 990,
      pages: { anchored: 40, placedByNeighbour: 2, frontMatterSkipped: 3 },
      dashesRestored: 5,
      spacesRestored: 1,
      hyphensClosed: 0,
      disagreements: { editionNotInPdf: 4, pdfNotInEdition: 1 },
    });
    expect(out).toContain("990 of 1,000 (99.00%)");
    expect(out).toContain("OOV): 2 — e.g. teh, adn");
    expect(out).toContain("40 anchored by their own words, 2 placed by a neighbour, 3 front-matter pages skipped");
    expect(out).toContain("4 edition stretches not in the PDF, 1 PDF stretches not in the edition");
  });
});
