import { describe, expect, it } from "vitest";
import {
  MAX_EXACT,
  decodeAnchor,
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

  it("refuses to encode a selection too long to be a citation", () => {
    const tooLong = "word ".repeat(MAX_EXACT);

    expect(encodeAnchor({ prefix: "", exact: tooLong, suffix: "" })).toBeNull();
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
