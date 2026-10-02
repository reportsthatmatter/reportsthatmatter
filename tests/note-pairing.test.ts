import { describe, expect, it } from "vitest";
import { bodyOf, noteDefinitions, pairNoteReferences } from "../src/lib/quality/note-pairing";

// Same cases as @rtm/ingest's resolveNoteReferences (tests/markdown.test.ts): this is a copy until
// the pin carries it (reportsthatmatter-apk), so the two must agree.
describe("pairNoteReferences", () => {
  it("pairs repeated labels by alignment and leaves the rest to the caller", () => {
    expect(pairNoteReferences(["7", "1", "1"], ["7", "1", "1"])).toEqual([0, 0, 1]);
    expect(pairNoteReferences(["1", "1", "1"], ["1", "1"])).toEqual([0, 1, null]);
    expect(pairNoteReferences(["9"], ["1", "1"])).toEqual([null]);
  });
  it("skips a stray reference and an uncited definition without moving their neighbours", () => {
    const refs = ["20", "1", "2", "20", "1", "20"];
    const defs = ["1", "2", "20", "1", "2", "20"];
    expect(pairNoteReferences(refs, defs)).toEqual([null, 0, 0, 0, 1, 1]);
  });
  it("reads definitions and the body as the renderer does", () => {
    const md = "Body.[^1]\n\n## Notes\n\n[^1]: a\n\n[^1]: b";
    expect(noteDefinitions(md)).toEqual([{ label: "1", text: "a" }, { label: "1", text: "b" }]);
    expect(bodyOf(md)).not.toContain("[^1]: a");
  });
});
