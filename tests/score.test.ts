import { describe, expect, it } from "vitest";
import { align } from "../src/lib/score/align";
import { parseOurs, inlineText } from "../src/lib/score/ours";
import { parseReferenceLines, referenceFromMarkdown } from "../src/lib/score/reference";
import { score, prf } from "../src/lib/score/score";
import { decisionRows, labelFlags } from "../src/lib/score/decisions";
import { parsePdfXml, prepareLayout } from "../src/lib/score/layout";
import type { Line } from "../src/lib/score/layout";
import { adjudicationStats, applyAdjudication, draftAdjudication, matchRow } from "../src/lib/score/adjudicated";
import { evaluateSignals } from "../src/lib/score/signals";
import { tokens, tokensBefore } from "../src/lib/score/tokens";
import { alignPage, scorePages } from "../src/lib/score/pages";
import { cleanWikitext } from "../src/lib/score/wikisource";
import { renderArtifacts } from "@rtm/ingest";
import { fmtDelta, joinAccuracy, mergeScores, referenceWarning, regressed, type Metrics } from "../src/lib/score/headline";
import { goldenTable, oracleTable, parseVerify } from "../src/lib/score/scorecard";

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

const line = (page: number, top: number, left: number, text: string, extra: Partial<Line> = {}): Line => ({
  page, pageHeight: 1000, pageWidth: 800, top, left, width: Math.max(40, text.length * 6), height: 14, size: 12, font: "0", family: "Bembo", color: "#000", bold: false, italic: false, superscript: false, text, ...extra,
});

describe("prepareLayout", () => {
  it("orders a two-column page column by column, with a full-width line closing the band", () => {
    const rows: Line[] = [];
    for (let i = 0; i < 9; i++) {
      // interleaved as a stream might emit them: left, right, left, right ...
      rows.push(line(1, 100 + i * 20, 50, `left column line number ${i} of text`, { width: 300 }));
      rows.push(line(1, 100 + i * 20, 430, `right column line number ${i} of text`, { width: 300 }));
    }
    const out = prepareLayout(rows).map((l) => l.text);
    expect(out.slice(0, 9).every((t) => t.startsWith("left"))).toBe(true);
    expect(out.slice(9).every((t) => t.startsWith("right"))).toBe(true);
    expect(prepareLayout(rows).every((l) => l.column === 0 || l.column === 1)).toBe(true);
  });
  it("marks the small lines at the foot of a page as notes, not the last body line", () => {
    const body = Array.from({ length: 12 }, (_, i) => line(1, 100 + i * 20, 100, `a long enough body line of running text ${i}`, { width: 500 }));
    const notes = [line(1, 800, 100, "1. Letter from Mr X to Mr Y, 4 March 1989, p12", { size: 9, width: 400 }), line(1, 815, 100, "2. Minute of a meeting, p3", { size: 9, width: 300 })];
    const out = prepareLayout([...body, ...notes]);
    expect(out.filter((l) => l.note).map((l) => l.text)).toEqual(notes.map((l) => l.text));
    expect(out.filter((l) => !l.note)).toHaveLength(12);
  });
  it("joins a hanging paragraph label to the text beside it, whichever order they were emitted in", () => {
    const rows = [line(1, 200, 120, "The situation in Londonderry was serious. By this stage the", { width: 500 }), line(1, 200, 60, "2.6", { width: 20 }), line(1, 220, 120, "nationalist community had largely turned against the soldiers", { width: 500 })];
    const out = prepareLayout(rows);
    expect(out.map((l) => l.text.slice(0, 20))).toEqual(["2.6 The situation in", "nationalist communit"]);
    expect(out[0].left).toBe(60);
  });
});

describe("label confidence", () => {
  it("flags a reference split that follows an unfinished sentence in lower case", () => {
    expect(labelFlags({ ref_boundary: true, prev_ends_sentence: false, prev_ends_hyphen: false, next_first: "lower", crosses_page: true, ref_next_type: "paragraph" })).toContain("ref-splits-lowercase-after-unfinished");
    expect(labelFlags({ ref_boundary: true, prev_ends_sentence: true, next_first: "upper", crosses_page: true, ref_next_type: "paragraph" })).toEqual([]);
  });
  it("flags a reference that joins a numbered line, and says nothing where the reference has no answer", () => {
    expect(labelFlags({ ref_boundary: false, next_starts_label: true })).toContain("ref-joins-labelled-line");
    expect(labelFlags({ ref_boundary: null, next_starts_label: true })).toEqual([]);
  });
});

describe("adjudicated page breaks", () => {
  const rows = [
    { decision: "boundary", source: "layout", crosses_page: true, page: 10, next_text: "and hove [sic] to do the whole job", prev_text: "have a Judicial Review", ref_boundary: true, ours_boundary: false },
    { decision: "boundary", source: "layout", crosses_page: true, page: 11, next_text: "2.8.54 On 23 June 1989 he met", prev_text: "correctly", ref_boundary: true, ours_boundary: true },
    { decision: "boundary", source: "layout", crosses_page: true, page: 12, next_text: "the fans", prev_text: "goaded by", ref_boundary: null, ours_boundary: false },
  ] as never[];
  const file = {
    report: "x",
    breaks: [
      { page: 10, prev: "Judicial Review", next: "and hove [sic]", verdict: "join" as const, stratum: "random" as const },
      { page: 11, prev: "correctly", next: "2.8.54 On 23 June", verdict: "split" as const, stratum: "random" as const },
      { page: 12, prev: "goaded by", next: "the fans", verdict: "join" as const, stratum: "disagreement" as const },
      { page: 99, prev: "", next: "nowhere", verdict: "join" as const },
      { page: 10, prev: "", next: "x", verdict: "unjudgeable" as const },
    ],
  };
  it("matches an adjudication to its page-break row by page and opening words", () => {
    expect(matchRow(rows, file.breaks[0])).toBe(rows[0]);
    expect(matchRow(rows, file.breaks[3])).toBeNull();
  });
  it("counts the reference wrong where it disagrees with the verdict, and leaves uncovered rows out", () => {
    const pairs = applyAdjudication(rows, file);
    const s = adjudicationStats(pairs);
    expect(s.judged).toBe(2);
    expect(s.referenceWrong).toBe(1); // row 0: reference split, truth join
    expect(s.referenceErrorRate).toBe(0.5);
    expect(s.uncovered).toBe(1);
    expect(s.unmatched).toBe(1);
    expect(s.unjudgeable).toBe(1);
    expect(s.referenceWrongAs.splitWhereJoin).toBe(1);
    expect(s.oursWrong).toBe(0);
    expect(s.oursJudged).toBe(3);
  });
  it("drafts a seeded sample, random first and then disagreements", () => {
    const pool = Array.from({ length: 60 }, (_, i) => ({ decision: "boundary", source: "layout", crosses_page: true, page: i + 2, ref_boundary: i % 2 === 0, ours_boundary: i % 3 === 0, ref_next_type: "paragraph", prev_text: "a", next_text: "b" })) as never[];
    const a = draftAdjudication("r", pool, 5, 3);
    expect(a).toBe(draftAdjudication("r", pool, 5, 3));
    expect((a.match(/stratum: random/g) ?? []).length).toBe(5);
    expect((a.match(/stratum: disagreement/g) ?? []).length).toBe(3);
  });
});

describe("referenceFromMarkdown (--shadow)", () => {
  const served = [
    "## Chapter",
    "",
    "%%page 1%%",
    "",
    "The flight left at 7:59 and the crew reported nothing unusual on the climb.[^1-1]",
    "",
    "> A quotation set apart.",
    "",
    "## Notes",
    "",
    "[^1-1]: The note's text.",
    "",
  ].join("\n");

  it("turns the served text into a reference: types, levels, notes and the markers that name them", () => {
    const ref = referenceFromMarkdown(parseOurs(served));
    expect(ref.map((b) => b.type)).toEqual(["heading", "paragraph", "quote", "note"]);
    expect(ref[0].level).toBe(2);
    const note = ref.find((b) => b.type === "note")!;
    expect(ref[1].markers[0].note).toBe(note.id);
    expect(note.ref).toBe(1);
    expect(note.label).toBe("1");
  });

  it("scores a text against itself as perfect", () => {
    const r = score(parseOurs(served), referenceFromMarkdown(parseOurs(served)));
    expect(prf(r.boundaries).f1).toBe(1);
    expect(prf(r.markers).f1).toBe(1);
  });
});

describe("headline scores (38s.6)", () => {
  const adj = (over: Partial<ReturnType<typeof adjudicationStats>> = {}) => ({ ...adjudicationStats([]), judged: 30, uncovered: 0, referenceWrong: 0, referenceErrorRate: 0, referenceUnusableRate: 0, oursJudged: 30, oursWrong: 3, ...over });
  const pb = (ref: boolean, ours: boolean, conf: string) => ({ decision: "boundary", source: "layout", crosses_page: true, ref_boundary: ref, ours_boundary: ours, label_confidence: conf });

  it("counts join accuracy over all, high-confidence and adjudicated page breaks", () => {
    const rows = [pb(true, true, "high"), pb(true, false, "high"), pb(false, false, "low"), pb(true, false, "low"), { ...pb(true, true, "high"), crosses_page: false }, { ...pb(true, true, "high"), ref_boundary: null }];
    const j = joinAccuracy(rows, adj());
    expect(j.all).toEqual({ right: 2, n: 4 });
    expect(j.high).toEqual({ right: 1, n: 2 });
    expect(j.adjudicated).toEqual({ oursWrong: 3, judged: 30 });
  });

  it("flags a reference whose error plus no-answer share is over the ceiling, and an unadjudicated one", () => {
    expect(referenceWarning("r", adj({ referenceErrorRate: 0.03, judged: 20, uncovered: 2 }))).toBeNull();
    expect(referenceWarning("r", adj({ referenceErrorRate: 0.045, judged: 22, uncovered: 8 }))).toMatch(/too noisy/);
    expect(referenceWarning("r", null)).toMatch(/adjudicated/);
  });

  it("keeps the previous value and the delta, and leaves it alone when nothing moved", () => {
    const m = (f1: number): Metrics => ({ boundary_f1: f1, wer: 0.01 });
    const first = mergeScores(null, { a: { set: "development", metrics: m(0.9) } }, "v1");
    expect(first.reports.a.previous).toBeNull();
    const second = mergeScores(first, { a: { set: "development", metrics: m(0.95) } }, "v2");
    expect(second.reports.a.previous).toEqual(m(0.9));
    const third = mergeScores(second, { a: { set: "development", metrics: m(0.95) } }, "v2");
    expect(third.reports.a.previous).toEqual(m(0.9));
    expect(fmtDelta("boundary_f1", 0.95, 0.9)).toBe("+5.0 pts");
    expect(regressed("boundary_f1", 0.85, 0.9)).toBe(true);
    expect(regressed("wer", 0.02, 0.01)).toBe(true);
    expect(regressed("join_adj_ours_wrong", 3, 5)).toBe(false);
    expect(regressed("ref_error_rate", 0.2, 0.1)).toBe(false);
  });

  it("parses pnpm ingest verify into the oracle, golden and precision tables", () => {
    const out = "\u001b[1mjack-smith-vol1\u001b[0m\n".replace(/\u001b\[\d+m/g, "") +
      "  · layout oracle (0.4s) — headings-missed 96, quotes-missed 53\n      expected: x\n  \u001b[32m✓\u001b[0m golden pages — 3/8 match the PDF, 5 known failure(s)\n\noracle against golden pages, all reports (tp = ...)\n  signal                  tp    fp    fn  precision  recall\n  headings-missed          23    24    19        49%     55%\n";
    const v = parseVerify(out);
    expect(v.reports["jack-smith-vol1"]).toEqual({ oracle: { "headings-missed": 96, "quotes-missed": 53 }, golden: { match: 3, total: 8, known: 5 } });
    expect(v.oracleVsGolden["headings-missed"]).toEqual({ tp: 23, fp: 24, fn: 19 });
    const base = { ...v, reports: { "jack-smith-vol1": { oracle: { "headings-missed": 90, "quotes-missed": 53 }, golden: { match: 4, total: 8, known: 4 } } } };
    expect(oracleTable(v, base)).toContain("96 (+6) ▲");
    expect(goldenTable(v, base)).toContain("3 (-1) ▼");
  });
});

describe("wikisource pages as references (7d4y)", () => {
  it("keeps the body, drops the running head, and turns note templates into markers", () => {
    const page = cleanWikitext(
      `<noinclude><pagequality level="4" user="X" />{{rvh|22|CHAPTER|THE REPORT}}</noinclude>controller at 8:53, saying “we may have a hijack”.{{9-11|1|125}}\n\n{{blockquote|\n'''Manager:''' We {{. . .}} need help.{{9-11|1|126}}\n}}\n{{note|121|121.|bold=no}}Note text here.\n{{note|122|122.}}More note.`,
    );
    expect(page.printed).toBe("22");
    expect(page.quality).toBe(4);
    expect(page.text).toBe("controller at 8:53, saying “we may have a hijack”. Manager: We ... need help.");
    expect(page.markers.map((m) => [m.label, tokensBefore(page.text, m.offset)])).toEqual([["125", 10], ["126", 14]]);
    expect(page.notes).toEqual(["Note text here.", "More note."]);
  });

  it("reads <ref> as an unlabelled marker, an endnote link as a labelled one, and drops table attributes and images", () => {
    const page = cleanWikitext(`<noinclude>{{rh||4|}}</noinclude>Some words.<ref>House of Commons, 2003.</ref> More words.<sup>[[9/11 Commission Report/Notes/Part 8#endnote_18|18]]</sup>\n[[File:p148.jpg|center|400px|A caption]]\n{|\n|-\n|style="width: 200px"| 2 May || Start\n|}`);
    expect(page.printed).toBe("4");
    expect(page.text).toBe("Some words. More words. 2 May Start");
    expect(page.markers.map((m) => m.label)).toEqual([null, "18"]);
    expect(page.notes).toEqual(["House of Commons, 2003."]);
  });
});

describe("page references (7d4y)", () => {
  const body = Array.from({ length: 30 }, (_, i) => `word${i} filler${i * 3} text${i * 5}`).join(" ");
  const md = (page2: string) => `%%page 1%%\n\nIntro paragraph with some words here today.\n\n%%page 2%%\n\n${page2}\n\n%%page 3%%\n\nAnother paragraph after the page break entirely.\n`;

  it("scores a page's words with a margin for text that runs over the break", () => {
    const ours = parseOurs(md(body + "[^7] next."));
    const ref = { pdf: 2, page: 2, source: "t", quality: 5, mapping: "given", ...inlineText(body + "[^7] next.") };
    const { pages, totals } = scorePages(ours, [ref]);
    expect(pages[0].wer).toBe(0);
    expect(totals.markerP).toBe(1);
    expect(totals.markerR).toBe(1);
  });

  it("counts substitutions, deletions, insertions, inserted numbers and unmatched markers", () => {
    const ours = parseOurs(md("alpha beta gamma delta epsilon zeta eta theta 7 iota kappa lambda."));
    const text = "alpha beta gamma DELTA epsilon eta theta[^7] iota kappa lambda mu.";
    const ref = { pdf: 2, page: 2, source: "t", quality: 5, mapping: "given", ...inlineText(text) };
    const { pages } = scorePages(ours, [ref]);
    const p = pages[0];
    expect(p.sub).toBe(0);
    expect(p.del).toBe(1); // mu
    expect(p.ins).toBe(2); // zeta, and the plain digit 7 (DELTA folds to delta: a match)
    expect(p.insNum).toBe(1);
    expect(p.refMarkers).toBe(1);
    expect(p.ourMarkers).toBe(0);
    expect(p.matched).toBe(0);
  });

  it("alignPage gives the boundary map", () => {
    const a = alignPage(["a", "b", "c", "d"], ["x", "a", "b", "q", "c", "d", "y"]);
    expect([a.sub, a.del, a.ins]).toEqual([0, 0, 1]);
    expect(a.bmap[4]).toBe(6);
    expect(a.start).toBe(1);
  });
});
