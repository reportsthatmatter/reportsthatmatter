import { describe, expect, it } from "vitest";
import { splitPage, collapseDoubleSpacing } from "../scripts/ingest/clean";
import {
  toBlocks,
  blocksToMarkdown,
  mergeAcrossPages,
  endsSentence,
} from "../scripts/ingest/paragraphs";
import {
  parseFootnotes,
  linkInlineMarkers,
  renderEndnotes,
} from "../scripts/ingest/footnotes";
import { autoFix, findSuspects } from "../scripts/ingest/ocr";
import { structuralChecks, losslessCheck, retentionCheck } from "../scripts/ingest/fidelity";
import { ingestPageGroups } from "../scripts/ingest/pipeline";

const page = (lines: string[], index = 1) => ({ index, lines });

describe("splitPage", () => {
  it("strips the printed page number from the foot of the page", () => {
    const result = splitPage(page(["Body text here.", "", "", "        22", ""]), 1);
    expect(result.printed).toBe(22);
    expect(result.body.join("\n")).not.toContain("22");
  });

  it("separates a consecutively numbered footnote block from the body", () => {
    const result = splitPage(
      page([
        "Body text continues here.",
        "",
        "154 See ECF No. 252 at 15.",
        "155 See ECF No. 252 at 21.",
        "156 SCO-04976407 at 03:29.",
      ]),
      154
    );
    expect(result.footnotes).toHaveLength(3);
    expect(result.body.join(" ")).toContain("Body text continues here.");
    expect(result.body.join(" ")).not.toContain("ECF");
  });

  it("does not mistake a wrapped case citation for a footnote block", () => {
    // "575 F.3d 726" opens like a note but does not continue the sequence.
    const result = splitPage(
      page([
        "575 F.3d 726, 735 (D.C. Cir. 2009); United States v. Tarantino.",
        "More body text.",
      ]),
      154
    );
    expect(result.footnotes).toHaveLength(0);
  });

  it("ignores a lone number that does not continue the sequence", () => {
    const result = splitPage(page(["Body.", "12 Something that looks like a note."]), 200);
    expect(result.footnotes).toHaveLength(0);
  });
});

describe("collapseDoubleSpacing", () => {
  it("removes the single blank between wrapped lines", () => {
    const out = collapseDoubleSpacing([
      "line one",
      "",
      "line two",
      "",
      "line three",
      "",
      "line four",
    ]);
    expect(out.filter((l) => !l.trim())).toHaveLength(0);
  });

  it("keeps wider gaps, which are real breaks", () => {
    const out = collapseDoubleSpacing([
      "line one",
      "",
      "line two",
      "",
      "",
      "new paragraph",
      "",
      "continues",
    ]);
    expect(out.filter((l) => !l.trim())).toHaveLength(1);
  });

  it("leaves single-spaced pages alone", () => {
    const lines = ["one", "two", "three", "four"];
    expect(collapseDoubleSpacing(lines)).toEqual(lines);
  });
});

describe("numbered paragraphs with running headers", () => {
  it("keeps Leveson-style body text out of block quotes and joins a page continuation", () => {
    const result = ingestPageGroups(
      [
        [
          page(
            [
              "        The volume's ordinary body establishes its text column.",
              "        Another ordinary body line keeps that column representative.",
              "        A third ordinary body line is also at the text column.",
              "        A fourth ordinary body line is also at the text column.",
              "        A fifth ordinary body line is also at the text column.",
              "        A sixth ordinary body line is also at the text column.",
              "    2.1     Operation Glade has been rendered",
              "253",
            ],
            1
          ),
          page(
            [
              "    PART E | Crossing Legal Boundaries: The Criminal and Civil Law",
              "            more credible in the light of the evidence that emerged.",
              "    2.2     Operation Motorman was commenced because an audit had",
              "            identified that Paul Marshall had been accessing the PNC.",
              "",
              "                 \"A genuinely quoted passage stays indented and",
              "                 continues on another line.\"",
              "254",
            ],
            2
          ),
          page(["    PART E | Crossing Legal Boundaries: The Criminal and Civil Law", "255"], 3),
          page(["    PART E | Crossing Legal Boundaries: The Criminal and Civil Law", "256"], 4),
        ],
        [page(["A second volume makes this a multi-volume ingest.", "1"], 1)],
      ],
      { title: "Layout fixture" }
    );

    expect(result.markdown).not.toContain("PART E |");
    expect(result.markdown).toContain(
      "2.1 Operation Glade has been rendered more credible in the light of the evidence that emerged."
    );
    expect(result.markdown).toContain(
      "2.2 Operation Motorman was commenced because an audit had identified that Paul Marshall had been accessing the PNC."
    );
    expect(result.markdown).toContain(
      '> "A genuinely quoted passage stays indented and continues on another line."'
    );
  });
});

describe("toBlocks", () => {
  it("rejoins hard-wrapped lines into one paragraph", () => {
    const blocks = toBlocks(["     A sentence that runs", "across two lines."]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "paragraph",
      text: "A sentence that runs across two lines.",
    });
  });

  it("starts a new paragraph on a first-line indent", () => {
    const blocks = toBlocks([
      "     First paragraph starts",
      "and wraps here,",
      "and here as well.",
      "     Second paragraph starts",
      "and wraps too,",
      "and once more.",
    ]);
    expect(blocks.filter((b) => b.kind === "paragraph")).toHaveLength(2);
  });

  it("reads a roman-numeral all-caps line as a section heading", () => {
    const blocks = toBlocks(["I.      THE RESULTS OF THE INVESTIGATION"]);
    expect(blocks[0]).toEqual({
      kind: "heading",
      level: 2,
      text: "THE RESULTS OF THE INVESTIGATION",
    });
  });

  it("reads a lettered title-case line as a subsection", () => {
    const blocks = toBlocks(["   A.   Mr. Trump's Pressure on State Officials"]);
    expect(blocks[0]).toEqual({
      kind: "heading",
      level: 3,
      text: "Mr. Trump's Pressure on State Officials",
    });
  });

  it("does not read 'C.' as a roman numeral section", () => {
    // C is both a letter and a Roman numeral; the caps of the title decide.
    const blocks = toBlocks(["   C.   Conspiracy Against Rights (18 U.S.C. § 241)"]);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 3 });
  });

  it("keeps contents entries out of the heading structure", () => {
    const blocks = toBlocks(["I.   THE RESULTS ....................... 2"]);
    expect(blocks[0]).toEqual({ kind: "contents", text: "I. THE RESULTS", page: "2" });
    expect(blocksToMarkdown(blocks)).toBe("- I. THE RESULTS — 2");
  });

  it("reads a contents entry set with a wide whitespace gap instead of dot leaders", () => {
    // Some born-digital reports right-align the page number with spaces or a
    // tab rather than dot leaders. Without this, "...Litvinenko?" followed by
    // a page number reads as sentence punctuation + a number — which, if that
    // number happens to also be a real footnote elsewhere in the document,
    // gets wrongly linked as a footnote marker on the contents page.
    const blocks = toBlocks([
      "Part 4\t   Why would anyone wish to kill Alexander Litvinenko?         51",
    ]);
    expect(blocks[0]).toEqual({
      kind: "contents",
      text: "Part 4 Why would anyone wish to kill Alexander Litvinenko?",
      page: "51",
    });
  });

  it("does not read an ordinary sentence ending in a number as a contents entry", () => {
    // A single space is normal word spacing, not a right-aligned column — the
    // gap has to be wide enough that it could only be tabular alignment.
    const blocks = toBlocks(["The final score was 22"]);
    expect(blocks.filter((b) => b.kind === "contents")).toHaveLength(0);
  });

  it("does not mistake a wrapped footnote marker for a contents entry", () => {
    // A footnote superscript can land on its own short line after the page
    // break, with a wide gap before it for the same reason a TOC page number
    // has one — but "results." ends the way a sentence fragment does, not a
    // title, so this must stay a paragraph the merge pass can reattach.
    const blocks = toBlocks(["previously reported results.   197"]);
    expect(blocks).toEqual([
      { kind: "paragraph", text: "previously reported results. 197" },
    ]);
  });

  it("drops a paragraph that is only a page number", () => {
    const blocks = toBlocks(["Real text.", "", "   22"]);
    expect(blocks.filter((b) => b.kind === "paragraph")).toHaveLength(1);
  });

  it("rejoins a heading that wrapped onto a second line", () => {
    const blocks = toBlocks([
      "FINAL REPORT ON THE SPECIAL COUNSEL'S",
      "INVESTIGATIONS AND PROSECUTIONS",
    ]);
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as { text: string }).text).toBe(
      "FINAL REPORT ON THE SPECIAL COUNSEL'S INVESTIGATIONS AND PROSECUTIONS"
    );
  });
});

describe("footnotes", () => {
  it("folds continuation lines into the note above", () => {
    const notes = parseFootnotes(
      ["154 See ECF No. 252 at 15", "and the following page.", "155 SCO-04976407."],
      7
    );
    expect(notes).toHaveLength(2);
    expect(notes[0].text).toBe("See ECF No. 252 at 15 and the following page.");
  });

  it("links inline markers that follow sentence punctuation", () => {
    const out = linkInlineMarkers("told him the same. 10 On November 13,", new Set([10]));
    expect(out).toBe("told him the same.[^10] On November 13,");
  });

  it("leaves ordinary figures in the prose alone", () => {
    const out = linkInlineMarkers("a losing margin of about 12,000 voters", new Set([12]));
    expect(out).toBe("a losing margin of about 12,000 voters");
  });

  it("does not link a number with no matching note", () => {
    const out = linkInlineMarkers("the same. 99 Next.", new Set([10]));
    expect(out).toBe("the same. 99 Next.");
  });

  it("renders each note number once", () => {
    const rendered = renderEndnotes([
      { number: 1, text: "a", page: 1 },
      { number: 1, text: "a", page: 2 },
      { number: 2, text: "b", page: 2 },
    ]);
    expect(rendered.split("\n\n")).toHaveLength(2);
  });

  it("keeps a note's tail when it runs over a page break", () => {
    const rendered = renderEndnotes([
      { number: 7, text: "See ECF No. 252 at 79", page: 1 },
      { number: 7, text: "and the following page.", page: 2 },
    ]);
    expect(rendered).toBe("[^7]: See ECF No. 252 at 79 and the following page.");
  });
});

describe("ocr", () => {
  it("repairs a split leading zero in a date", () => {
    expect(autoFix("Video of Dalton, GA speech 0 1/04/2021").text).toContain("01/04/2021");
  });

  it("closes a space inside a timestamp", () => {
    expect(autoFix("at 53 :25-53 :59").text).toBe("at 53:25-53:59");
  });

  it("does not touch text it has no certain reading for", () => {
    const input = "So Help 1v!e God";
    expect(autoFix(input).text).toBe(input);
  });

  it("still reports uncertain text for review", () => {
    const suspects = findSuspects("So Help 1v!e God", 3);
    expect(suspects.length).toBeGreaterThan(0);
    expect(suspects[0].page).toBe(3);
  });

  it("joins run-together words that have no other reading", () => {
    expect(autoFix("one ofthe most important").text).toBe("one of the most important");
    expect(autoFix("somewhere inthe middle").text).toBe("somewhere in the middle");
    expect(autoFix("bo th parties").text).toBe("both parties");
    expect(autoFix("conceming this matter").text).toBe("concerning this matter");
  });

  it("repairs the r/n scan confusion in 'form'", () => {
    expect(autoFix("redacted fonn in the record").text).toBe("redacted form in the record");
  });

  it("does not touch words that are ambiguous with a real reading", () => {
    // "modem" is a real word (the networking device) as well as a scan of
    // "modern" — a human has to decide which, so it stays a suspect only.
    const input = "the modem was configured";
    expect(autoFix(input).text).toBe(input);
  });
});

describe("fidelity", () => {
  it("flags a stranded page number", () => {
    const checks = structuralChecks("Body.\n\n22\n\nMore.");
    expect(checks.find((c) => c.name === "no bare page-number lines")?.ok).toBe(false);
  });

  it("flags a footnote reference with no note", () => {
    const checks = structuralChecks("Body.[^9]\n\n[^8]: Something.");
    expect(checks.find((c) => c.name.includes("footnote reference"))?.ok).toBe(false);
  });

  it("passes when references resolve", () => {
    const checks = structuralChecks("# H\n\nBody.[^8]\n\n[^8]: Something.");
    expect(checks.find((c) => c.name.includes("footnote reference"))?.ok).toBe(true);
  });

  it("catches invented text", () => {
    const check = losslessCheck("the cat sat on the mat", "the dog sat on the mat");
    expect(check.ok).toBe(false);
  });

  it("does not count an OCR repair as invention", () => {
    const check = losslessCheck("speech 0 1/04/2021 ends", "speech 01/04/2021 ends");
    expect(check.ok).toBe(true);
  });

  it("ignores front matter when comparing", () => {
    const check = losslessCheck("body text", '---\ntitle: "Unrelated"\n---\n\nbody text');
    expect(check.ok).toBe(true);
  });

  it("catches a document that lost most of its content", () => {
    const source = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    expect(retentionCheck(source, "word1 word2").ok).toBe(false);
  });
});

describe("block quotes vs first-line indents", () => {
  it("does not quote a paragraph's indented first line", () => {
    const blocks = toBlocks([
      "          Mr. Trump set the plan into motion in early December, ensured",
      "that it was carried out by co-conspirators and agents in the targeted",
      "states, and monitored its progress.",
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("paragraph");
    expect((blocks[0] as { text: string }).text).toContain("monitored its progress.");
  });

  it("still recognises a sustained indented run as a quote", () => {
    // The running body has to outnumber the quote, as it does on a real page —
    // the margin is whichever indent most lines sit at.
    const blocks = toBlocks([
      "Body line at the margin.",
      "another body line here.",
      "a third body line.",
      "a fourth body line.",
      "a fifth body line.",
      "a sixth body line.",
      "       [O]ne paramount concern must always guide our way. This is",
      "       the keeping of the faith in the essential decency and",
      "       even-handedness in the law.",
    ]);
    expect(blocks.some((b) => b.kind === "quote")).toBe(true);
  });

  it("keeps a sentence in one paragraph across an indent change", () => {
    const blocks = toBlocks([
      "         The rioters at the Capitol had been motivated by Mr. Trump, and he",
      "continued to resist requests to direct them to leave.",
    ]);
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as { text: string }).text).toBe(
      "The rioters at the Capitol had been motivated by Mr. Trump, and he continued to resist requests to direct them to leave."
    );
  });
});

describe("mergeAcrossPages", () => {
  it("does not treat a closing parenthesis as sentence punctuation", () => {
    expect(endsSentence("a check through the Criminal Records Office (CRO)")).toBe(false);
  });

  it("rejoins a sentence broken by a page break", () => {
    const merged = mergeAcrossPages([
      { kind: "paragraph", text: "crowds at the Capitol hunted for Mr. Pence and" },
      { kind: "paragraph", text: "other lawmakers throughout the afternoon." },
    ]);
    expect(merged).toHaveLength(1);
    expect((merged[0] as { text: string }).text).toBe(
      "crowds at the Capitol hunted for Mr. Pence and other lawmakers throughout the afternoon."
    );
  });

  it("leaves a completed sentence alone", () => {
    const merged = mergeAcrossPages([
      { kind: "paragraph", text: "A finished sentence." },
      { kind: "paragraph", text: "another fragment" },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("does not merge a paragraph into a heading", () => {
    const merged = mergeAcrossPages([
      { kind: "heading", level: 2, text: "THE LAW" },
      { kind: "paragraph", text: "opening clause of the section" },
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("headings are not quote neighbours", () => {
  it("does not quote the first line of the paragraph under a heading", () => {
    const blocks = toBlocks(
      [
        "body line at margin",
        "another body line",
        "a third body line",
        "a fourth body line",
        "       B.    Mr. Trump's Pressure on State Officials",
        "             One of Mr. Trump's efforts involved targeting the",
        "electoral process at the state level through officials.",
      ],
      0
    );
    expect(blocks.some((b) => b.kind === "quote")).toBe(false);
    const para = blocks.find(
      (b) => b.kind === "paragraph" && b.text.startsWith("One of")
    ) as { text: string } | undefined;
    expect(para?.text).toBe(
      "One of Mr. Trump's efforts involved targeting the electoral process at the state level through officials."
    );
  });

  it("accepts an explicit document margin", () => {
    const blocks = toBlocks(["         Indented opener", "wrapped line."], 0);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("paragraph");
  });
});

describe("page blocks", () => {
  it("emits a page marker", () => {
    expect(blocksToMarkdown([{ kind: "page", number: 46 }])).toBe("%%page 46%%");
  });

  it("merges a sentence across a page marker", () => {
    const merged = mergeAcrossPages([
      { kind: "paragraph", text: "crowds hunted for Mr. Pence and" },
      { kind: "page", number: 8 },
      { kind: "paragraph", text: "other lawmakers." },
    ]);
    const paragraphs = merged.filter((b) => b.kind === "paragraph");
    expect(paragraphs).toHaveLength(1);
    expect((paragraphs[0] as { text: string }).text).toBe(
      "crowds hunted for Mr. Pence and other lawmakers."
    );
    expect(merged.some((b) => b.kind === "page")).toBe(true);
  });
});

describe("stacked footnote layout", () => {
  it("finds notes whose number sits on its own line", () => {
    const result = splitPage(
      page([
        "Body text here.",
        "",
        "109",
        "    4/2010 Evaluation of Federal Regulatory Oversight, report prepared by the",
        "Offices of Inspector General at the Department of the Treasury.",
        "110",
        "    See 3/1/2007 Washington Mutual Inc. 10-K filing with the SEC, at 56.",
      ]),
      109
    );
    expect(result.footnotes.length).toBeGreaterThan(0);
    const notes = parseFootnotes(result.footnotes, 60);
    expect(notes.map((n) => n.number)).toEqual([109, 110]);
    expect(notes[0].text).toContain("Offices of Inspector General");
    expect(notes[1].text).toBe(
      "See 3/1/2007 Washington Mutual Inc. 10-K filing with the SEC, at 56."
    );
  });

  it("still reads the inline layout", () => {
    const notes = parseFootnotes(
      ["154 See ECF No. 252 at 15.", "155 SCO-04976407 at 03:29."],
      1
    );
    expect(notes.map((n) => n.number)).toEqual([154, 155]);
    expect(notes[0].text).toBe("See ECF No. 252 at 15.");
  });

  it("does not treat a lone number with no prose beneath it as a note", () => {
    const notes = parseFootnotes(["42", "", "17"], 1);
    expect(notes).toHaveLength(0);
  });
});

describe("sentence ends", () => {
  it("does not treat an abbreviation as the end of a sentence", () => {
    expect(endsSentence("issued a statement, according to Mr.")).toBe(false);
    expect(endsSentence("filed under ECF No.")).toBe(false);
    expect(endsSentence("as set out in Donald J.")).toBe(false);
  });

  it("still recognises a real sentence end", () => {
    expect(endsSentence("He declined to comment.")).toBe(true);
    expect(endsSentence("Was that true?")).toBe(true);
    expect(endsSentence('He replied "So what?"')).toBe(true);
  });

  it("rejoins a sentence split after an abbreviation", () => {
    const merged = mergeAcrossPages([
      { kind: "paragraph", text: "the courage to do what should have been done, said Mr." },
      { kind: "page", number: 41 },
      { kind: "paragraph", text: "Trump has something else left." },
    ]);
    const paragraphs = merged.filter((b) => b.kind === "paragraph");
    expect(paragraphs).toHaveLength(1);
    expect((paragraphs[0] as { text: string }).text).toContain("said Mr. Trump has");
  });

  it("does not glue two genuinely separate paragraphs together", () => {
    const merged = mergeAcrossPages([
      { kind: "paragraph", text: "He declined to comment." },
      { kind: "paragraph", text: "The following day, the Office filed." },
    ]);
    expect(merged.filter((b) => b.kind === "paragraph")).toHaveLength(2);
  });
});

describe("citation numbers are not footnote markers", () => {
  it("leaves a docket number alone", () => {
    expect(linkInlineMarkers("See ECF No. 252 at 79.", new Set([252]))).toBe(
      "See ECF No. 252 at 79."
    );
  });

  it("leaves a note cross-reference alone", () => {
    expect(linkInlineMarkers("at 79 & n. 452; more", new Set([452]))).toBe(
      "at 79 & n. 452; more"
    );
  });

  it("still links a real footnote marker", () => {
    expect(linkInlineMarkers("told him the same. 10 On November", new Set([10]))).toBe(
      "told him the same.[^10] On November"
    );
  });
});

describe("hyphenated words split by a page break", () => {
  it("rejoins without leaving the hyphen", () => {
    const merged = mergeAcrossPages([
      { kind: "paragraph", text: "a Senior Advisor reiterated that Co-" },
      { kind: "page", number: 34 },
      { kind: "paragraph", text: "Conspirator 1 would be unable to prove it." },
    ]);
    const paragraphs = merged.filter((b) => b.kind === "paragraph");
    expect(paragraphs).toHaveLength(1);
    expect((paragraphs[0] as { text: string }).text).toContain(
      "that Co-Conspirator 1 would be unable"
    );
  });
});

describe("hyphenation across a page break, lowercase continuation", () => {
  it("drops the typesetter's hyphen", () => {
    const merged = mergeAcrossPages([
      { kind: "paragraph", text: "subject to regu-" },
      { kind: "paragraph", text: "lation by the agency." },
    ]);
    expect((merged[0] as { text: string }).text).toBe("subject to regulation by the agency.");
  });
});

describe("footnote block anchoring", () => {
  it("is not thrown off by a stray candidate after the block", () => {
    // A citation wrapping onto a line beginning "20 U.S.C." used to reject the
    // whole block, losing every note on the page.
    const result = splitPage(
      page([
        "Body text.",
        "",
        "140 See ECF No. 252 at 11-12.",
        "141 See ECF No. 252 at 13-14.",
        "142 SCO-00455873 at 3.",
        "20 U.S.C. 1234 and following.",
      ]),
      140
    );
    const notes = parseFootnotes(result.footnotes, 44);
    expect(notes.map((n) => n.number)).toEqual([140, 141, 142, 20]);
  });

  it("anchors on the expected number even when earlier candidates are noise", () => {
    const result = splitPage(
      page([
        "Body mentioning 5 things.",
        "",
        "104 See ECF No. 252 at 77-78.",
        "105 SCO-02244118 at 5.",
        "106 Id. at 6.",
      ]),
      104
    );
    expect(parseFootnotes(result.footnotes, 33)).toHaveLength(3);
  });

  it("still rejects a page with no plausible block", () => {
    const result = splitPage(page(["Body text only.", "More body text."]), 50);
    expect(result.footnotes).toHaveLength(0);
  });
});

describe("printed page numbers", () => {
  it("takes a page number from the foot of the page", () => {
    const result = splitPage(page(["Body text.", "", "     22", ""]), 1);
    expect(result.printed).toBe(22);
  });

  it("takes one from the head of the page too", () => {
    // The PSI report puts its page number in a header, not a footer.
    const result = splitPage(page(["      23", "", "Body text continues."]), 1);
    expect(result.printed).toBe(23);
    expect(result.body.join(" ")).not.toContain("23");
  });

  it("prefers the footer when both look numeric", () => {
    const result = splitPage(page(["  7", "", "Body.", "", "  9"]), 1);
    expect(result.printed).toBe(9);
  });

  it("does not invent a page number from ordinary text", () => {
    const result = splitPage(page(["Body text.", "", "More body text."]), 1);
    expect(result.printed).toBeNull();
  });
});

describe("headings that wrap", () => {
  it("absorbs a lowercase continuation line", () => {
    const blocks = toBlocks(
      [
        "   C.   Conspiracy Against Rights Under Colour of",
        "law and the applicable defences",
      ],
      0
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("heading");
    expect((blocks[0] as { text: string }).text).toBe(
      "Conspiracy Against Rights Under Colour of law and the applicable defences"
    );
  });

  it("does not read a numbered recommendation as a heading", () => {
    // Reports set recommendations as numbered sentences. Treating them as
    // structure fills the contents page with half-sentences.
    const blocks = toBlocks(
      ["   1.   NASA should closely scrutinize each of the concerns raised"],
      0
    );
    expect(blocks[0].kind).toBe("paragraph");
  });

  it("still reads a numbered title-case heading as a heading", () => {
    const blocks = toBlocks(["   A.   Mr. Trump's Pressure on State Officials"], 0);
    expect(blocks[0].kind).toBe("heading");
  });

  it("rejects a title broken mid-word by the line break", () => {
    const blocks = toBlocks(
      ["   The field joints of the Solid Rocket Motors should be rede-"],
      0
    );
    expect(blocks[0].kind).toBe("paragraph");
  });

  it("does not swallow the paragraph after a complete heading", () => {
    const blocks = toBlocks(
      [
        "   A.   Mr. Trump's Pressure on State Officials",
        "one of his efforts involved targeting state officials.",
      ],
      0
    );
    expect(blocks.filter((b) => b.kind === "heading")).toHaveLength(1);
    expect(blocks.filter((b) => b.kind === "paragraph")).toHaveLength(1);
  });

  it("recognises a title cut off mid-phrase", async () => {
    const { danglesMidPhrase } = await import("../scripts/ingest/paragraphs");
    expect(danglesMidPhrase("the evenhanded administration of the")).toBe(true);
    expect(danglesMidPhrase("Mr. Trump's Pressure on State Officials")).toBe(false);
    expect(danglesMidPhrase("A complete sentence.")).toBe(false);
  });
});

describe("division headings (Part / Chapter / Appendix)", () => {
  // The Litvinenko Inquiry sets its top-level divisions as "Part 4:", its
  // subsections as "Chapter 1:", and its appendices as "Appendix 3:". The
  // single-letter marker regex does not cover a label that carries its own
  // number, so before this these lines shipped as plain paragraphs and the
  // contents page had no real structure to list — it filled instead with
  // sentence fragments promoted by mistake.
  it("reads 'Part N:' as a top-level heading", () => {
    const blocks = toBlocks(["Part 7:          The closed evidence"], 0);
    expect(blocks[0]).toEqual({
      kind: "heading",
      level: 2,
      text: "Part 7: The closed evidence",
    });
  });

  it("reads 'Appendix N:' as a top-level heading", () => {
    const blocks = toBlocks(["Appendix 3:                List of Issues"], 0);
    expect(blocks[0]).toEqual({
      kind: "heading",
      level: 2,
      text: "Appendix 3: List of Issues",
    });
  });

  it("reads 'Chapter N:' as a subsection heading", () => {
    const blocks = toBlocks(["Chapter 1:             Introduction"], 0);
    expect(blocks[0]).toEqual({
      kind: "heading",
      level: 3,
      text: "Chapter 1: Introduction",
    });
  });

  it("absorbs a division title that wraps onto aligned continuation lines", () => {
    const blocks = toBlocks(
      [
        "Part 6:             The polonium trail – events in",
        "                    October and November 2006",
        "Chapter 1:              Introduction",
      ],
      0
    );
    expect(blocks[0]).toEqual({
      kind: "heading",
      level: 2,
      text: "Part 6: The polonium trail – events in October and November 2006",
    });
    expect(blocks[1]).toMatchObject({ kind: "heading", level: 3 });
  });

  it("flushes so the numbered paragraph after a division heading stands alone", () => {
    const blocks = toBlocks(
      [
        "Part 7:          The closed evidence",
        "7.1 As I have explained elsewhere in this Report, in conducting",
        "this Inquiry I have received and considered evidence.",
      ],
      0
    );
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
    expect(blocks[1]).toEqual({
      kind: "paragraph",
      text: "7.1 As I have explained elsewhere in this Report, in conducting this Inquiry I have received and considered evidence.",
    });
  });

  it("does not read a sentence that merely opens with 'Part 5' as a heading", () => {
    const blocks = toBlocks(
      ["Part 5 above sets out the evidence relating to the polonium trail."],
      0
    );
    expect(blocks[0].kind).toBe("paragraph");
  });
});

describe("headings that are really prose or page furniture", () => {
  it("does not promote a numbered narrative sentence to a heading", () => {
    // Appendix 1 of the Litvinenko Inquiry is a numbered list of paragraphs.
    // The wrapped first line of one is proper-noun dense enough to clear the
    // title-case bar, and — being a fragment — does not end on a full stop,
    // so the full-stop guard misses it too.
    const blocks = toBlocks(
      [
        "1.   On 23 November 2006, Alexander Litvinenko died at University",
        "     College Hospital in central London.",
      ],
      0
    );
    expect(blocks.some((b) => b.kind === "heading")).toBe(false);
  });

  it("does not read an aircraft registration on its own line as a heading", () => {
    // "(aircraft\nG-BNWX)" in the chronology table — the closing fragment
    // lands on its own line and is all-caps but for the hyphen and paren.
    const blocks = toBlocks(
      ["            on BA flight 875 from Moscow (aircraft", "            G-BNWX)"],
      0
    );
    expect(blocks.some((b) => b.kind === "heading")).toBe(false);
  });

  it("does not read a bare short acronym on its own line as a heading", () => {
    const blocks = toBlocks(
      ["RISC", "4.108 RISC Management Limited was a private security company."],
      0
    );
    expect(blocks.some((b) => b.kind === "heading")).toBe(false);
  });

  it("still reads a one-word all-caps section title as a heading", () => {
    const blocks = toBlocks(["INTRODUCTION"], 0);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
  });
});


describe("bulleted lists (issue #12)", () => {
  // Chilcot, Executive Summary ¶620 — the layout from the issue, as
  // `pdftotext -layout` renders it. The fourth item wraps.
  const chilcot = [
    "620.  Occasions when that would have been appropriate included:",
    "",
    "        •  after Mr Blair's meeting with Mr Hoon, Mr Straw and others on 23 July 2002;",
    "        •  after the adoption of resolution 1441;",
    "        •  before or immediately after the decision to deploy troops in January 2003;",
    "        •  after the Rock Drill (a US inter-agency rehearsal for post-conflict administration)",
    "           in February 2003; and",
    "        •  after Mr Blair's meeting on post-conflict issues on 6 March 2003.",
    "",
  ];

  it("keeps each bullet as its own item", () => {
    const list = toBlocks(chilcot).find((block) => block.kind === "list");

    expect(list).toBeDefined();
    expect(list).toMatchObject({ kind: "list" });
    expect((list as { items: string[] }).items).toHaveLength(5);
  });

  it("keeps a wrapped item with the item it belongs to", () => {
    const list = toBlocks(chilcot).find((block) => block.kind === "list") as {
      items: string[];
    };

    expect(list.items[3]).toBe(
      "after the Rock Drill (a US inter-agency rehearsal for post-conflict administration) in February 2003; and"
    );
  });

  it("does not leave text out of order — the defect the issue reported", () => {
    const markdown = blocksToMarkdown(toBlocks(chilcot));

    // "in February 2003; and" belongs to the Rock Drill item, and must not
    // appear after the item that follows it.
    expect(markdown.indexOf("in February 2003; and")).toBeLessThan(
      markdown.indexOf("6 March 2003")
    );
  });

  it("renders as a markdown list", () => {
    const markdown = blocksToMarkdown(toBlocks(chilcot));

    expect(markdown).toContain("- after the adoption of resolution 1441;");
    expect(markdown).not.toContain("•");
  });

  it("ends the list when ordinary prose resumes", () => {
    const blocks = toBlocks([
      ...chilcot,
      "621.  The Inquiry considers that those occasions were missed.",
    ]);

    const last = blocks[blocks.length - 1];
    expect(last).toMatchObject({
      kind: "paragraph",
      text: "621. The Inquiry considers that those occasions were missed.",
    });
  });

  it("leaves a document with no bullets exactly as it was", () => {
    const prose = ["     A sentence that runs", "across two lines."];

    expect(toBlocks(prose)).toEqual([
      { kind: "paragraph", text: "A sentence that runs across two lines." },
    ]);
  });
});

describe("a list item split by a page break", () => {
  it("rejoins the tail to the item it belongs to, not as a paragraph", () => {
    // The item wraps over the foot of one page; its tail opens the next.
    const merged = mergeAcrossPages([
      {
        kind: "list",
        quoted: false,
        items: [
          "after the adoption of resolution 1441;",
          "after the Rock Drill (a US inter-agency rehearsal for post-conflict administration)",
        ],
      },
      { kind: "page", number: 121 },
      { kind: "paragraph", text: "in February 2003; and" },
    ]);

    const list = merged.find((block) => block.kind === "list") as { items: string[] };
    expect(list.items[1]).toBe(
      "after the Rock Drill (a US inter-agency rehearsal for post-conflict administration) in February 2003; and"
    );
    expect(merged.some((block) => block.kind === "paragraph")).toBe(false);
  });

  it("leaves a genuinely new paragraph after a list alone", () => {
    const merged = mergeAcrossPages([
      { kind: "list", quoted: false, items: ["after the adoption of resolution 1441;"] },
      { kind: "paragraph", text: "The Inquiry considers that those occasions were missed." },
    ]);

    expect(merged).toHaveLength(2);
  });
});

describe("a list is not a block quote", () => {
  // The case that nearly slipped through: on a real page the body sits at the
  // margin and the bullets are indented, so the indent heuristic calls them a
  // quote. What separates them is that the run is bullets from its first line.
  it("makes a list of an indented bullet run under running prose", () => {
    const blocks = toBlocks([
      "  The Inquiry has considered whether the Government's policy on Iraq was",
      "  based on the best available assessments. It concludes that it was not.",
      "",
      "  620.  Occasions when that would have been appropriate included:",
      "",
      "        •  after the adoption of resolution 1441;",
      "        •  before or immediately after the decision to deploy troops in January 2003;",
      "",
      "  621.  The Inquiry considers that those occasions were missed.",
    ]);

    expect(blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "paragraph",
      "list",
      "paragraph",
    ]);
  });

  it("leaves bullets inside a quoted document in the quotation", () => {
    // The PSI report quotes emails that contain bullets. Lifting those out
    // breaks the quotation apart and loses whose words they were.
    const blocks = toBlocks([
      "          \"Attached is the spreadsheet with the total Option ARM MTA summary.",
      "          Some points for the Option ARM MTA >=1PPD:",
      "          • $105mm in Nonaccrual is between FICO 501-540.",
      "          • $222mm in Nonaccrual between LTV 61-80.\"",
    ]);

    expect(blocks.every((block) => block.kind !== "list")).toBe(true);
  });
});

describe("a quoted list keeps its quotation", () => {
  it("keeps the quotation on a run the pipeline already treats as quoted", () => {
    // These reports quote guidance and emails that carry their own bullets.
    // Grouping them into a list must not silently promote someone else's words
    // into the report's own voice, so a list inherits the quoted-ness of the
    // lines it was built from rather than deciding afresh.
    const blocks = toBlocks([
      "  The NTM Guidance was finally issued on October 4, 2006. The final",
      "  version did not fully reflect the recommendations of OTS on negatively",
      "  amortizing loans. Among other matters, it called on banks to:",
      "",
      "            • evaluate a borrower's ability to fully repay a prospective loan;",
      "            • qualify borrowers using the higher interest rate;",
    ]);

    expect(blocks.find((block) => block.kind === "list")).toMatchObject({
      kind: "list",
      quoted: true,
    });
    expect(blocksToMarkdown(blocks)).toContain(
      "> - evaluate a borrower's ability to fully repay a prospective loan;"
    );
  });
});
