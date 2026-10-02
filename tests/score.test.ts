import { describe, expect, it } from "vitest";
import { align } from "../src/lib/score/align";
import { parseOurs, inlineText } from "../src/lib/score/ours";
import { parseReferenceLines } from "../src/lib/score/reference";
import { score, prf } from "../src/lib/score/score";
import { decisionRows } from "../src/lib/score/decisions";
import { parsePdfXml } from "../src/lib/score/layout";
import { evaluateSignals } from "../src/lib/score/signals";
import { tokens, tokensBefore } from "../src/lib/score/tokens";
import { renderArtifacts } from "@rtm/ingest";

const w = (s: string) => tokens(s).map((t) => t.word);
const SENTENCES = Array.from({ length: 40 }, (_, i) => `sentence number ${i} talks about topic ${i * 7} in plain words here`).join(" ");

describe("tokens", () => {
  it("folds case and diacritics and keeps offsets", () => {
    expect(w("Café, 9/11 — Shehhi’s")).toEqual(["cafe", "9", "11", "shehhi", "s"]);
    expect(tokensBefore("one two three", 4)).toBe(1);
  });
});

describe("align", () => {
  it("maps identical streams one to one", () => {
    const a = w(SENTENCES);
    const r = align(a, a);
    expect([...r.map].every((j, i) => j === i)).toBe(true);
  });

  it("aligns around an insertion and a deletion", () => {
    const a = w(SENTENCES);
    const b = [...a.slice(0, 50), "extra", "words", ...a.slice(50, 200), ...a.slice(205)];
    const r = align(a, b);
    expect(r.map[49]).toBe(49);
    expect(r.map[50]).toBe(52);
    for (let i = 200; i < 205; i++) expect(r.map[i]).toBe(-1);
    expect(r.map[205]).toBe(202);
  });

  it("matches a word split in one stream and whole in the other", () => {
    const base = w(SENTENCES);
    const a = [...base.slice(0, 30), "tue", "sday", ...base.slice(30)];
    const b = [...base.slice(0, 30), "tuesday", ...base.slice(30)];
    const r = align(a, b);
    expect(r.map[30]).toBe(30);
    expect(r.map[31]).toBe(30);
    expect(r.map[32]).toBe(31);
  });

  it("leaves a different text unaligned instead of matching its stray words", () => {
    const base = w(SENTENCES);
    const other = w("the court of the case and the opinion of the judge is the one that the parties of the action read in the morning of the day");
    const otherB = w("minutes of the meeting of the board show that the members of the committee of the institute met in the city of the river");
    const a = [...base.slice(0, 100), ...other, ...base.slice(100)];
    const b = [...base.slice(0, 100), ...otherB, ...base.slice(100)];
    const r = align(a, b);
    for (let i = 100; i < 100 + other.length; i++) expect(r.map[i]).toBe(-1);
    expect(r.map[100 + other.length]).toBe(100 + otherB.length);
  });

  it("keeps order when boilerplate repeats (no first-anchor jumps)", () => {
    const boiler = w("the court has considered the record and the arguments of counsel");
    const base = w(SENTENCES);
    const a = [...boiler, ...base.slice(0, 150), ...boiler, ...base.slice(150)];
    const b = [...base.slice(0, 150), ...boiler, ...base.slice(150)];
    const r = align(a, b);
    for (let i = 0; i < boiler.length; i++) expect(r.map[i]).toBe(-1);
    expect(r.map[boiler.length + 150]).toBe(150);
  });
});

describe("parseOurs", () => {
  const md = [
    "---",
    'title: "T"',
    "---",
    "",
    "## Chapter One",
    "",
    "First paragraph with a note.[^1] And more.",
    "",
    "%%page 2%%",
    "",
    "continues here after the page break.",
    "",
    "> A quoted passage.[^2]",
    "",
    "- Item one",
    "",
    "- Item two",
    "",
    "[^1]: The first note.",
    "",
    "[^2]: The second note.",
    "",
  ].join("\n");
  const ours = parseOurs(md);

  it("types blocks, carries pages and paragraph ids", () => {
    expect(ours.body.map((b) => b.type)).toEqual(["heading", "paragraph", "paragraph", "quote", "list", "list"]);
    expect(ours.body[2].page).toBe(2);
    expect(ours.body[2].afterPageBreak).toBe(true);
    expect(ours.body[1].pid).toBe("first-paragraph-note-more");
    expect(ours.body[3].pid).toBe(ours.body[2].pid);
    expect(ours.body[5].pid).toBe(ours.body[4].pid);
  });

  it("places markers in the clean text and resolves them to definitions", () => {
    const p = ours.body[1];
    expect(p.text).toBe("First paragraph with a note. And more.");
    expect(p.markers[0].offset).toBe("First paragraph with a note.".length);
    expect(ours.notes[p.markers[0].note!].text).toBe("The first note.");
  });

  it("resolves a repeated label to its definitions in order, as the renderer does", () => {
    const o = parseOurs("A.[^3]\n\nB.[^3]\n\nC.[^3]\n\n[^3]: first\n\n[^3]: second\n");
    expect(o.body.map((b) => o.notes[b.markers[0].note!].text)).toEqual(["first", "second", "second"]);
  });

  it("strips markdown from inline text", () => {
    expect(inlineText("**Bold** and \\[x\\] [link](http://a.b)[^4]").text).toBe("Bold and [x] link");
  });
});

// A small reference and our text with one defect of each kind.
const REF = parseReferenceLines(
  [
    { type: "heading", level: 1, text: "Chapter One", section: "Ch1" },
    { type: "heading", level: 2, text: "Boarding the Flights", section: "Ch1" },
    { type: "paragraph", text: `Atta and Omari boarded a flight from Portland to Boston early in the morning. ${SENTENCES.slice(0, 200)}`, section: "Ch1", markers: [{ label: "1", offset: "Atta and Omari boarded a flight from Portland to Boston early in the morning.".length, note: "1-1" }] },
    { type: "paragraph", text: `The second paragraph of the chapter runs across a page break in the printed report and should stay whole. ${SENTENCES.slice(200, 420)}`, section: "Ch1", markers: [] },
    { type: "paragraph", text: `A third paragraph cites a note that we leave as a bare number in the text. ${SENTENCES.slice(420, 600)}`, section: "Ch1", markers: [{ label: "2", offset: "A third paragraph cites a note that we leave as a bare number in the text.".length, note: "1-2" }] },
    { type: "note", id: "1-1", label: "1", text: "FAA records of the flight from Portland, interview of the agent." },
    { type: "note", id: "1-2", label: "2", text: "Commission analysis of the radar data for the second flight." },
  ]
    .map((x) => JSON.stringify(x))
    .join("\n"),
);
const OURS_MD = [
  "## Chapter One",
  "",
  `Boarding the Flights Atta and Omari boarded a flight from Portland to Boston early in the morning.[^1] ${SENTENCES.slice(0, 200)}`,
  "",
  `The second paragraph of the chapter runs across a page break in the printed`,
  "",
  "%%page 7%%",
  "",
  `report and should stay whole. ${SENTENCES.slice(200, 420)}`,
  "",
  `A third paragraph cites a note that we leave as a bare number in the text.2 ${SENTENCES.slice(420, 600)}`,
  "",
  "[^1]: FAA records of the flight from Portland, interview of the agent.",
  "",
].join("\n");

describe("score", () => {
  const r = score(parseOurs(OURS_MD), REF);

  it("finds the spurious page-break split and the missed run-in heading split", () => {
    expect(r.boundaries.fp).toBe(1);
    const sp = r.examples.find((e) => e.metric === "spurious-split")!;
    expect(sp.cluster).toContain("page break");
    expect(sp.page).toBe(7);
    // the heading "Boarding the Flights" is fused into the paragraph: its start matches, the paragraph's does not
    expect(r.boundaries.fn).toBe(1);
    expect(prf(r.boundaries).recall).toBeCloseTo(4 / 5);
  });

  it("scores headings and their levels", () => {
    expect(r.headings).toEqual({ tp: 1, fp: 0, fn: 1 });
    expect(r.headingLevels.mapping).toEqual({ "1": 2 });
    expect(r.examples.find((e) => e.metric === "missed-heading")!.cluster).toContain("run-in");
  });

  it("links markers by place and note text, and recognises a bare number", () => {
    expect(r.markers.outcomes).toEqual({ linked: 1, "wrong-note": 0, bare: 1, missing: 0 });
    expect(prf(r.markers).recall).toBeCloseTo(0.5);
    expect(prf(r.markers).precision).toBe(1);
  });

  it("counts the bare number as out of place text, not out of vocabulary", () => {
    expect(r.text.oov).toBe(0);
  });

  it("emits decision rows without layout", () => {
    const rows = decisionRows("t", r, null);
    expect(rows.some((x) => x.decision === "boundary" && x.ref_boundary === false && x.ours_boundary === true)).toBe(true);
    expect(rows.filter((x) => x.decision === "marker")).toHaveLength(2);
    expect(rows.some((x) => x.decision === "heading" && x.ref_heading === true)).toBe(true);
  });

  it("evaluates the quality signals against the scorer's errors", () => {
    const { meta, fullBody } = renderArtifacts(OURS_MD);
    const evals = evaluateSignals({ markdown: OURS_MD, html: fullBody, meta }, r);
    const sev = evals.find((e) => e.signal === "severed-paragraph")!;
    expect(sev.findings).toBe(1);
    expect(sev.tp).toBe(1);
    expect(sev.recall).toBe(1);
  });

  it("excludes a stretch the reference does not have instead of counting it", () => {
    const extra = OURS_MD.replace("## Chapter One", `## Chapter One\n\n${Array.from({ length: 60 }, (_, i) => `front matter line ${i} unrelated to the reference`).join(" ")}`);
    const r2 = score(parseOurs(extra), REF);
    expect(r2.text.stretches.some((s) => s.side === "ours" && s.words >= 200)).toBe(true);
    expect(r2.boundaries.fp).toBe(1);
  });
});

describe("parsePdfXml", () => {
  it("merges a raised footnote number into its line", () => {
    const xml = `<page number="3" position="absolute" top="0" left="0" height="1000" width="700">
<fontspec id="0" size="15" family="Bembo" color="#000000"/>
<fontspec id="1" size="11" family="Bembo" color="#000000"/>
<text top="222" left="144" width="184" height="14" font="0">al Hazmi and Salem al Hazmi.</text>
<text top="221" left="328" width="11" height="10" font="1">11</text>
<text top="238" left="162" width="450" height="14" font="0"><b>Hani Hanjour</b> was flagged</text>
</page>`;
    const lines = parsePdfXml(xml);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("al Hazmi and Salem al Hazmi.11");
    expect(lines[0].superscript).toBe(true);
    expect(lines[1].bold).toBe(true);
    expect(lines[1].page).toBe(3);
  });
});
