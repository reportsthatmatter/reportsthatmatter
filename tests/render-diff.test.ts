import { describe, expect, it } from "vitest";
import { diffSequences, diffSnapshots, formatDiff, type Snapshot } from "../scripts/lib/render-diff";

const para = (id: string, text: string, section = "intro") => ({ id, text, section });
const snap = (paragraphs: ReturnType<typeof para>[], extra: Partial<Snapshot> = {}): Snapshot => ({
  id: "r",
  words: paragraphs.reduce((n, p) => n + p.text.split(" ").length, 0),
  sections: [{ slug: "intro", title: "Intro", paragraphs: paragraphs.length }],
  paragraphs,
  sidenotes: [],
  ...extra,
});
const long = (word: string) => `${word} `.repeat(30).trim();

describe("diffSequences", () => {
  it("finds the shortest script on a small replace", () => {
    const ops = diffSequences(["a", "b", "c", "d"], ["a", "x", "c", "d"]);
    expect(ops.filter((o) => o.kind === "del")).toHaveLength(1);
    expect(ops.filter((o) => o.kind === "ins")).toHaveLength(1);
    expect(ops.filter((o) => o.kind === "eq")).toHaveLength(3);
  });

  it("copes with a large sequence where nothing is shared", () => {
    const a = Array.from({ length: 6000 }, (_, i) => `a${i % 7}`);
    const b = Array.from({ length: 6000 }, (_, i) => `b${i % 5}`);
    expect(diffSequences(a, b).filter((o) => o.kind === "eq")).toHaveLength(0);
  });
});

describe("diffSnapshots", () => {
  it("reports an unchanged report as unchanged", () => {
    const s = snap([para("a", long("alpha")), para("b", long("beta"))]);
    const d = diffSnapshots(s, s);
    expect(d.moved).toBe(false);
    expect(formatDiff(d)).toContain("unchanged");
  });

  it("calls two paragraphs becoming one a join, with the ids lost and gained", () => {
    const before = snap([para("p1", `${long("alpha")} and the`), para("p2", `${long("beta")} followed`), para("p3", long("gamma"))]);
    const after = snap([para("p1-2", `${long("alpha")} and the ${long("beta")} followed`), para("p3", long("gamma"))]);
    const d = diffSnapshots(before, after);
    expect(d.counts.join).toBe(1);
    expect(d.counts.split).toBe(0);
    expect(d.idsLost).toBe(2);
    expect(d.idsNew).toBe(1);
    expect(formatDiff(d)).toMatch(/join 2→1/);
  });

  it("calls one paragraph becoming two a split", () => {
    const before = snap([para("p1", `${long("alpha")} ${long("beta")}`), para("p3", long("gamma"))]);
    const after = snap([para("p1", long("alpha")), para("p2", long("beta")), para("p3", long("gamma"))]);
    expect(diffSnapshots(before, after).counts.split).toBe(1);
  });

  it("calls a paragraph that left one place and arrived in another a move, not a removal and an addition", () => {
    const keep = [para("a", long("alpha")), para("b", long("beta")), para("c", long("gamma")), para("d", long("delta")), para("e", long("epsilon"))];
    const before = snap(keep);
    const after = snap([keep[0], keep[2], keep[3], keep[4], keep[1]]);
    const d = diffSnapshots(before, after);
    expect(d.counts.moved).toBe(1);
    expect(d.counts.added).toBe(0);
    expect(d.counts.removed).toBe(0);
  });

  it("counts changed text, sidenotes, words and sections", () => {
    const before = snap([para("a", long("alpha")), para("b", long("beta"))], { sidenotes: ["sn-1-1", "sn-2-2"] });
    const after = snap([para("a", long("alpha")), para("b", `${long("beta")} extra`)], {
      sidenotes: ["sn-1-1"],
      sections: [{ slug: "other", title: "Other", paragraphs: 2 }],
    });
    const d = diffSnapshots(before, after);
    expect(d.counts.changed).toBe(1);
    expect(d.sidenotes).toEqual([2, 1]);
    expect(d.sectionsGone).toEqual(["intro"]);
    expect(d.sectionsNew).toEqual(["other"]);
    expect(d.words[1]).toBeGreaterThan(d.words[0]);
  });

  it("ignores respacing and re-hyphenation when matching text", () => {
    const d = diffSnapshots(snap([para("a", "the govern- ment said so and so on and on")]), snap([para("a", "the government said so and so on and on")]));
    expect(d.counts.changed).toBe(0);
  });
});
