import { describe, expect, it } from "vitest";
import { parseDoctags } from "../src/lib/vision/doctags";
import { verifyPage, verifyWithLayout, noteLines, renderVerified } from "../src/lib/vision/verify";
import { comparePage, parsePageText, visionDoc, verifiedDoc, editAlign, oursDoc, tally } from "../src/lib/vision/compare";

const LOREM = Array.from({ length: 30 }, (_, i) => `w${i}x`).join(" ");
const dt = (body: string) => `<doctag>${body}</doctag>`;
const text = (t: string) => `<text><loc_1><loc_2><loc_3><loc_4>${t}</text>`;
const note = (t: string) => `<footnote><loc_1><loc_2><loc_3><loc_4>${t}</footnote>`;

describe("parseDoctags", () => {
  it("types blocks, drops nothing silently, and finds markers only for labels the page defines", () => {
    const b = parseDoctags(
      dt(`<section_header_level_1><loc_1><loc_2><loc_3><loc_4>I. THE RESULTS 1</section_header_level_1>` + text("He lost.2 Then he said \"no\" 3 and ECF No. 252 agreed.") + note("1 First note.") + note("2 Second note.") + note("3 Third note.") + `<page_footer><loc_1><loc_2><loc_3><loc_4>7</page_footer>`)
    );
    expect(b.map((x) => x.type)).toEqual(["heading", "paragraph", "footnote", "footnote", "footnote", "furniture"]);
    expect(b[0].level).toBe(2);
    expect(b[0].markers.map((m) => m.label)).toEqual(["1"]);
    expect(b[1].markers.map((m) => m.label)).toEqual(["2", "3"]);
    expect(b[2].label).toBe("1");
  });
  it("reads list items inside a list container (a lazy match on the container drops them all)", () => {
    const b = parseDoctags(dt(`<unordered_list><list_item><loc_1><loc_2><loc_3><loc_4>1. First finding.</list_item>\n<list_item><loc_1><loc_2><loc_3><loc_4>2. Second finding.</list_item>\n</unordered_list>` + text("Then a paragraph.")));
    expect(b.map((x) => [x.type, x.text])).toEqual([["list_item", "1. First finding."], ["list_item", "2. Second finding."], ["paragraph", "Then a paragraph."]]);
  });
  it("does not take 'Biden. 134' for a citation 'n. 134'", () => {
    const b = parseDoctags(dt(text("in favor of Mr. Biden. 134") + note("134 See ECF No. 1.")));
    expect(b[0].markers.map((m) => m.label)).toEqual(["134"]);
  });
});

describe("verifyPage", () => {
  const layer = `${LOREM}\nsecond paragraph of the page runs here with seven more words\nafter that the page stops`;
  it("accepts blocks whose words are the layer's, and carries the layer's words", () => {
    const blocks = parseDoctags(dt(text(LOREM) + text("second paragraph of the page runs here with seven more words") + text("after that the page stops")));
    const v = verifyPage(blocks, layer);
    expect(v.status).toBe("accepted");
    expect(v.blocks).toHaveLength(3);
    expect(v.coverage).toBeGreaterThan(0.99);
  });
  it("keeps the layer's word where the model misread one, and still accepts the block", () => {
    const blocks = parseDoctags(dt(text(LOREM.replace("w5x", "wsx")) + text("second paragraph of the page runs here with seven more words") + text("after that the page stops")));
    const v = verifyPage(blocks, layer);
    expect(v.status).toBe("accepted");
    expect(v.blocks[0].text).toContain("w5x");
    expect(v.blocks[0].text).not.toContain("wsx");
  });
  it("flags a line the model dropped (the failure that fluent output hides)", () => {
    const blocks = parseDoctags(dt(text(LOREM) + text("after that the page stops")));
    const v = verifyPage(blocks, layer);
    expect(v.status).toBe("partial");
    expect(v.missing.length).toBe(1);
    expect(v.blocks.some((b) => !b.accepted && b.text.includes("second paragraph"))).toBe(true);
  });
  it("rejects a block whose words are not in the layer", () => {
    const blocks = parseDoctags(dt(text(LOREM) + text("a wholly invented paragraph that no scan ever printed anywhere at all") + text("after that the page stops")));
    const v = verifyPage(blocks, layer);
    expect(v.blocks.find((b) => b.visionText.startsWith("a wholly"))!.accepted).toBe(false);
  });
  it("vouches for a short block the layer garbled by the blocks either side of it and the size of the gap", () => {
    const layerG = `${LOREM}\n11. CONCLUSIONS\nsecond paragraph of the page runs here with seven more words`;
    const blocks = parseDoctags(dt(text(LOREM) + `<section_header_level_1><loc_1><loc_2><loc_3><loc_4>II. CONCLUSIONS</section_header_level_1>` + text("second paragraph of the page runs here with seven more words")));
    const v = verifyPage(blocks, layerG);
    expect(v.status).toBe("accepted");
    expect(v.blocks[1].anchored).toBe(true);
    expect(v.blocks[1].text).toBe("11. CONCLUSIONS"); // the layer's words, not the model's
  });
  it("does not anchor a short block when the gap is the wrong size", () => {
    const layerG = `${LOREM}\nthis heading has gone from the page entirely and so on and on\nsecond paragraph of the page runs here with seven more words`;
    const blocks = parseDoctags(dt(text(LOREM) + `<section_header_level_1><loc_1><loc_2><loc_3><loc_4>II. CONCLUSIONS</section_header_level_1>` + text("second paragraph of the page runs here with seven more words")));
    expect(verifyPage(blocks, layerG).blocks.find((b) => b.visionText === "II. CONCLUSIONS")!.accepted).toBe(false);
  });
  it("never flags a page with no blocks as accepted", () => {
    expect(verifyPage([], layer).status).toBe("flagged");
  });
});

describe("verifyWithLayout", () => {
  it("retypes a block the model left as body when the layout sets it in note size", () => {
    const body = "the court held that the rule applied to every person in the district without exception";
    const nt = "7 See the docket entry and the order of the court filed on the second of March";
    const lines = [
      { text: body, size: 18, top: 100, left: 50, pageHeight: 1000 },
      { text: nt, size: 14, top: 800, left: 50, pageHeight: 1000 },
    ];
    const withNote = noteLines(lines, 18);
    expect(withNote.map((l) => l.note)).toEqual([false, true]);
    const blocks = parseDoctags(dt(text(body + " 7") + text(nt)));
    const v = verifyWithLayout(blocks, withNote);
    expect(v.blocks[1].type).toBe("footnote");
    expect(v.blocks[1].retyped).toBe("paragraph>footnote");
    expect(v.blocks[0].markers.map((m) => m.label)).toEqual(["7"]);
    expect(renderVerified(v, v.layerText)).toContain("[^7]");
  });
});

describe("compare", () => {
  it("scores words, block starts, headings, notes and markers against a checked page", () => {
    const ref = parsePageText("# A HEADING\n\nFirst paragraph here.[^1] It goes on.\n\nSecond paragraph begins now.", "[^1]: The note says so.");
    const same = comparePage(ref, ref);
    expect(same.errors).toBe(0);
    expect(same.boundaries).toEqual([3, 3, 3]); // two paragraph starts in the body, the first note's start in the notes
    expect(same.headings[0]).toBe(0); // the heading is the first block: its start is not a decision
    expect(same.markers).toEqual([1, 1, 1]);
    // a merged paragraph loses a start
    const merged = parsePageText("# A HEADING\n\nFirst paragraph here.[^1] It goes on. Second paragraph begins now.", "[^1]: The note says so.");
    const m = comparePage(ref, merged);
    expect(m.boundaries).toEqual([2, 2, 3]); // the second paragraph's start is missed
  });
  it("editAlign lets the source run past the page at both ends", () => {
    const e = editAlign("b c d".split(" "), "a b c d e".split(" "));
    expect(e.sub + e.del + e.ins).toBe(0);
  });
  it("visionDoc lifts a marker's digits out of the words", () => {
    const b = parseDoctags(dt(text("He lost.2 Then more.") + note("2 A note.")));
    const doc = visionDoc(b);
    expect(doc.blocks[0].text).toBe("He lost. Then more.");
    expect(doc.blocks[0].markers).toEqual([{ label: "2", offset: 8 }]);
    expect(verifiedDoc).toBeTypeOf("function");
  });
});

describe("oursDoc", () => {
  const para = (n: number) => Array.from({ length: 12 }, (_, i) => `w${n}x${i}`).join(" ");
  it("finds a page's stretch of full.md, and with a label ignores a repeat of the same text elsewhere", () => {
    const md = [`%%page 1%%`, para(1), para(2), `%%page 2%%`, para(3), para(4), `%%page 3%%`, para(5), para(3) + " " + para(4), `[^1]: a note`].join("\n\n");
    const ref = parsePageText(`${para(3)}\n\n${para(4)}`);
    const withLabel = oursDoc(md, ref, "2");
    expect(withLabel.blocks.map((b) => b.text)).toEqual([para(3), para(4)]);
    const none = oursDoc(md, ref);
    expect(none.blocks.length).toBeGreaterThan(0); // a global alignment still answers, from whichever copy it anchors on
  });
});

describe("tally", () => {
  it("says who reads each checked word right where the layer and the model disagree", () => {
    const ref = parsePageText("alpha beta gamma delta epsilon zeta eta theta");
    const layer = parsePageText("alpha beta gamma delta epsilon zeta eta theta".replace("gamma", "garnma"));
    const model = parsePageText("alpha beta gamma delta epsilon zeta eta theta".replace("delta", "dolta"));
    expect(tally(ref, layer, model)).toEqual({ bothRight: 6, layerOnly: 1, modelOnly: 1, bothWrong: 0 });
  });
});
