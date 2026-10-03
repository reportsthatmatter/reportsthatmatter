import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { addHighlight, parseShareLink, resolveShareLink } from "../src/lib/highlight-add";
import { encodeAnchor, selectorFor } from "../assets/anchor.js";

const body = `<p id="the-para" data-page="12">¶The Committee found that the schedule created pressure.<span class="sidenote">4 See note.</span> It contributed to unsafe launches.</p>`;
const meta = { paragraphToSection: { "the-para": "sec" }, paragraphAliases: { "old-para": "the-para" } };
const text = "The Committee found that the schedule created pressure. It contributed to unsafe launches.";

describe("parseShareLink", () => {
  it("reads the report, paragraph and anchor of a copied link", () => {
    expect(parseShareLink("https://reportsthatmatter.org/reports/challenger-accident/sec?p=the-para&h=a|b|c#the-para")).toEqual({
      report: "challenger-accident", paragraph: "the-para", anchor: "a|b|c",
    });
  });
  it("falls back to the fragment for the paragraph", () => {
    expect(parseShareLink("/reports/x/full#the-para")).toMatchObject({ report: "x", paragraph: "the-para", anchor: null });
  });
  it("refuses a link that is not to a passage", () => {
    expect(typeof parseShareLink("https://reportsthatmatter.org/about")).toBe("string");
    expect(typeof parseShareLink("https://reportsthatmatter.org/reports/x")).toBe("string");
  });
});

describe("resolveShareLink", () => {
  it("returns the verbatim words, without the sidenote, through an alias", () => {
    const start = text.indexOf("the schedule");
    const anchor = encodeAnchor(selectorFor(text, start, start + "the schedule created pressure".length));
    expect(resolveShareLink({ report: "r", paragraph: "old-para", anchor }, body, meta)).toEqual({
      paragraph: "the-para", quote: "the schedule created pressure",
    });
  });
  it("recovers the full words of a long selection that travelled abbreviated", () => {
    const long = `${"word ".repeat(80)}end.`;
    const html = `<p id="the-para">${long}</p>`;
    const anchor = encodeAnchor(selectorFor(long, 0, long.length));
    expect(anchor).toContain(encodeURIComponent("⋯"));
    expect(resolveShareLink({ report: "r", paragraph: "the-para", anchor }, html, meta)).toEqual({ paragraph: "the-para", quote: long });
  });
  it("takes the whole paragraph when the link names no words", () => {
    expect(resolveShareLink({ report: "r", paragraph: "the-para", anchor: null }, body, meta)).toEqual({ paragraph: "the-para", quote: text });
  });
  it("says so when the words or the paragraph are gone", () => {
    expect(typeof resolveShareLink({ report: "r", paragraph: "nope", anchor: null }, body, meta)).toBe("string");
    expect(typeof resolveShareLink({ report: "r", paragraph: "the-para", anchor: "|not there|" }, body, meta)).toBe("string");
  });
});

describe("addHighlight", () => {
  const file = `report: r
status: approved
why_it_matters: >-
  A long folded paragraph that must not
  be reflowed by adding a highlight.

highlights:
  - paragraph: a
    quote: >-
      First quote.
    card: true

reading_guide: []
`;

  it("appends to the highlights block and leaves the rest of the file byte for byte", () => {
    const { text: out, added } = addHighlight(file, { paragraph: "b", quote: "It's \"quoted\": yes", card: true });
    expect(added).toBe(true);
    expect(out.startsWith(file.slice(0, file.indexOf("\nreading_guide")).replace(/\n+$/, ""))).toBe(true);
    expect(out).toContain("reading_guide: []");
    const parsed = parse(out);
    expect(parsed.highlights).toEqual([
      { paragraph: "a", quote: "First quote.", card: true },
      { paragraph: "b", quote: "It's \"quoted\": yes", card: true },
    ]);
    expect(parsed.why_it_matters).toBe("A long folded paragraph that must not be reflowed by adding a highlight.");
  });

  it("does nothing for a highlight already there", () => {
    expect(addHighlight(file, { paragraph: "a", quote: "First  quote." })).toEqual({ text: file, added: false });
  });

  it("starts a block when the file has none", () => {
    const out = addHighlight("report: r\nstatus: approved\n", { paragraph: "a", quote: "Q." }).text;
    expect(parse(out)).toEqual({ report: "r", status: "approved", highlights: [{ paragraph: "a", quote: "Q." }] });
  });
});
