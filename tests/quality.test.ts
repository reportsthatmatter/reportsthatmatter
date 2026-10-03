import { describe, expect, it } from "vitest";
import {
  bareFootnoteMarker,
  contentsEntryWithoutHeading,
  furnitureParagraph,
  headingDensity,
  headingFunctionWord,
  headingLong,
  headingMarker,
  headingRepeated,
  idsPer1kWords,
  measure,
  SIGNALS,
  noteCitationVocabulary,
  noteMarkerUnpaired,
  noteMarkerWrongNote,
  noteTextInBody,
  olWordsShare,
  printedPageReversal,
  quoteParity,
  renderedH1,
  chapterIntroMisfiled,
  renderedOlWordsShare,
  severedIntoQuote,
  severedParagraph,
  severedParagraphCapital,
  endsSentence,
  type QualityInput,
} from "../src/lib/quality";
import { deriveDefaults, budgetFor, exceeded, parseBudgetFile, raisedBudgets, ratchet, ratchetable, serializeBudgetFile } from "../src/lib/quality/budget";
import { diffTable, parseRecorded, serializeRecorded } from "../src/lib/quality/diff";

// Fixtures are cut from the live corpus examples in
// docs/design/2026-10-02-quality-harness-catalogue.md. Each signal is shown the
// broken text (and must fire) and a clean counterpart (and must not).

const input = (markdown: string, extra: Partial<QualityInput> = {}): QualityInput => ({
  markdown,
  html: "",
  meta: { words: 1000, sections: [] },
  ...extra,
});

describe("endsSentence", () => {
  it("accepts a full stop, with closing quotes and trailing markers", () => {
    expect(endsSentence("It was done.")).toBe(true);
    expect(endsSentence('He said "yes."')).toBe(true);
    expect(endsSentence("It was done.[^12]")).toBe(true);
    expect(endsSentence("It was done.12")).toBe(true);
    expect(endsSentence("a lettered item;[^112]")).toBe(true);
  });
  it("rejects a clause cut short, and abbreviations", () => {
    expect(endsSentence("profuse diarrhoea and")).toBe(false);
    expect(endsSentence("as told to Mr.")).toBe(false);
    expect(endsSentence("Mr Litvinenko had been suffering from abdominal pain[^3]")).toBe(false);
  });
});

describe("severed-into-quote (A)", () => {
  // Litvinenko 3.120, live: the sentence continues in a block quotation.
  const broken = [
    "3.120 The evidence that I received from such sources as to Mr Litvinenko's symptoms whilst in Barnet Hospital, about the care and treatment that he received, may be summarised as",
    "> vomiting for two days when he was taken to hospital.[^109] An initial diagnosis of gastro-enteritis was made;[^110]",
  ].join("\n\n");

  it("fails on the Litvinenko 3.120 severed quote", () => {
    const found = severedIntoQuote.run(input(broken));
    expect(found).toHaveLength(1);
    expect(found[0].excerpt).toContain("summarised as");
    expect(found[0].crossedPage).toBe(false);
  });
  it("records a page break crossed (Philip Morris, quote to quote)", () => {
    const md = "> told the other company presidents that\n\n%%page 12%%\n\n> they had taken definite steps to address the problem.";
    const found = severedIntoQuote.run(input(md));
    expect(found).toHaveLength(1);
    expect(found[0].crossedPage).toBe(true);
  });
  it("passes a quotation that is introduced or opens on a quotation mark", () => {
    expect(severedIntoQuote.run(input("The court said:\n\n> the editors of the Journal have on occasion written."))).toEqual([]);
    expect(severedIntoQuote.run(input("He wrote that it was\n\n> \"vomiting for two days.\""))).toEqual([]);
    expect(severedIntoQuote.run(input("A finished paragraph.\n\n> a lower-case quote"))).toEqual([]);
  });
});

describe("severed-paragraph (B/C) and its capitalised advisory", () => {
  it("fails on a paragraph cut mid-sentence and continued in lower case, across a page", () => {
    const md = "knowingly false claims of election\n\n%%page 4%%\n\nfraud and the evidence shows that the defendant knew.";
    const found = severedParagraph.run(input(md));
    expect(found).toHaveLength(1);
    expect(found[0].crossedPage).toBe(true);
  });
  it("fails on a same-page split (Columbia two-column body)", () => {
    const md = "communication of critical safety information and\n\nstifled professional differences of opinion within the programme.";
    expect(severedParagraph.run(input(md))).toHaveLength(1);
  });
  it("counts a capitalised continuation across a page only as the advisory", () => {
    const md = "the White\n\n%%page 9%%\n\nHouse announced a new policy.";
    expect(severedParagraph.run(input(md))).toEqual([]);
    expect(severedParagraphCapital.run(input(md))).toHaveLength(1);
    expect(severedParagraphCapital.advisory).toBe(true);
    expect(severedParagraphCapital.run(input("the White\n\nHouse announced a new policy."))).toEqual([]);
  });
  it("passes finished paragraphs", () => {
    expect(severedParagraph.run(input("It ended.\n\n%%page 4%%\n\nand then a lower-case odd start"))).toEqual([]);
  });
});

describe("bare-footnote-marker (F)", () => {
  it("fails on `impartial.15 I underline` and `by it.3 Given`", () => {
    const md = "I have tried to be impartial.15 I underline that the Inquiry has not been told.\n\nIt was not obvious by it.3 Given the delay, nothing followed.";
    expect(bareFootnoteMarker.run(input(md))).toHaveLength(2);
  });
  it("ignores linked markers, decimal figures and paragraph numbers", () => {
    const md = "I have tried to be impartial.[^15] I underline that.\n\nThe fee was $38.6 Billion in total and see para 2.3 for more.";
    expect(bareFootnoteMarker.run(input(md))).toEqual([]);
  });
});

describe("note-marker-wrong-note and note-marker-unpaired (G)", () => {
  // 9/11, live: numbering restarts per chapter, so [^20] is defined once per chapter. The ch.1
  // drop-cap garble `Tue sday, Se ptembe r 11,[^20] 01` took chapter 1's note 20 under count-based
  // pairing and every later [^20] opened the previous chapter's note (reportsthatmatter-apk).
  const notes = "## Notes\n\n[^1]: c1 n1.\n\n[^20]: c1 n20.\n\n[^1]: c2 n1.\n\n[^20]: c2 n20.";
  const garbled = `Tue sday, Se ptembe r 11,[^20] 01, dawned.\n\nA.[^1] B.[^20]\n\n## Two\n\nA.[^1] B.[^20]\n\n${notes}`;
  const side = (text: string) => `<label class="sidenote-toggle" for="x"><sup>1</sup></label><input class="sidenote-checkbox" id="x" type="checkbox" /><span class="sidenote"><sup>1</sup> ${text}</span>`;
  const rendered = (...texts: string[]) => `<p>${texts.map(side).join(" ")}</p>`;

  it("fails when a repeated label opens the previous chapter's note", () => {
    // The count-based result: the stray marker took c1 n20, so chapter 1's B takes c2 n1's neighbour.
    const wrong = rendered("c1 n20.", "c1 n1.", "c2 n20.", "c2 n1.", "c2 n20.");
    const found = noteMarkerWrongNote.run(input(garbled, { html: wrong }));
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].excerpt).toContain("belongs to");
  });
  it("passes when every marker opens its own note, the stray one included as unpaired", () => {
    const right = rendered("c1 n20.", "c1 n1.", "c1 n20.", "c2 n1.", "c2 n20.");
    expect(noteMarkerWrongNote.run(input(garbled, { html: right }))).toEqual([]);
  });
  it("counts the stray marker as unpaired, and nothing in the corrected text", () => {
    const unpaired = noteMarkerUnpaired.run(input(garbled));
    expect(unpaired).toHaveLength(1);
    expect(unpaired[0].excerpt).toContain("Se ptembe r 11,[^20]");
    expect(noteMarkerUnpaired.run(input(garbled.replace("Tue sday, Se ptembe r 11,[^20] 01", "Tuesday, September 11, 2001")))).toEqual([]);
  });
  it("leaves labels defined once, and unlinked references, alone", () => {
    const md = "A.[^1] B.[^9]\n\n## Notes\n\n[^1]: only.";
    expect(noteMarkerUnpaired.run(input(md))).toEqual([]);
    expect(noteMarkerWrongNote.run(input(md, { html: rendered("only.") + "[^9]" }))).toEqual([]);
  });
});

describe("note-text-in-body (E)", () => {
  it("fails on a footnote run as a paragraph", () => {
    const md = "2 Mascall 9/68-70 3 A fuller description of A1's CV is at 2/101-104\n\nIbid., Paragraph 3.3.1.8.16.\n\nTestimony of Dr Smith before the Panel.";
    expect(noteTextInBody.run(input(md))).toHaveLength(3);
  });
  it("passes a date opening a paragraph and ordinary prose", () => {
    expect(noteTextInBody.run(input("12 March 2005 was the day the report was published.\n\nThe panel met in the spring."))).toEqual([]);
  });
  it("counts a report's own citation vocabulary only where declared (PSI 626)", () => {
    const md = "SCO-0001234 produced by the bank in response to the subpoena\n\nA body paragraph about the crisis.";
    expect(noteCitationVocabulary.run(input(md))).toEqual([]);
    expect(noteCitationVocabulary.run(input(md, { citationVocabulary: ["SCO-", "Hearing Exhibit"] }))).toHaveLength(1);
  });
});

describe("furniture-paragraph (K)", () => {
  it("fails on a running head left as a paragraph, five times over", () => {
    const head = "Part 3 | Chapters 1 to 5 | Alexander Litvinenko";
    const md = Array.from({ length: 5 }, (_, i) => `${head}\n\nA real paragraph number ${i} with plenty of words in it to be body text.`).join("\n\n");
    const found = furnitureParagraph.run(input(md));
    expect(found).toHaveLength(5);
    expect(found[0].excerpt).toContain("×5");
  });
  it("passes a short line that recurs fewer than four times", () => {
    const md = "Findings\n\nBody one that goes on.\n\nFindings\n\nBody two that goes on.";
    expect(furnitureParagraph.run(input(md))).toEqual([]);
  });
});

describe("contents-entry-without-heading (I)", () => {
  // Chilcot: the contents lists Security Sector Reform, the body never heads it.
  const contents = "- Security Sector Reform — 125\n- The Basra Security Plan — 130";
  it("fails when a contents entry has no matching heading", () => {
    const md = `${contents}\n\n884\\. An SSR programme was begun in the summer.`;
    expect(contentsEntryWithoutHeading.run(input(md))).toHaveLength(2);
  });
  it("passes when headings carry the entries, numbering and all", () => {
    const md = `${contents}\n\n## 10.2 Security Sector Reform\n\n### The Basra Security Plan\n\nBody.`;
    expect(contentsEntryWithoutHeading.run(input(md))).toEqual([]);
  });
  it("reads dot leaders", () => {
    expect(contentsEntryWithoutHeading.run(input("- Introduction ........ 7\n\nBody."))).toHaveLength(1);
  });
});

describe("heading plausibility (H/I)", () => {
  it("flags a report with far too many headings per page (Columbia 90 per 100 pages)", () => {
    const md = "---\npages: 10\n---\n\n" + Array.from({ length: 9 }, (_, i) => `## Heading ${i}`).join("\n\n");
    expect(headingDensity.run(input(md))).toHaveLength(1);
  });
  it("flags a flat report (Leveson-like, no headings)", () => {
    expect(headingDensity.run(input("---\npages: 300\n---\n\nBody."))).toHaveLength(1);
  });
  it("passes a typical density", () => {
    const md = "---\npages: 100\n---\n\n" + Array.from({ length: 25 }, (_, i) => `## Heading ${i}`).join("\n\n");
    expect(headingDensity.run(input(md))).toEqual([]);
  });
  it("flags repeats, truncated headings, marked headings and caption-length headings", () => {
    const repeated = "## MISSED OPPORTUNITY\n\n## Missed Opportunity\n\n## MISSED OPPORTUNITY";
    expect(headingRepeated.run(input(repeated))).toHaveLength(1);
    expect(headingFunctionWord.run(input("## The period up to the\n\n## Fine Heading"))).toHaveLength(1);
    expect(headingMarker.run(input("## A heading[^4]\n\n## Another"))).toHaveLength(1);
    const long = "## " + Array.from({ length: 15 }, () => "word").join(" ");
    expect(headingLong.run(input(long))).toHaveLength(1);
    expect(headingLong.run(input("## A Short Heading"))).toEqual([]);
  });
});

describe("printed-page-reversal (K)", () => {
  it("fails on Challenger's 94 -> 2", () => {
    const found = printedPageReversal.run(input("%%page 93%%\n\nx\n\n%%page 94%%\n\ny\n\n%%page 2%%\n\nz"));
    expect(found).toHaveLength(1);
    expect(found[0].excerpt).toBe("page 94 → 2");
  });
  it("passes a rising sequence, duplicate-numbered pages and roman folios", () => {
    expect(printedPageReversal.run(input("%%page 2%%\n\nx\n\n%%page 2#2%%\n\ny\n\n%%page 3%%\n\nz"))).toEqual([]);
    expect(printedPageReversal.run(input("%%page 10%%\n\nx\n\n%%page xi%%\n\ny"))).toEqual([]);
  });
});

describe("rendered HTML signals (J, N)", () => {
  it("fails on Columbia's `# 18-7503-005` rendered as an h1", () => {
    const html = '<p id="a">Text</p><h1>18-7503-005, March 5, 1999. 49</h1>';
    expect(renderedH1.run(input("", { html }))).toHaveLength(1);
    expect(renderedH1.run(input("", { html: "<h2>Fine</h2>" }))).toEqual([]);
  });
  it("fails on 9/11 chapter 1's opening served under 'preface' (n9em), passes once the chapter heads its section", () => {
    const html = '<h2>PREFACE</h2><p id="pre">x</p><h2>&quot;WE HAVE SOME PLANES&quot;</h2><p id="tuesday">Tuesday</p><h3>1.1 Inside</h3><p id="a">y</p>';
    const sections = [{ slug: "preface", title: "PREFACE" }, { slug: "we-have-some-planes", title: '"WE HAVE SOME PLANES"' }];
    const bad = input("", { html, meta: { words: 10, sections, paragraphToSection: { pre: "preface", tuesday: "preface", a: "1-1" } } });
    expect(chapterIntroMisfiled.run(bad)).toHaveLength(1);
    const good = input("", { html, meta: { words: 10, sections, paragraphToSection: { pre: "preface", tuesday: "we-have-some-planes", a: "we-have-some-planes" } } });
    expect(chapterIntroMisfiled.run(good)).toEqual([]);
  });
  it("measures words inside <ol> as a share of the report (Lehman-style contents lists)", () => {
    const html = "<ol><li>one two three</li><li>four five</li></ol><p>outside words</p>";
    const i = input("", { html, meta: { words: 10, sections: [] } });
    expect(olWordsShare(i)).toBeCloseTo(50);
    expect(renderedOlWordsShare.run(i)).toHaveLength(1);
    expect(measure(i).counts["rendered-ol-words-share"]).toBe(50);
    expect(renderedOlWordsShare.run(input("", { html: "<p>x</p>" }))).toEqual([]);
  });
  it("fails ids-per-1k-words below the density floor (pre-fix Chilcot: 64 ids over 59,832 words)", () => {
    const ids = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, "s"]));
    expect(idsPer1kWords.run(input("", { meta: { words: 59832, sections: [], paragraphToSection: ids(64) } }))).toHaveLength(1);
    expect(idsPer1kWords.run(input("", { meta: { words: 61616, sections: [], paragraphToSection: ids(956) } }))).toEqual([]);
  });
});

describe("quote-share-parity (D)", () => {
  it("shows a ~90 point gap for a Deepwater-style body quoted on even pages only", () => {
    const pages = Array.from({ length: 20 }, (_, i) => {
      const n = i + 1;
      const body = n % 2 === 0 ? "> A paragraph set as a quotation." : "A paragraph set as itself.";
      return `%%page ${n}%%\n\n${body}\n\n${body}`;
    }).join("\n\n");
    const p = quoteParity(input(pages));
    expect(p.gap).toBeGreaterThan(90);
    expect(measure(input(pages)).counts["quote-share-parity"]).toBeGreaterThan(90);
  });
  it("is flat when quotations are spread evenly", () => {
    const pages = Array.from({ length: 20 }, (_, i) => `%%page ${i + 1}%%\n\n> Quote.\n\nProse.`).join("\n\n");
    expect(quoteParity(input(pages)).gap).toBe(0);
  });
});

describe("budgets", () => {
  const zero = () => Object.fromEntries(SIGNALS.map((x) => [x.id, 0]));
  const counts = (over: Record<string, number> = {}) => ({ ...zero(), ...over });
  const file = () =>
    parseBudgetFile(
      [
        "defaults:",
        "  per1k:",
        "    severed-into-quote: 0.5",
        "  max:",
        "    rendered-ol-words-share: 7",
        "reports:",
        "  r1:",
        "    severed-into-quote: 10",
        "    bare-footnote-marker: 4  # why: reportsthatmatter-xyz",
        "",
      ].join("\n"),
    );

  it("fails a report whose count exceeds its budget and names the signal", () => {
    expect(exceeded(file(), "r1", 1000, counts({ "severed-into-quote": 11 }))).toEqual([
      { signal: "severed-into-quote", count: 11, budget: 10 },
    ]);
    expect(exceeded(file(), "r1", 1000, counts({ "severed-into-quote": 10, "bare-footnote-marker": 4 }))).toEqual([]);
  });
  it("holds a new report to the corpus median rate times its words, rounded up", () => {
    expect(budgetFor(file(), "brand-new", "severed-into-quote", 15000)).toBe(8);
    expect(budgetFor(file(), "brand-new", "rendered-ol-words-share", 15000)).toBe(7);
    expect(budgetFor(file(), "brand-new", "rendered-h1", 15000)).toBe(0);
  });
  it("derives defaults from the median of the corpus", () => {
    const rows = [
      { words: 1000, counts: { ...counts(), "severed-into-quote": 1 } },
      { words: 1000, counts: { ...counts(), "severed-into-quote": 3 } },
      { words: 1000, counts: { ...counts(), "severed-into-quote": 5 } },
    ];
    expect(deriveDefaults(rows).per1k["severed-into-quote"]).toBe(3);
  });
  it("ratchets down and never up", () => {
    const { next, lowered } = ratchet(file(), "r1", counts({ "severed-into-quote": 4, "bare-footnote-marker": 9 }));
    expect(next["severed-into-quote"]).toBe(4);
    expect(next["bare-footnote-marker"]).toBe(4);
    expect(lowered).toEqual(["severed-into-quote 10 → 4"]);
  });
  it("flags a raised budget with no `# why:` comment", () => {
    const before = file();
    const raisedText = serializeBudgetFile(before)
      .replace("severed-into-quote: 10", "severed-into-quote: 12")
      .replace("bare-footnote-marker: 4  # why: reportsthatmatter-xyz", "bare-footnote-marker: 6  # why: reportsthatmatter-xyz");
    const raises = raisedBudgets(before, parseBudgetFile(raisedText));
    expect(raises.find((r) => r.signal === "severed-into-quote")?.why).toBeNull();
    expect(raises.find((r) => r.signal === "bare-footnote-marker")?.why).toContain("reportsthatmatter-xyz");
  });
  it("round-trips the budget file with comments intact", () => {
    const text = serializeBudgetFile(file());
    expect(text).toContain("bare-footnote-marker: 4  # why: reportsthatmatter-xyz");
    expect(serializeBudgetFile(parseBudgetFile(text))).toBe(text);
  });

  it("does not call a `# why:` with no reason a reason, and ignores lowered budgets", () => {
    const before = file();
    const raised = serializeBudgetFile(before).replace("severed-into-quote: 10", "severed-into-quote: 12  # why:");
    expect(raisedBudgets(before, parseBudgetFile(raised))[0].why).toBeNull();
    const lowered = serializeBudgetFile(before).replace("severed-into-quote: 10", "severed-into-quote: 3");
    expect(raisedBudgets(before, parseBudgetFile(lowered))).toEqual([]);
  });

  describe("ratchetable", () => {
    it("lists only budgets at least 10% above their count", () => {
      const slack = ratchetable(file(), "r1", counts({ "severed-into-quote": 9, "bare-footnote-marker": 4 }));
      expect(slack.map((s) => s.signal)).toEqual(["severed-into-quote"]);
      expect(ratchetable(file(), "r1", counts({ "severed-into-quote": 10, "bare-footnote-marker": 4 }))).toEqual([]);
      expect(ratchetable(file(), "nobody", counts())).toEqual([]);
    });
  });

  describe("quality report --diff", () => {
    const last = { ingest: "v0.15.0", recorded: "2026-10-02", reports: { r1: counts({ "severed-into-quote": 10, "bare-footnote-marker": 4 }) } };
    it("shows deltas, marks a gated regression and counts improvements", () => {
      const now = { r1: counts({ "severed-into-quote": 7, "bare-footnote-marker": 6 }) };
      const table = diffTable(last, now, "origin/main");
      expect(table).toContain("| severed-into-quote | 7 (−3) |");
      expect(table).toContain("| bare-footnote-marker | 6 (+2 ▲) |");
      expect(table).toContain("Regressions (1)");
      expect(table).toContain("r1 bare-footnote-marker 4 → 6");
      expect(table).toContain("Improvements (1)");
    });
    it("does not mark an advisory increase, and says so when clean", () => {
      const now = { r1: counts({ "severed-into-quote": 10, "bare-footnote-marker": 4, "severed-paragraph-capital": 9 }) };
      const table = diffTable(last, now, "HEAD");
      expect(table).toContain("(advisory) | 9 (+9) |");
      expect(table).toContain("No regressions.");
    });
    it("marks a report new since the record, and copes with no record at all", () => {
      expect(diffTable(last, { r1: counts(), r2: counts() }, "HEAD")).toContain("0 (new)");
      expect(diffTable(null, { r1: counts() }, "origin/main")).toContain("nothing to compare with");
    });
    it("round-trips the record with reports sorted", () => {
      const text = serializeRecorded({ ...last, reports: { b: counts(), a: counts() } });
      expect(Object.keys(parseRecorded(text).reports)).toEqual(["a", "b"]);
    });
  });
});

describe("lettered sub-items (reportsthatmatter-0wm)", () => {
  // Litvinenko, live after letteredItems: two correct items, the first without a full stop.
  const items = [
    "a. Mr Litvinenko had suffered severe abdominal pain, vomiting and diarrhoea[^112]",
    "b. On 4 November he was seen again by the same doctor;",
  ].join("\n\n");
  it("does not read an item label as the continuation of the item above", () => {
    expect(severedParagraph.run(input(items))).toHaveLength(0);
    expect(severedIntoQuote.run(input(items.replace("b. On", "> b. On")))).toHaveLength(0);
    expect(severedParagraph.run(input(items.replace("b. On", "(ii) On")))).toHaveLength(0);
  });
  it("still counts a real continuation that starts lower case", () => {
    expect(severedParagraph.run(input("Mr Litvinenko had suffered severe abdominal pain and\n\nvomiting on 4 November."))).toHaveLength(1);
  });
});

describe("measure", () => {
  it("returns a count for every signal and clean text has none gated", () => {
    const m = measure(input("A clean paragraph that ends properly.\n\n## A Heading\n\nAnother one here.", { meta: { words: 10, sections: [], paragraphToSection: { a: "s", b: "s" } } }));
    expect(m.counts["severed-into-quote"]).toBe(0);
    expect(Object.keys(m.counts).length).toBeGreaterThan(15);
  });
});
