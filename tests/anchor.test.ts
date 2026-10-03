import { describe, expect, it } from "vitest";
import {
  MAX_EXACT,
  decodeAnchor,
  findText,
  fold,
  encodeAnchor,
  locate,
  normalise,
  selectorFor,
} from "../assets/anchor.js";

const paragraph =
  "The FSB operation to kill Mr Litvinenko was probably approved by " +
  "Mr Patrushev and also by President Putin.";

describe("selectorFor", () => {
  it("describes a selection by its text and the context either side", () => {
    const start = paragraph.indexOf("probably approved");
    const selector = selectorFor(paragraph, start, start + "probably approved".length);

    expect(selector).toEqual({
      exact: "probably approved",
      prefix: "to kill Mr Litvinenko was ",
      suffix: " by Mr Patrushev and also",
    });
  });

  it("takes what context there is at the edges of a paragraph", () => {
    const selector = selectorFor(paragraph, 0, 3);

    expect(selector.exact).toBe("The");
    expect(selector.prefix).toBe("");
    expect(selector.suffix).toBe(" FSB operation to kill Mr");
  });
});

describe("encodeAnchor / decodeAnchor", () => {
  it("round-trips a selector", () => {
    const selector = { prefix: "was ", exact: "probably approved", suffix: " by Mr" };

    expect(decodeAnchor(encodeAnchor(selector)!)).toEqual(selector);
  });

  it("round-trips text containing the field separator", () => {
    const selector = { prefix: "a | b ", exact: "c | d", suffix: " e | f" };

    expect(decodeAnchor(encodeAnchor(selector)!)).toEqual(selector);
  });

  it("names a long passage by its ends rather than refusing it", () => {
    const long = "word ".repeat(MAX_EXACT);

    const anchor = encodeAnchor({ prefix: "", exact: long, suffix: "" });

    expect(anchor).not.toBeNull();
    expect(anchor!.length).toBeLessThan(long.length);
  });

  it("rejects a malformed anchor rather than guessing at it", () => {
    expect(decodeAnchor("no separators here")).toBeNull();
    expect(decodeAnchor("")).toBeNull();
  });
});

describe("locate", () => {
  it("finds the selection when nothing has changed", () => {
    const start = paragraph.indexOf("probably approved");
    const anchor = selectorFor(paragraph, start, start + "probably approved".length);

    expect(locate(paragraph, anchor)).toEqual({
      start,
      end: start + "probably approved".length,
      tier: "context",
    });
  });

  it("picks the right one when the same phrase appears twice", () => {
    const text =
      "He was approved in March. She was approved in April.";
    const second = text.lastIndexOf("was approved");
    const anchor = selectorFor(text, second, second + "was approved".length);

    expect(locate(text, anchor)!.start).toBe(second);
  });

  it("falls back to one side when the text before the quote has changed", () => {
    const start = paragraph.indexOf("probably approved");
    const anchor = selectorFor(paragraph, start, start + "probably approved".length);
    const edited = paragraph.replace("Mr Litvinenko was", "Mr Litvinenko, in London, was");

    const found = locate(edited, anchor);

    expect(edited.slice(found!.start, found!.end)).toBe("probably approved");
    expect(found!.tier).toBe("partial");
  });

  it("still finds the quote when the text on both sides has changed", () => {
    const start = paragraph.indexOf("probably approved");
    const anchor = selectorFor(paragraph, start, start + "probably approved".length);
    const edited = paragraph
      .replace("Mr Litvinenko was", "Mr Litvinenko, in London, was")
      .replace("by Mr Patrushev", "by Nikolai Patrushev");

    const found = locate(edited, anchor);

    expect(edited.slice(found!.start, found!.end)).toBe("probably approved");
    expect(found!.tier).toBe("exact");
  });

  it("gives up rather than guess when the quoted words are gone", () => {
    const anchor = { prefix: "", exact: "words that were never there", suffix: "" };

    expect(locate(paragraph, anchor)).toBeNull();
  });

  it("matches a selection that spanned a line break in the source", () => {
    const wrapped = paragraph.replace("probably approved", "probably\n   approved");
    const anchor = { prefix: "was ", exact: "probably approved", suffix: " by" };

    expect(locate(normalise(wrapped), anchor)).not.toBeNull();
  });
});

describe("normalise", () => {
  it("collapses the whitespace a PDF-derived paragraph carries", () => {
    expect(normalise("two   words\n  here ")).toBe("two words here");
  });

  it("drops the permalink glyph so it cannot land inside a quote", () => {
    expect(normalise("A paragraph.¶")).toBe("A paragraph.");
  });
});

describe("long selections", () => {
  const sentence = (n: number) =>
    `Sentence number ${n} carrying enough words to make the passage realistically long. `;
  const passage = Array.from({ length: 12 }, (_, i) => sentence(i)).join("");
  const document_ = `Something before. ${passage}Something after.`;

  it("anchors a passage far longer than one sentence", () => {
    const start = document_.indexOf(passage);
    const anchor = encodeAnchor(selectorFor(document_, start, start + passage.length));

    expect(anchor).not.toBeNull();
  });

  it("keeps the anchor short by naming the ends, not the whole passage", () => {
    const start = document_.indexOf(passage);
    const anchor = encodeAnchor(selectorFor(document_, start, start + passage.length))!;

    expect(anchor.length).toBeLessThan(passage.length);
  });

  it("finds the whole passage, from its first word to its last", () => {
    const start = document_.indexOf(passage);
    const selector = selectorFor(document_, start, start + passage.length);
    const found = locate(document_, decodeAnchor(encodeAnchor(selector)!)!)!;

    expect(found.start).toBe(start);
    expect(found.end).toBe(start + passage.length);
  });

  it("gives up when the passage no longer ends where it did", () => {
    const start = document_.indexOf(passage);
    const selector = selectorFor(document_, start, start + passage.length);
    const anchor = decodeAnchor(encodeAnchor(selector)!)!;
    const edited = document_.replace(sentence(11), "");

    // The opening still matches, but the passage it opened is gone. Marking
    // from the start to somewhere arbitrary would misquote the document.
    expect(locate(edited, anchor)).toBeNull();
  });

  it("still anchors a short selection by its exact words", () => {
    const anchor = decodeAnchor(encodeAnchor({ prefix: "", exact: "a short quote", suffix: "" })!)!;

    expect(anchor.exact).toBe("a short quote");
  });
});

// Real strings: the Saville PDF text layer had straight quotes where the inquiry
// HTML and the printed report have curly ones (reportsthatmatter-qgf7). Mark
// 3-35 is a real D1 row (uk-saville-inquiry); the 9/11 lines are from the live report.
const SAVILLE_3_35 =
  "3.35 Within a few seconds after arriving, the four soldiers who had gone into Glenfada Park North " +
  "between them shot and mortally wounded William McKinney (aged 26) and Jim Wray (aged 22); and shot and " +
  "injured Joe Friel (aged 20), Michael Quinn (aged 17), Joe Mahon (aged 16) and Patrick O\u2019Donnell " +
  "(aged 41). Jim Wray was shot twice, the second time probably as he lay mortally wounded on the ground.";
const SAVILLE_MARK = {
  prefix: "3.35 ",
  exact:
    "Within a few seconds after arriving, the four soldiers who had gone into Glenfada Park North between them shot and mortally wounded William McKinney (aged 26) and Jim Wray (aged 22); and shot and injured Joe Friel (aged 20), Michael Quinn (aged 17), Joe Mahon (aged 16) and Patrick O'Donnell (aged 41).",
  suffix: " Jim Wray was shot twice,",
};
const NINE_ELEVEN = "Tenet told us that in his world \u201Cthe system was blinking red.\u201D By late summer 2001 \u2014 as the threat reporting surged \u2014 he said so again.";

describe("typographic variants", () => {
  it("finds a straight-apostrophe mark in curly-apostrophe text, and returns the printed span", () => {
    const found = locate(SAVILLE_3_35, SAVILLE_MARK)!;
    expect(found.tier).toBe("context");
    expect(SAVILLE_3_35.slice(found.start, found.end)).toMatch(/^Within a few seconds.*Patrick O\u2019Donnell \(aged 41\)\.$/);
  });

  it("works the other way: a curly anchor in straight text", () => {
    const straight = SAVILLE_3_35.replace("\u2019", "'");
    const curly = { ...SAVILLE_MARK, exact: SAVILLE_MARK.exact.replace("'", "\u2019") };
    expect(locate(straight, curly)?.tier).toBe("context");
  });

  it("matches straight double quotes against curly ones and maps offsets back", () => {
    const found = locate(NINE_ELEVEN, { prefix: "", exact: 'in his world "the system was blinking red."', suffix: " By late" })!;
    expect(NINE_ELEVEN.slice(found.start, found.end)).toBe("in his world \u201Cthe system was blinking red.\u201D");
  });

  it("treats hyphen, en dash and em dash as one", () => {
    expect(locate(NINE_ELEVEN, { prefix: "", exact: "2001 - as the threat reporting surged -", suffix: "" })).not.toBeNull();
    expect(locate("pages 3\u20135", { prefix: "", exact: "pages 3-5", suffix: "" })).not.toBeNull();
  });

  it("treats an ellipsis character as three dots, and the reverse, mapping the end back", () => {
    const text = "We\u2026 are sure that it was so.";
    const found = locate(text, { prefix: "", exact: "We... are sure", suffix: "" })!;
    expect(text.slice(found.start, found.end)).toBe("We\u2026 are sure");
    expect(locate("We... are sure", { prefix: "", exact: "We\u2026 are", suffix: "" })).not.toBeNull();
  });

  it("ignores non-breaking spaces, soft hyphens and ligatures", () => {
    expect(locate("Mr\u00A0Justice Saville", { prefix: "", exact: "Mr Justice", suffix: "" })).not.toBeNull();
    expect(locate("the Army\u00ADs ﬁnding", { prefix: "", exact: "Armys finding", suffix: "" })).not.toBeNull();
    expect(locate("o\uFB03cial", { prefix: "", exact: "official", suffix: "" })).not.toBeNull();
  });

  it("still fails on a different word, and does not fold case", () => {
    expect(locate(SAVILLE_3_35, { prefix: "", exact: "Patrick O'Donnel (aged 41)", suffix: "" })).toBeNull();
    expect(locate(SAVILLE_3_35, { prefix: "", exact: "patrick o'donnell", suffix: "" })).toBeNull();
  });

  it("anchors a long passage named by its ends across quote styles", () => {
    const long = `${"Alpha beta gamma delta. ".repeat(20)}He said \u201Cit\u2019s so\u201D and ${"omega ".repeat(40)}end.`;
    const start = long.indexOf("He said");
    const exact = long.slice(start, long.length - 1).replace(/[\u201C\u201D]/g, '"').replace("\u2019", "'");
    const anchor = decodeAnchor(encodeAnchor({ prefix: "", exact, suffix: "" })!)!;
    const found = locate(long, anchor)!;
    expect(long.slice(found.start, found.end).startsWith("He said \u201Cit\u2019s")).toBe(true);
    expect(long.slice(found.start, found.end).endsWith("omega end")).toBe(true);
  });

  it("finds text across variants with findText", () => {
    expect(findText("Patrick O\u2019Donnell", "O'Donnell")).toEqual({ start: 8, end: 17 });
    expect(findText("abc", "x")).toBeNull();
  });

  it("collapses whitespace runs in the folded text and maps them back", () => {
    const f = fold("a \u00A0 b");
    expect(f.text).toBe("a b");
    expect(f.end[1]).toBe(4);
  });
});
