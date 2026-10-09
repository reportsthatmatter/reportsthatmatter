import { describe, expect, it } from "vitest";
import {
  bareFootnoteMarker,
  bareMarkerAfterQuote,
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
  noteReferenceSequence,
  noteMarkerWrongNote,
  noteTextInBody,
  numberedProseList,
  numberedParagraphGlued,
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

describe("bare-marker-after-quote (F)", () => {
  // Litvinenko at ingest v0.20.0 (reportsthatmatter-4ef1): a marker set after an italic quotation's closing mark was left as a bare number.
  const notes = "\n\n## Notes\n\n[^33]: INQ017734 (page 6 paragraph 16(c))\n\n[^45]: Goldfarb 26/20-21";
  it("fails on a bare number after a closing quote whose note nothing cites", () => {
    const md =
      '3.46 She said he was tasked with "looking into the possibility of assassinating Berezovsky" 33 and in her evidence.\n\n3.47 He was "a person who played the director." 45 Next, the memo.' + notes;
    expect(bareMarkerAfterQuote.run(input(md))).toHaveLength(2);
  });
  it("passes once the marker is linked, and for a quoted figure with no note to match", () => {
    const md = '3.46 She said he was tasked with "looking into the possibility of assassinating Berezovsky"[^33] and in her evidence.\n\nShe gave it a "4," indicating a low rating, and wrote "45" on the form.' + notes;
    expect(bareMarkerAfterQuote.run(input(md))).toEqual([]);
  });
  it("does not take an opening quotation mark for a closing one", () => {
    expect(bareMarkerAfterQuote.run(input('There were "33 separate investigations" in all.' + notes))).toEqual([]);
  });
  it("counts a number only against an uncited definition of its label", () => {
    // [^33] is cited once and defined once: a later bare 33 after a quote has no note left to be
    const md = 'First "quoted words."[^33] Later "more words." 33 Then it ends.' + notes;
    expect(bareMarkerAfterQuote.run(input(md))).toEqual([]);
  });
  it("is registered", () => {
    expect(SIGNALS.map((s) => s.id)).toContain("bare-marker-after-quote");
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

describe("note-reference-sequence (3ezs)", () => {
  const run = (markdown: string) => noteReferenceSequence.run(input(markdown)).map((f) => f.excerpt.replace(/ —.*$/, ""));
  const refs = (labels: string[]) => labels.map((l, i) => `Claim ${i}.[^${l}] More.`).join("\n\n");

  it("is quiet when references run 1..n once each", () => {
    expect(run(refs(["1", "2", "3", "4"]))).toEqual([]);
    expect(run(refs(["1-1", "2-1", "1-2", "2-2", "3-2"]))).toEqual([]);
  });

  it("reports a gap once for a stretch, a repeat and an out-of-order reference", () => {
    expect(run(refs(["1", "2", "5", "6", "7", "8"]))).toEqual(["gap: notes 3-4 never referenced in report (6 of 8 linked)"]);
    expect(run(refs(["1", "2", "2", "3"]))).toEqual(["repeat: note 2 again in report"]);
    // one stray number (a year read as a note) is one finding, not one per later reference
    expect(run(refs(["1", "2", "202", "3", "4", "5", "6"]))).toEqual(["out of order: note 202 in report reads after 2, before 3"]);
  });

  it("reads chapters off [^N-C] labels, and the note half off the definitions (9/11: note-chapter; Saville: volume-note)", () => {
    // chapter 2's note 2 is missing, and chapter 1's note 3 is defined but never referenced
    const md = [refs(["1-1", "2-1", "1-2", "3-2"]), "## Notes", "[^1-1]: a", "[^2-1]: b", "[^3-1]: c", "[^1-2]: d", "[^3-2]: e"].join("\n\n");
    expect(run(md)).toEqual([
      "gap: note 3 never referenced in ch1 (2 of 3 linked)",
      "gap: note 2 never referenced in ch2 (2 of 3 linked)",
    ]);
    // Saville's [^1-442] is note 442 of volume 1: more distinct values in the second half
    const saville = [refs(["1-1", "1-2", "1-3"]), "## Notes", ...Array.from({ length: 30 }, (_, i) => `[^1-${i + 1}]: n`), ...Array.from({ length: 5 }, (_, i) => `[^2-${i + 1}]: n`)].join("\n\n");
    expect(run(saville)).toEqual([]);
  });

  it("starts a new run where a restarting numbering returns to a low number at a heading", () => {
    const md = ["## One", refs(["1", "2", "3", "4", "5"]), "## Two", refs(["1", "2", "3", "5"])].join("\n\n");
    expect(run(md)).toEqual(["gap: note 4 never referenced in run 2, from \"Two\" (4 of 5 linked)"]);
    // a stray 2 in a run is not a restart
    expect(run(["## One", refs(["1", "2", "3", "4", "5", "2", "6"])].join("\n\n"))).toEqual(["repeat: note 2 again in report"]);
  });

  it("does not repeat bare-footnote-marker: a run where most notes were never linked reports no gaps", () => {
    expect(run(refs(["1", "40"]))).toEqual([]);
  });

  it("names a run for the heading it starts under, across the headings it crosses (gq4j)", () => {
    // Litvinenko: a Part's notes run across its chapters; each chapter is not a run of its own
    const md = ["## One", refs(["1", "2", "3", "4", "5"]), "## Part Two", refs(["1", "2", "3"]), "### Chapter 2", refs(["4", "6"])].join("\n\n");
    expect(run(md)).toEqual(["gap: note 5 never referenced in run 2, from \"Part Two\" (5 of 6 linked)"]);
  });

  it("starts a run whose first notes were never linked: well below the last, then four more in step (n7fb)", () => {
    const md = ["## One", refs(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"]), "## Two", refs(["10", "11", "12", "13", "14"])].join("\n\n");
    // not ten repeats of 10-14 (and 5 of 14 linked is under half, so the gap is not judged)
    expect(run(md)).toEqual([]);
    const most = ["## One", refs(Array.from({ length: 22 }, (_, i) => String(i + 1))), "## Two", refs(["3", "4", "5", "6", "7", "8"])].join("\n\n");
    expect(run(most)).toEqual(["gap: notes 1-2 never referenced in run 2, from \"Two\" (6 of 8 linked)"]);
    // a page's markers read twice, just behind the run, are repeats, not a new run
    expect(run(refs(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "8", "9", "10", "11", "12", "13"]))).toEqual([
      "repeat: note 8 again in report",
      "repeat: note 9 again in report",
      "repeat: note 10 again in report",
    ]);
  });

  it("reads a gap-filled chapter's [^N-90xx] notes with the chapter label beside it (kgpr)", () => {
    // Hillsborough: chapter 10's 1-26 from the HTML, 27-58 filled from the PDF, then 59- again
    const labels = [...Array.from({ length: 3 }, (_, i) => `${i + 1}-10`), ...Array.from({ length: 3 }, (_, i) => `${i + 4}-9019`), "7-10", "8-10"];
    expect(run(refs(labels))).toEqual([]);
  });

  it("reads runs off the definitions where the same [^N] is defined more than once (u00i)", () => {
    // Leveson: a chapter with one note, then a chapter whose 1, 2 and 3 run on; the references alone cannot tell
    const md = [
      "## A",
      refs(["1", "2", "3", "4"]),
      "## B",
      refs(["1"]),
      "## C",
      refs(["1", "2", "4"]),
      "## Notes",
      "[^1]: a",
      "[^2]: b",
      "[^3]: c",
      "[^4]: d",
      "[^1]: e",
      "[^1]: f",
      "[^2]: g",
      "[^3]: h",
      "[^4]: i",
    ].join("\n\n");
    expect(run(md)).toEqual(['gap: note 3 never referenced in run 3, from "C" (3 of 4 linked)']);
  });

  it("is a gated count signal", () => {
    expect(noteReferenceSequence.kind).toBe("count");
    expect(SIGNALS.map((x) => x.id)).toContain("note-reference-sequence");
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

describe("numbered-prose-list (J, b78.8, mv1t)", () => {
  const run = (html: string) => numberedProseList.run(input("", { html }));
  const prose = (n: number) =>
    `<li>The disclosed documents show that police officers on the inner concourse restricted access to the tunnel (${n}).</li>`;

  it("fails on Lehman p.748: a page-break continuation rendered as <ol start=2008>", () => {
    const html =
      '<p data-page="748" id="x">Lehman reported (second quarter</p>\n<ol start="2008">\n<li>was 16.1x, 15.4x and 12.1x, respectively.</li>\n</ol>';
    const found = run(html);
    expect(found).toHaveLength(1);
    expect(found[0].page).toBe(748);
    expect(found[0].excerpt).toContain("start=2008");
  });

  it("fails on Hillsborough's numbered summary paragraphs rendered as an <ol> with no ids", () => {
    const found = run(`<ol>${prose(1)}${prose(2)}${prose(3)}</ol>`);
    expect(found).toHaveLength(1);
    expect(found[0].excerpt).toContain("3 of 3 items are prose");
  });

  it("fails on a lone lower-case item and on one long prose item", () => {
    expect(run('<ol start="2"><li>role of the assessors</li></ol>')).toHaveLength(1);
    expect(run(`<ol>${prose(1)}</ol>`)).toHaveLength(1);
  });

  it("passes genuine lists: an outline, a timeline, a list inside a quotation or another list", () => {
    expect(run("<ol><li>Setting up and preliminaries</li><li>Visits</li><li>Powers and remedies</li></ol>")).toEqual([]);
    expect(run("<ol><li>January 18: Object reacquired and tracked by Cape</li><li>January 19: Object tracked by Space</li></ol>")).toEqual([]);
    expect(run(`<blockquote><ol>${prose(1)}${prose(2)}</ol></blockquote>`)).toEqual([]);
    expect(run(`<ul><li>item<ol>${prose(1)}${prose(2)}</ol></li></ul>`)).toEqual([]);
    expect(run("<ol><li>Statement of Mr Smith, 14 May 1989, p75.</li></ol>")).toEqual([]);
    expect(run('<p id="a">No lists here.</p>')).toEqual([]);
  });

  it("is registered, gated by count", () => {
    expect(SIGNALS.map((s) => s.id)).toContain("numbered-prose-list");
    expect(numberedProseList.kind).toBe("count");
  });
});

describe("numbered-paragraph-glued (B, reportsthatmatter-f951)", () => {
  const filler = Array.from({ length: 20 }, (_, i) => `1.${i + 1} A paragraph of the introduction.`).join("\n\n");
  const glued = `${filler}\n\n2.85 Its design for the cavity barriers did not comply with the guidance in Approved Document B. 2.86 RBKC's building control department failed.[^13]\n\n2.87 The TMO must also take a share of the blame.`;

  it("fires on the next number run on inside a paragraph after a sentence end", () => {
    const found = numberedParagraphGlued.run(input(glued));
    expect(found).toHaveLength(1);
    expect(found[0].excerpt).toContain("2.86 RBKC");
  });

  it("passes the paragraph set apart, a cross-reference and a number out of sequence", () => {
    expect(numberedParagraphGlued.run(input(glued.replace("B. 2.86", "B.\n\n2.86")))).toEqual([]);
    expect(numberedParagraphGlued.run(input(glued.replace("B. 2.86 RBKC's", "B. See 2.86 and")))).toEqual([]);
    expect(numberedParagraphGlued.run(input(glued.replace("B. 2.86 RBKC's", "B. 5.10 Metres")))).toEqual([]);
  });

  it("fires when another chapter has a paragraph of that number (numbering restarts per chapter, Leveson, reportsthatmatter-1iz4)", () => {
    const earlier = Array.from({ length: 90 }, (_, i) => `2.${i + 1} An earlier chapter's paragraph.`).join("\n\n");
    expect(numberedParagraphGlued.run(input(`${earlier}\n\n${glued}`))).toHaveLength(1);
  });

  it("stays quiet on a report that does not number its paragraphs", () => {
    expect(numberedParagraphGlued.run(input("Some text. 2.1 Million people came."))).toEqual([]);
  });

  it("is registered, advisory", () => {
    expect(SIGNALS.map((s) => s.id)).toContain("numbered-paragraph-glued");
    expect(numberedParagraphGlued.advisory).toBe(true);
  });
});
