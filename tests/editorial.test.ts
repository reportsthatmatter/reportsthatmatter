import { describe, expect, it } from "vitest";
import { placeQuote, resolveEditorial, type EditorialSource, type Editorial } from "../src/lib/editorial";
import { renderEditorial } from "../src/templates/editorial";
import { renderReportOverview } from "../src/templates/section";
import { EDITORIAL } from "../src/generated/editorial";
import { decodeAnchor } from "../assets/anchor.js";

const HTML = `
<p id="so-what" data-page="30"><a class="permalink" href="#so-what">¶</a>When an advisor learned this, he informed Mr. Trump, who replied "So what?"<label class="sidenote-toggle">1</label><span class="sidenote">See ECF No. 252 at 142.</span> The riot continued.</p>
<p id="power-of-yes" data-page="146"><a class="permalink" href="#power-of-yes">¶</a>He recalled a slogan, &quot;The Power of Yes&quot;:</p>
<blockquote>
<p>&quot;the power of yes absolutely needed to be balanced by the
wisdom of no.&quot;</p>
</blockquote>
<a class="page-marker" id="page-147" href="#page-147">147</a>
<p id="next" data-page="147">Unrelated.</p>`;

function source(overrides: Partial<EditorialSource> = {}): EditorialSource {
  return {
    report: "demo",
    status: "draft",
    why_it_matters: "Why it matters.",
    findings: [{ text: "A finding.", cites: ["so-what"] }],
    excerpts: [{ paragraph: "so-what", quote: 'who replied "So what?"' }],
    ...overrides,
  };
}

describe("placing a quote", () => {
  it("finds words in the paragraph itself, ignoring its sidenotes", () => {
    const placed = placeQuote(HTML, "so-what", 'replied "So what?" The riot continued.');
    expect(placed).toMatchObject({ ok: true, inParagraph: true });
  });

  it("finds a block quotation in the blocks after the paragraph that introduces it", () => {
    const placed = placeQuote(HTML, "power-of-yes", "the power of yes absolutely needed to be balanced by the wisdom of no.");
    expect(placed).toMatchObject({ ok: true, inParagraph: false });
  });

  it("does not look past the next paragraph with an id", () => {
    expect(placeQuote(HTML, "so-what", "the wisdom of no").ok).toBe(false);
  });

  it("forgives line breaks, not wording", () => {
    // A quote someone tidied — a corrected word, curly quotes — is a different quote.
    expect(placeQuote(HTML, "so-what", "who replied “So what?”").ok).toBe(false);
    expect(placeQuote(HTML, "so-what", 'who replied\n  "So what?"').ok).toBe(true);
  });
});

describe("resolving an editorial file", () => {
  it("resolves pages and links the exact words of an in-paragraph quote", () => {
    const { editorial, problems } = resolveEditorial(source(), HTML);
    expect(problems).toEqual([]);
    const cite = editorial.excerpts[0].cite;
    expect(cite.page).toBe(30);
    const url = new URL(cite.href, "http://x");
    expect(url.pathname).toBe("/reports/demo");
    expect(url.searchParams.get("p")).toBe("so-what");
    expect(decodeAnchor(url.searchParams.get("h"))?.exact).toBe('who replied "So what?"');
  });

  it("reports every problem at once: a quote not in the text, a cite that does not exist", () => {
    const { problems } = resolveEditorial(
      source({
        findings: [{ text: "x", cites: ["gone"] }, { text: "y", cites: [] }],
        excerpts: [{ paragraph: "so-what", quote: "You'll go down as a wimp" }],
      }),
      HTML
    );
    expect(problems).toHaveLength(3);
    expect(problems.join("\n")).toMatch(/no paragraph "gone"/);
    expect(problems.join("\n")).toMatch(/cites nothing/);
    expect(problems.join("\n")).toMatch(/not found verbatim/);
  });
});

const approved: Editorial = {
  status: "approved",
  whyItMatters: "The Special Counsel's account.",
  findings: [{ text: "It was enough to convict.", cites: [{ id: "a", page: 137, href: "/reports/demo?p=a" }] }],
  excerpts: [{ quote: "So what?", context: "2:24 p.m.", card: true, pick: true, cite: { id: "b", page: 30, href: "/reports/demo?p=b" } }],
};

describe("the rendered layer", () => {
  it("is labelled as ours and links every finding and passage into the report", () => {
    const html = renderEditorial(approved);
    expect(html).toContain("Our note");
    expect(html).toContain("Only the words in quotation marks are the report's");
    expect(html).toContain('href="/reports/demo?p=a"');
    expect(html).toContain('href="/reports/demo?p=b"');
    expect(html).toContain("p. 137");
    expect(html).toContain("“So what?”");
  });

  it("hides a draft unless asked, and marks it when shown", () => {
    const draft = { ...approved, status: "draft" as const };
    expect(renderEditorial(draft)).toBe("");
    expect(renderEditorial(draft, { draft: true })).toContain("Draft — not yet approved");
    expect(renderEditorial(approved, { draft: true })).not.toContain("Draft");
  });

  it("uses an approved why-it-matters as the page description; a draft preview is noindex", () => {
    const meta = { id: "demo", title: "Demo report" };
    const sections = [{ slug: "one", title: "One", level: 2 as const, page: "1" }];
    const live = renderReportOverview(meta, sections, { words: 10 }, [], { editorial: approved });
    expect(live).toContain(`<meta name="description" content="The Special Counsel's account." />`);
    expect(live).not.toContain("noindex");

    const preview = renderReportOverview(meta, sections, { words: 10 }, [], {
      editorial: { ...approved, status: "draft" },
      draft: true,
    });
    expect(preview).toContain('<meta name="robots" content="noindex" />');
    expect(preview).not.toContain(`<meta name="description" content="The Special Counsel's account." />`);
  });
});

describe("the generated layer", () => {
  it("covers only reports, with every passage cited to a printed page", () => {
    for (const [id, editorial] of Object.entries(EDITORIAL)) {
      for (const excerpt of editorial.excerpts) {
        expect(excerpt.cite.href.startsWith(`/reports/${id}?p=`)).toBe(true);
      }
    }
  });
});

describe("passage order and folding", () => {
  const passage = (quote: string, pick = false) => ({
    quote,
    card: false,
    pick,
    cite: { id: quote, page: 1, href: `/reports/demo?p=${quote}` },
  });

  it("leads with picks, folds the rest, and marks a mid-sentence start", () => {
    const html = renderEditorial({
      ...approved,
      excerpts: [
        ...Array.from({ length: 7 }, (_, i) => passage(`Plain ${i}.`)),
        passage("to which he replied.", true),
      ],
    });
    expect(html.indexOf("…to which he replied.")).toBeLessThan(html.indexOf("Plain 0."));
    expect(html).toContain("2 more passages");
    expect(html.indexOf("<details")).toBeLessThan(html.indexOf("Plain 6."));
    expect(html.indexOf("<details")).toBeGreaterThan(html.indexOf("Plain 4."));
  });
});
