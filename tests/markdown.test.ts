import { describe, expect, it } from "vitest";
import {
  renderMarkdown,
  splitFrontMatter,
  slugify,
  paragraphId,
  collectNotes,
  withSidenotes,
} from "../src/lib/markdown";

describe("markdown", () => {
  it("derives paragraph ids from the text", () => {
    const html = renderMarkdown("The rioters at the Capitol.\n\nMr. Pence declined.");
    expect(html).toContain('id="rioters-capitol"');
    expect(html).toContain('id="pence-declined"');
  });

  it("adds a permalink anchor to each paragraph", () => {
    const html = renderMarkdown("The rioters at the Capitol.");
    expect(html).toContain('<a class="permalink" href="#rioters-capitol"');
  });

  it("does not render front matter as body text", () => {
    const html = renderMarkdown('---\ntitle: "A Report"\n---\n\nBody text.');
    expect(html).not.toContain("title:");
    expect(html).not.toContain("A Report");
    expect(html).toContain("Body text.");
  });

  it("takes ids from the body, not the front matter", () => {
    const html = renderMarkdown('---\ntitle: "Unrelated Title Here"\n---\n\nFirst body sentence.');
    expect(html).toContain('id="first-body-sentence"');
    expect(html).not.toContain("Unrelated");
  });
});

describe("splitFrontMatter", () => {
  it("parses metadata and strips it from the content", () => {
    const { data, content } = splitFrontMatter('---\ntitle: "A"\npages: 12\n---\nBody.');
    expect(data).toEqual({ title: "A", pages: 12 });
    expect(content.trim()).toBe("Body.");
  });

  it("passes documents without front matter through untouched", () => {
    const { data, content } = splitFrontMatter("Just body.");
    expect(data).toEqual({});
    expect(content).toBe("Just body.");
  });

  it("survives malformed front matter without throwing", () => {
    const { data, content } = splitFrontMatter("---\n: : :\n---\nBody.");
    expect(data).toEqual({});
    expect(content.trim()).toBe("Body.");
  });

  it("does not treat a horizontal rule as front matter", () => {
    const { content } = splitFrontMatter("Intro.\n\n---\n\nMore.");
    expect(content).toContain("Intro.");
    expect(content).toContain("More.");
  });
});

describe("slugify", () => {
  it("makes url-safe heading ids", () => {
    expect(slugify("Section 1: The Findings!")).toBe("section-1-the-findings");
  });
});

describe("permalink placement", () => {
  const between = (html: string, open: string, close: string) =>
    html.slice(html.indexOf(open), html.indexOf(close) + close.length);

  it("does not put a permalink inside a list item", () => {
    const html = renderMarkdown("- One item\n\n- Two item\n\nA real paragraph.");
    expect(between(html, "<ul>", "</ul>")).not.toContain("permalink");
  });

  it("still gives ids to top-level paragraphs around a list", () => {
    const html = renderMarkdown("First paragraph here.\n\n- item\n\nSecond paragraph here.");
    expect(html).toContain('id="first-paragraph-here"');
    expect(html).toContain('id="second-paragraph-here"');
  });

  it("does not put a permalink inside a block quote", () => {
    const html = renderMarkdown("> Quoted text.\n\nBody.");
    expect(between(html, "<blockquote>", "</blockquote>")).not.toContain("permalink");
  });
});

describe("paragraphId", () => {
  it("is derived from the words, so it survives re-ingestion", () => {
    const before = paragraphId("The rioters at the Capitol had been motivated.", new Set());
    const after = paragraphId("The rioters at the Capitol had been motivated.", new Set());
    expect(after).toBe(before);
  });

  it("does not shift when an earlier paragraph is added or removed", () => {
    // The whole point: positional ids would renumber here, these do not.
    const first = renderMarkdown("Alpha content here.\n\nBeta content here.");
    const second = renderMarkdown("Inserted opening line.\n\nAlpha content here.\n\nBeta content here.");
    expect(first).toContain('id="alpha-content-here"');
    expect(second).toContain('id="alpha-content-here"');
    expect(second).toContain('id="beta-content-here"');
  });

  it("drops stopwords to stay distinctive", () => {
    expect(paragraphId("The rioters at the Capitol", new Set())).toBe("rioters-capitol");
  });

  it("keeps stopwords when almost nothing else is left", () => {
    expect(paragraphId("It was on the", new Set())).toBe("it-was-on-the");
  });

  it("disambiguates identical openings", () => {
    const taken = new Set<string>();
    expect(paragraphId("Same opening words here", taken)).toBe("same-opening-words-here");
    expect(paragraphId("Same opening words here", taken)).toBe("same-opening-words-here-2");
    expect(paragraphId("Same opening words here", taken)).toBe("same-opening-words-here-3");
  });

  it("ignores footnote markers when building the id", () => {
    expect(paragraphId("Trump replied[^127] so what", new Set())).toBe("trump-replied-so-what");
  });

  it("survives a paragraph with no usable words", () => {
    expect(paragraphId("!!! ???", new Set())).toBe("para");
  });
});

describe("page markers", () => {
  it("turns a page marker into an anchor", () => {
    const html = renderMarkdown("%%page 46%%\n\nBody text on that page.");
    expect(html).toContain('id="page-46"');
    expect(html).not.toContain("%%page");
  });

  it("tags following paragraphs with the printed page", () => {
    const html = renderMarkdown("%%page 46%%\n\nBody text on that page.");
    expect(html).toContain('data-page="46"');
  });

  it("updates the page as the document progresses", () => {
    const html = renderMarkdown("%%page 1%%\n\nFirst thing.\n\n%%page 2%%\n\nSecond thing.");
    expect(html).toMatch(/id="first-thing"[^>]*data-page="1"/);
    expect(html).toMatch(/id="second-thing"[^>]*data-page="2"/);
  });
});

describe("sidenotes", () => {
  it("places the note beside the sentence rather than at the end", () => {
    const html = renderMarkdown('Trump replied "So what?"[^127]\n\n## Notes\n\n[^127]: Interview transcript at 12.');
    expect(html).toContain("sidenote");
    expect(html).toContain("Interview transcript at 12.");
  });

  it("removes the collected notes section from the body", () => {
    const html = renderMarkdown('Body.[^1]\n\n## Notes\n\n[^1]: A note.');
    expect(html).not.toContain("<h2>Notes</h2>");
  });

  it("lists notes it could not place instead of dropping them", () => {
    const html = renderMarkdown('Body with no reference.\n\n## Notes\n\n[^99]: An unplaced note.');
    expect(html).toContain("Notes not linked in the text");
    expect(html).toContain("An unplaced note.");
  });

  it("leaves a reference alone when there is no matching note", () => {
    const { html, used } = withSidenotes("<p>Body.[^5]</p>", new Map());
    expect(html).toContain("[^5]");
    expect(used.size).toBe(0);
  });

  it("escapes markup in note text", () => {
    const { html } = withSidenotes("<p>x[^1]</p>", new Map([["1", "<script>bad</script>"]]));
    expect(html).not.toContain("<script>bad</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("gives each reference its own toggle", () => {
    const notes = new Map([["1", "note one"]]);
    const { html } = withSidenotes("<p>a[^1] b[^1]</p>", notes);
    const ids = [...html.matchAll(/id="(sn-[^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks a note long once it is disproportionately taller than its paragraph would be", () => {
    // A note this long floating in the margin drifts out of alignment with
    // the text it supports over the rest of the page — see
    // docs/plans/2026-08-09-sidenote-design-research.md. Short notes (the
    // overwhelming majority, by measured distribution) are untouched.
    const short = new Map([["1", "See ECF No. 252 at 15."]]);
    const long = new Map([["1", "See ECF No. 252 at 53 & n.283; ".repeat(20).trim()]]);
    expect(withSidenotes("<p>x[^1]</p>", short).html).not.toContain('class="sidenote long"');
    expect(withSidenotes("<p>x[^1]</p>", long).html).toContain('class="sidenote long"');
  });

  it("gives a long note an in-place expand affordance using its own toggle", () => {
    const long = new Map([["1", "citation ".repeat(60).trim()]]);
    const { html } = withSidenotes("<p>x[^1]</p>", long);
    const toggleId = html.match(/id="(sn-[^"]+)"/)?.[1];
    expect(toggleId).toBeTruthy();
    expect(html).toContain(`<label class="sidenote-expand" for="${toggleId}">`);
  });
});

describe("collectNotes", () => {
  it("reads the note definitions", () => {
    const notes = collectNotes("[^1]: First note.\n\n[^2]: Second note.");
    expect(notes.get("1")).toBe("First note.");
    expect(notes.get("2")).toBe("Second note.");
  });
});

describe("splitSections", () => {
  it("splits on top-level headings and keeps paragraph ids", async () => {
    const { splitSections } = await import("../src/lib/sections");
    const html = renderMarkdown(
      "Opening paragraph here.\n\n## First Section\n\nBody of first.\n\n## Second Section\n\nBody of second."
    );
    const sections = splitSections(html, 0);
    expect(sections.map((s) => s.title)).toEqual([
      "Front matter",
      "First Section",
      "Second Section",
    ]);
    expect(sections[1].html).toContain('id="body-first"');
  });

  it("folds a sliver into the section before it", async () => {
    const { splitSections } = await import("../src/lib/sections");
    const long = "word ".repeat(800);
    const html = renderMarkdown(`## Real Section\n\n${long}\n\n## SENATOR CARL LEVIN\n\nChairman.`);
    const sections = splitSections(html);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Real Section");
    // The sliver's heading survives in the body; it just is not its own page.
    expect(sections[0].html).toContain("SENATOR CARL LEVIN");
  });

  it("keeps a bodyless part divider in the contents, ahead of its chapters", async () => {
    const { splitSections } = await import("../src/lib/sections");
    const long = "word ".repeat(800);
    const html = renderMarkdown(
      `## Part 2: Introduction\n\n${long}\n\n## Part 3: His Life\n\n### Chapter 1: In Russia\n\n${long}\n\n### Chapter 2: Leaving Russia\n\n${long}`
    );
    const sections = splitSections(html);
    // "Part 3: His Life" has no body of its own, but it must still head a
    // section — not vanish into "Part 2" — so the contents can list it.
    expect(sections.map((s) => [s.title, s.level])).toEqual([
      ["Part 2: Introduction", 2],
      ["Part 3: His Life", 2],
      ["Chapter 2: Leaving Russia", 3],
    ]);
    expect(sections[1].html).toContain("Chapter 1: In Russia");
  });

  it("finds which section holds a paragraph", async () => {
    const { splitSections, sectionFor } = await import("../src/lib/sections");
    const html = renderMarkdown("## One\n\nAlpha text here.\n\n## Two\n\nBeta text here.");
    const sections = splitSections(html, 0);
    expect(sectionFor(sections, "beta-text-here")?.title).toBe("Two");
    expect(sectionFor(sections, "nope")).toBeNull();
  });

  it("decodes entities in section titles", async () => {
    const { splitSections } = await import("../src/lib/sections");
    const html = renderMarkdown("## Moody's & Standard & Poor's\n\nBody.");
    const sections = splitSections(html, 0);
    expect(sections[0].title).toBe("Moody's & Standard & Poor's");
  });

  it("records the heading level a section split on, so the contents page can nest them", async () => {
    const { splitSections } = await import("../src/lib/sections");
    const html = renderMarkdown(
      "Front matter here.\n\n## A Part\n\nBody.\n\n### A Subsection\n\nMore body."
    );
    const sections = splitSections(html, 0);
    expect(sections.map((s) => [s.title, s.level])).toEqual([
      ["Front matter", 2],
      ["A Part", 2],
      ["A Subsection", 3],
    ]);
  });
});

describe("paragraphIndex", () => {
  it("maps every paragraph id to the slug of the section holding it", async () => {
    const { splitSections, paragraphIndex } = await import("../src/lib/sections");
    const html = renderMarkdown("## One\n\nAlpha text here.\n\n## Two\n\nBeta text here.");
    const sections = splitSections(html, 0);

    const index = paragraphIndex(sections);

    expect(index["alpha-text-here"]).toBe("one");
    expect(index["beta-text-here"]).toBe("two");
    expect(index["nope"]).toBeUndefined();
  });

  it("agrees with sectionFor for every paragraph, without needing section html at lookup time", async () => {
    const { splitSections, sectionFor, paragraphIndex } = await import("../src/lib/sections");
    const html = renderMarkdown(
      "## One\n\nAlpha text here.\n\n## Two\n\nBeta text here.\n\nGamma follows beta."
    );
    const sections = splitSections(html, 0);
    const index = paragraphIndex(sections);

    for (const id of Object.keys(index)) {
      expect(sections.find((s) => s.slug === index[id])).toBe(sectionFor(sections, id));
    }
  });
});

describe("lists are citable", () => {
  it("gives a top-level list a text-derived id and a permalink", () => {
    const html = renderMarkdown(
      "---\ntitle: t\n---\n\n- after the adoption of resolution 1441;\n- before the decision to deploy troops;\n"
    );

    expect(html).toMatch(/<ul id="[a-z0-9-]+"/);
    expect(html).not.toMatch(/<ul id="(list|ul)-\d+"/); // never positional
    expect(html).toContain('class="permalink"');
    expect(html).toMatch(/id="[^"]*adoption[^"]*"/);
  });

  it("does not give ids to the items themselves", () => {
    const html = renderMarkdown("---\ntitle: t\n---\n\n- one item here\n- two items here\n");

    expect(html).not.toMatch(/<li id=/);
  });
});
