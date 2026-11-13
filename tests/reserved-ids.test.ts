import { describe, expect, it } from "vitest";
import * as ingest from "@rtm/ingest";
import { computeMoves, render, reservedOf, type Rendered } from "../src/lib/alias-gen";
import { addReserved, formatReserved, parseReserved, toReserved, type ReservedEntry } from "../src/lib/reserved-ids";

// reportsthatmatter-efso, decision 0012: the record of where each published id was first served, and its use.

const e = (id: string, section: string, since = "2026-11-12T10:00:00Z", fingerprint = "aaaaaaaa", next = "bbbbbbbb"): ReservedEntry => ({ id, section, fingerprint, next, since });

describe("reserved-ids.txt", () => {
  it("round-trips, grouped by first-recorded time and section, sorted", () => {
    const entries = [e("b", "s2"), e("a", "s2"), e("c", "s1", "2026-11-13T09:00:00Z", "cccccccc", "")];
    const text = formatReserved(entries);
    expect(text).toContain("## 2026-11-12T10:00:00Z s2\na aaaaaaaa bbbbbbbb\nb aaaaaaaa bbbbbbbb\n## 2026-11-13T09:00:00Z s1\nc cccccccc -\n");
    expect(parseReserved(text).sort((x, y) => x.id.localeCompare(y.id))).toEqual([e("a", "s2"), e("b", "s2"), e("c", "s1", "2026-11-13T09:00:00Z", "cccccccc", "")]);
  });

  it("keeps an id's first record: a later publication never rewrites where it was first served", () => {
    const got = addReserved([e("key-messages", "chapter-2")], [e("key-messages", "chapter-1", "2026-11-13T09:00:00Z"), e("key-messages-6", "chapter-6", "2026-11-13T09:00:00Z")]);
    expect(got.map((x) => [x.id, x.section])).toEqual([["key-messages", "chapter-2"], ["key-messages-6", "chapter-6"]]);
  });

  it("orders the renderer's list oldest first, then by suffix, and follows renamed sections", () => {
    const list = toReserved([e("km-6", "ch6", "2026-11-13T09:00:00Z"), e("km-2", "ch6"), e("km", "old-ch2"), e("km-10", "ch10")], { "old-ch2": "mid", mid: "ch2" });
    expect(list.map((r) => r.id)).toEqual(["km", "km-2", "km-10", "km-6"]);
    expect(list[0]).toEqual({ id: "km", section: "ch2", fingerprint: "aaaaaaaa", next: "bbbbbbbb" });
  });

  it("orders a family whose text ends in a number by suffix, not by that number (three identical paragraphs keep their ids)", () => {
    const list = toReserved([e("order-section-19-2", "s"), e("order-section-19", "s"), e("order-section-19-10", "s"), e("order-section-19-3", "s")]);
    expect(list.map((r) => r.id)).toEqual(["order-section-19", "order-section-19-2", "order-section-19-3", "order-section-19-10"]);
  });

  it("records each passage's next passage", () => {
    const r: Rendered = { passages: [{ id: "x", text: "One", section: "s" }, { id: "y", text: "Two", section: "s" }], sections: [{ slug: "s" }] };
    const got = reservedOf(r, "T", (t) => `fp(${t})`);
    expect(got).toEqual([
      { id: "x", section: "s", fingerprint: "fp(One)", next: "fp(Two)", since: "T" },
      { id: "y", section: "s", fingerprint: "fp(Two)", next: "", since: "T" },
    ]);
  });
});

describe("alias generation for a retired id (efso)", () => {
  it("maps an id whose text is printed more than once to the paragraph with the same text and next passage", () => {
    const p = (id: string, text: string, section: string) => ({ id, text, section });
    const before: Rendered = { passages: [p("key-messages", "Key Messages", "ch1"), p("one", "Chapter one's opening finding.", "ch1"), p("key-messages-6", "Key Messages", "ch6"), p("six", "Chapter six's opening finding.", "ch6")], sections: [{ slug: "ch1" }, { slug: "ch6" }] };
    const after: Rendered = { passages: [p("key-messages-12", "Key Messages", "ch1"), p("one", "Chapter one's opening finding.", "ch1"), p("key-messages-2", "Key Messages", "ch6"), p("six", "Chapter six's opening finding.", "ch6")], sections: [{ slug: "ch1" }, { slug: "ch6" }] };
    const { moved, lost } = computeMoves(before, after);
    expect(moved["key-messages-6"]).toBe("key-messages-2");
    expect(lost).toEqual([]);
  });
});

// Needs ingest >= v0.37.0 (renderArtifacts' `reserved`); skipped on an older pin.
const fingerprint = (ingest as { paragraphFingerprint?: (t: string) => string }).paragraphFingerprint;
describe.runIf(typeof fingerprint === "function")("rendering with reserved ids (efso, against the installed ingest)", () => {
  const filler = (tag: string) => Array.from({ length: 30 }, (_, i) => `Paragraph ${i} of ${tag} has enough distinct words about ${tag} to stand as a section, number ${i}.`).join("\n\n");
  const chapter = (n: number) => `## Chapter ${n}\n\nKey Messages\n\n${filler(`chapter${n}`)}`;
  const where = (r: Rendered) => Object.fromEntries(r.passages.map((p) => [p.id, p.section]));

  it("keeps the published ids on their chapters when an earlier chapter is added", () => {
    const published = render([chapter(2), chapter(6)].join("\n\n"));
    const reserved = toReserved(reservedOf(published, "2026-11-12T10:00:00Z", fingerprint!));
    const next = [chapter(1), chapter(2), chapter(6)].join("\n\n");
    expect(where(render(next))["key-messages"]).toBe("chapter-1");
    const w = where(render(next, ingest, reserved));
    expect(w["key-messages"]).toBe("chapter-2");
    expect(w["key-messages-2"]).toBe("chapter-6");
    expect(w["key-messages-3"]).toBe("chapter-1");
  });
});
