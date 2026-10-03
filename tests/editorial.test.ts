import { describe, expect, it } from "vitest";
import { placeQuote, resolveEditorial, type EditorialSource, type Editorial } from "../src/lib/editorial";
import { renderHero, renderLanding, renderStandfirst, renderOurNote } from "../src/templates/editorial";
import { publicationYear } from "../src/templates/report";
import { renderReportList } from "../src/templates/index";
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

const STRUCTURE = {
  sections: [
    { slug: "one", title: "One", page: "30" },
    { slug: "two", title: "SHOUTED CAPTION", page: "146" },
  ],
  paragraphToSection: { "so-what": "one", "power-of-yes": "two", next: "two" },
};

function source(overrides: Partial<EditorialSource> = {}): EditorialSource {
  return {
    report: "demo",
    status: "draft",
    why_it_matters: "Why it matters.",
    background: "First paragraph\nwraps.\n\nSecond paragraph.",
    findings: [
      {
        text: "A finding.",
        cites: ["so-what"],
        excerpt: { paragraph: "so-what", quote: 'who replied "So what?"' },
      },
    ],
    reading_guide: [{ section: "two", title: "Sales culture", why: "Start here." }],
    highlights: [{ paragraph: "so-what", quote: 'replied "So what?"' }],
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

  it("forgives line breaks and typography, not wording", () => {
    // A corrected word is a different quote; curly quotes are the same words.
    expect(placeQuote(HTML, "so-what", "who replied “So Whatever?”").ok).toBe(false);
    expect(placeQuote(HTML, "so-what", "who replied “So what?”").ok).toBe(true);
    expect(placeQuote(HTML, "so-what", 'who replied\n  "So what?"').ok).toBe(true);
  });

  it("matches a straight-quote quote against curly text, linking the printed words", () => {
    const curly = `<p id="odonnell" data-page="3">3.35 and shot and injured Patrick O’Donnell (aged 41). Jim Wray was “shot twice”, the second time.</p>`;
    const structure = { sections: [{ slug: "s", title: "S" }], paragraphToSection: { odonnell: "s" } };
    const { problems, highlights, editorial } = resolveEditorial(
      source({
        findings: [{ text: "f", cites: ["odonnell"], excerpt: { paragraph: "odonnell", quote: `Patrick O'Donnell (aged 41). Jim Wray was "shot twice"` } }],
        reading_guide: [],
        highlights: [{ paragraph: "odonnell", quote: `Patrick O'Donnell (aged 41)` }],
      }),
      curly,
      structure
    );
    expect(problems).toEqual([]);
    // The stored selector keeps the report's own spelling.
    expect(highlights[0].exact).toBe("Patrick O’Donnell (aged 41)");
    const h = new URL(editorial.findings[0].excerpt!.cite.href, "http://x").searchParams.get("h");
    expect(decodeAnchor(h)?.exact).toBe("Patrick O’Donnell (aged 41). Jim Wray was “shot twice”");
  });
});

describe("resolving an editorial file", () => {
  it("resolves pages, sections and background, and links the exact words of a quote", () => {
    const { editorial, problems } = resolveEditorial(source(), HTML, STRUCTURE);
    expect(problems).toEqual([]);
    expect(editorial.background).toEqual(["First paragraph wraps.", "Second paragraph."]);
    expect(editorial.readingGuide[0]).toMatchObject({ slug: "two", title: "Sales culture", page: "146" });
    const cite = editorial.findings[0].excerpt!.cite;
    expect(cite.page).toBe(30);
    const url = new URL(cite.href, "http://x");
    expect(url.pathname).toBe("/reports/demo");
    expect(url.searchParams.get("p")).toBe("so-what");
    expect(decodeAnchor(url.searchParams.get("h"))?.exact).toBe('who replied "So what?"');
  });

  it("resolves a highlight to a marks row", () => {
    const { highlights } = resolveEditorial(source(), HTML, STRUCTURE);
    expect(highlights).toEqual([
      expect.objectContaining({ report: "demo", section: "one", paragraph: "so-what", exact: 'replied "So what?"', page: 30 }),
    ]);
  });

  it("reports every problem at once", () => {
    const { problems } = resolveEditorial(
      source({
        findings: [
          { text: "x", cites: ["gone"] },
          { text: "y", cites: [], excerpt: { paragraph: "so-what", quote: "You'll go down as a wimp" } },
        ],
        reading_guide: [
          { section: "nowhere", why: "?" },
          { section: "one", why: "!", excerpt: { paragraph: "power-of-yes", quote: "The Power of Yes" } },
        ],
        highlights: [{ paragraph: "power-of-yes", quote: "the wisdom of no." }],
      }),
      HTML,
      STRUCTURE
    );
    const all = problems.join("\n");
    expect(all).toMatch(/no paragraph "gone"/);
    expect(all).toMatch(/cites nothing/);
    expect(all).toMatch(/not found verbatim/);
    expect(all).toMatch(/no section "nowhere"/);
    expect(all).toMatch(/is not in section "one"/);
    expect(all).toMatch(/block quotation, which cannot be marked/);
    expect(problems).toHaveLength(6);
  });
});

describe("a hero photograph", () => {
  const hero = {
    src: "/assets/heroes/demo.webp",
    alt: "The gallows outside the Capitol.",
    credit: "The Capitol, 6 January 2021 · Photo: T. M., CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:x.jpg",
    focus: "50% 40%",
  };
  const onDisk = (src: string) =>
    ({ "/assets/heroes/demo.webp": { width: 2400, height: 1528 }, "/assets/heroes/demo-1200.webp": { width: 1200, height: 764 } })[src] ?? null;

  it("resolves both widths and their sizes", () => {
    const { editorial, problems } = resolveEditorial(source({ hero }), HTML, STRUCTURE, onDisk);
    expect(problems).toEqual([]);
    expect(editorial.hero).toEqual({
      src: "/assets/heroes/demo.webp",
      width: 2400,
      height: 1528,
      small: { src: "/assets/heroes/demo-1200.webp", width: 1200 },
      credit: hero.credit,
      source: hero.source,
      alt: hero.alt,
      focus: "50% 40%",
    });
  });

  it("is optional", () => {
    const { editorial, problems } = resolveEditorial(source(), HTML, STRUCTURE);
    expect(problems).toEqual([]);
    expect(editorial.hero).toBeUndefined();
  });

  it("requires alt text, a credit, a source link and the files on disk", () => {
    const { editorial, problems } = resolveEditorial(
      source({ hero: { ...hero, src: "/assets/heroes/gone.webp", alt: " ", credit: "", source: "commons", focus: "top" } }),
      HTML,
      STRUCTURE,
      onDisk
    );
    const all = problems.join("\n");
    expect(all).toMatch(/alt is required/);
    expect(all).toMatch(/credit is required/);
    expect(all).toMatch(/source must be/);
    expect(all).toMatch(/focus must be/);
    expect(all).toMatch(/no file for \/assets\/heroes\/gone\.webp/);
    expect(all).toMatch(/no file for \/assets\/heroes\/gone-1200\.webp/);
    expect(editorial.hero).toBeUndefined();
  });

  it("renders with a srcset, its size, its focal point and a credit linking to its source", () => {
    const resolved = resolveEditorial(source({ hero }), HTML, STRUCTURE, onDisk).editorial.hero!;
    const html = renderHero(resolved);
    expect(html).toContain('<figure class="report-hero">');
    expect(html).toContain('srcset="/assets/heroes/demo-1200.webp 1200w, /assets/heroes/demo.webp 2400w"');
    expect(html).toContain('width="2400" height="1528"');
    expect(html).toContain('alt="The gallows outside the Capitol."');
    expect(html).toContain("object-position:50% 40%");
    expect(html).toContain(`<a href="${hero.source}" rel="nofollow">The Capitol, 6 January 2021`);
  });
});

const approved: Editorial = {
  status: "approved",
  whyItMatters: "The Special Counsel's account.",
  background: ["What happened."],
  findings: [
    {
      text: "It was enough to convict.",
      cites: [{ id: "a", page: 137, href: "/reports/demo?p=a" }],
      excerpt: { quote: "to which he replied.", cite: { id: "b", page: 30, href: "/reports/demo?p=b" } },
    },
  ],
  readingGuide: [{ slug: "one", title: "The results", page: "3", why: "The case in brief." }],
};

describe("the landing page", () => {
  it("sets out background, findings and a reading guide, every one linking into the report", () => {
    const html = renderLanding(approved, "demo");
    expect(html).toContain("Background");
    expect(html).toContain("What happened.");
    expect(html).toContain('href="/reports/demo?p=a"');
    expect(html).toContain("“…to which he replied.”");
    expect(html).toContain('href="/reports/demo?p=b"');
    expect(html).toContain("Where to start reading");
    expect(html).toContain('href="/reports/demo/one"');
  });

  it("says whose words these are, and flags a draft", () => {
    expect(renderOurNote(approved)).toContain("Only words in quotation marks are the report's own");
    expect(renderOurNote(approved)).not.toContain("Draft");
    expect(renderOurNote({ ...approved, status: "draft" })).toContain("Draft — not yet approved");
    expect(renderStandfirst(approved)).toContain("The Special Counsel's account.");
  });

  const meta = { id: "demo", title: "Demo report", published_at: "13 April 2011" };
  const sections = [{ slug: "one", title: "One", level: 2 as const, page: "1" }];

  it("is the landing page only when approved, or a draft previewed with ?draft", () => {
    const live = renderReportOverview(meta, sections, { words: 10 }, [], { editorial: approved });
    expect(live).toContain("Where to start reading");
    expect(live).toContain(`<meta name="description" content="The Special Counsel's account." />`);
    expect(live).not.toContain("noindex");

    const draft = { ...approved, status: "draft" as const };
    const hidden = renderReportOverview(meta, sections, { words: 10 }, [], { editorial: draft });
    expect(hidden).not.toContain("Where to start reading");
    expect(hidden).toContain("Contents");

    const preview = renderReportOverview(meta, sections, { words: 10 }, [], { editorial: draft, draft: true });
    expect(preview).toContain("Where to start reading");
    expect(preview).toContain('<meta name="robots" content="noindex" />');
  });

  it("puts a hero above the header in place of the plate, only when the landing page is shown", () => {
    const hero = {
      src: "/assets/heroes/columbia-accident.webp", width: 2400, height: 1200,
      small: { src: "/assets/heroes/columbia-accident-1200.webp", width: 1200 },
      credit: "Credit line", source: "https://example.org/photo", alt: "A photograph.", focus: "50% 50%",
    };
    const plated = { ...meta, id: "columbia-accident" };
    const live = renderReportOverview(plated, sections, { words: 10 }, [], { editorial: { ...approved, hero } });
    expect(live).toContain('<figure class="report-hero">');
    expect(live.indexOf('<figure class="report-hero">')).toBeLessThan(live.indexOf('<header class="report-header'));
    expect(live).not.toContain('class="frontispiece"');

    const draft = { ...approved, status: "draft" as const, hero };
    const hidden = renderReportOverview(plated, sections, { words: 10 }, [], { editorial: draft });
    expect(hidden).not.toContain('class="report-hero"');
    expect(hidden).toContain('class="frontispiece"');
    expect(renderReportOverview(plated, sections, { words: 10 }, [], { editorial: draft, draft: true })).toContain('<figure class="report-hero">');

    const noHero = renderReportOverview(plated, sections, { words: 10 }, [], { editorial: approved });
    expect(noHero).not.toContain('class="report-hero"');
    expect(noHero).toContain('class="frontispiece"');
  });

  it("leaves out Most marked passages on a landing page, and keeps it elsewhere", () => {
    const top = [{ quote: "A marked passage.", url: "/reports/demo?p=x", readers: 2, page: 4 }];
    expect(renderReportOverview(meta, sections, { words: 10 }, top, { editorial: approved })).not.toContain("Most marked passages");
    expect(renderReportOverview(meta, sections, { words: 10 }, top)).toContain("Most marked passages");
  });

  it("is today's contents page for a report with no overview", () => {
    const plain = renderReportOverview(meta, sections, { words: 10 });
    expect(plain).not.toContain("landing-");
    expect(plain).toContain("Contents");
  });
});

describe("publication year", () => {
  it("is read from the registry date", () => {
    expect(publicationYear({ published_at: "13 April 2011" })).toBe("2011");
    expect(publicationYear({ published_at: "January 2025" })).toBe("2025");
    expect(publicationYear({ published_at: "October 1986" })).toBe("1986");
    expect(publicationYear({})).toBeNull();
  });

  it("is in the report header and leads the archive row", () => {
    const meta = { id: "demo", title: "Demo report", published_at: "13 April 2011", authors: "A Committee" };
    const page = renderReportOverview(meta, [{ slug: "one", title: "One", level: 2 as const, page: "1" }], { words: 10 });
    expect(page).toContain('<span class="kicker-year">2011</span>');
    const list = renderReportList({ reports: [{ ...meta, source_path: "x" }] });
    expect(list).toContain("13 April 2011 · A Committee");
  });
});

describe("the generated layer", () => {
  it("links every quotation into its own report", () => {
    for (const [id, editorial] of Object.entries(EDITORIAL)) {
      for (const finding of editorial.findings) {
        if (finding.excerpt) expect(finding.excerpt.cite.href.startsWith(`/reports/${id}?p=`)).toBe(true);
      }
    }
  });
});
