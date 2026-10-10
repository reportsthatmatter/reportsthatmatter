import { describe, expect, it } from "vitest";
import {
  BLUESKY_GRAPHEME_LIMIT,
  buildQueue,
  candidateId,
  formatPost,
  graphemeLength,
  isoDate,
  resolveCandidate,
  roundRobin,
  type PostCandidate,
  type QueueItem,
  type ResolvedPost,
} from "../src/lib/posts";
import { quoteCardId } from "../src/lib/card-key";

const HTML = `
<p id="so-what" data-page="30"><a class="permalink" href="#so-what">¶</a>When an advisor rushed to tell Mr. Trump, he replied "So what?"<label class="sidenote-toggle">1</label><span class="sidenote">See ECF No. 252 at 142.</span> The riot continued.</p>
<p id="no-page"><a class="permalink" href="#no-page">¶</a>An epigraph with no page marker at all.</p>
<p id="power-of-yes" data-page="146"><a class="permalink" href="#power-of-yes">¶</a>He recalled a slogan, &quot;The Power of Yes&quot;:</p>
<blockquote>
<p>&quot;the power of yes absolutely needed to be balanced by the
wisdom of no.&quot;</p>
</blockquote>`;

const CARDS = new Set(["demo/so-what", "demo/default"]);

function candidate(overrides: Partial<PostCandidate> = {}): PostCandidate {
  return {
    report: "demo",
    reportTitle: "The Demo Report",
    paragraph: "so-what",
    quote: 'When an advisor rushed to tell Mr. Trump, he replied "So what?"',
    origin: "share-quotes",
    ...overrides,
  };
}

describe("graphemeLength", () => {
  it("matches .length for plain ASCII", () => {
    expect(graphemeLength("hello")).toBe(5);
  });

  it("counts a combined emoji as one grapheme, unlike code units", () => {
    const flag = "🇬🇧"; // two code points, one grapheme
    expect(graphemeLength(flag)).toBe(1);
    expect(flag.length).toBeGreaterThan(1);
  });
});

describe("candidateId", () => {
  it("is stable across whitespace differences (comparable normalises)", () => {
    const a = candidateId("demo", "so-what", 'replied "So what?"');
    const b = candidateId("demo", "so-what", 'replied\n  "So what?"');
    expect(a).toBe(b);
  });

  it("differs for a different quote on the same paragraph", () => {
    const a = candidateId("demo", "so-what", "quote one");
    const b = candidateId("demo", "so-what", "quote two");
    expect(a).not.toBe(b);
  });

  it("differs for the same quote on a different paragraph", () => {
    const a = candidateId("demo", "so-what", "quote one");
    const b = candidateId("demo", "other", "quote one");
    expect(a).not.toBe(b);
  });
});

describe("formatPost", () => {
  it("follows Appendix C: verbatim quote, blank line, em-dash source line with the page", () => {
    expect(formatPost("So what?", "The Demo Report", 30)).toBe("“So what?”\n\n— The Demo Report, p. 30");
  });

  it("nests a quotation inside the quote as single curly quotes, so it doesn't collide with the outer ones", () => {
    // Straight "..." wrapped in outer "..." reads as three quote marks in a
    // row; standard nesting (outer “ ”, inner ‘ ’) is unambiguous instead.
    expect(formatPost('he replied "So what?"', "The Demo Report", 30)).toBe(
      "“he replied ‘So what?’”\n\n— The Demo Report, p. 30"
    );
  });

  it("nests a typographic quotation inside the quote too, instead of doubling the marks", () => {
    expect(formatPost("pressured him to “find 11,780 votes.”", "The Demo Report", 44)).toBe(
      "“pressured him to ‘find 11,780 votes.’”\n\n— The Demo Report, p. 44"
    );
  });

  it("alternates opening and closing marks across more than one nested quotation", () => {
    expect(formatPost('he said "a" then "b"', "The Demo Report", 1)).toBe("“he said ‘a’ then ‘b’”\n\n— The Demo Report, p. 1");
  });
});

describe("resolveCandidate", () => {
  it("resolves a verbatim quote to a link, a card, and Appendix C text", () => {
    const result = resolveCandidate(candidate(), HTML, CARDS, "https://example.org");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.text).toBe("“When an advisor rushed to tell Mr. Trump, he replied ‘So what?’”\n\n— The Demo Report, p. 30");
    expect(result.item.card).toBe("assets/cards/demo/so-what.png");
    expect(result.item.cardIsDefault).toBe(false);
    const url = new URL(result.item.link);
    expect(url.origin + url.pathname).toBe("https://example.org/reports/demo");
    expect(url.searchParams.get("p")).toBe("so-what");
    expect(url.searchParams.get("src")).toBe("bsky");
    expect(url.searchParams.has("h")).toBe(true);
  });

  it("rejects a quote that is not verbatim in the report", () => {
    const result = resolveCandidate(candidate({ quote: "words nobody said" }), HTML, CARDS, "https://example.org");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toMatch(/not found verbatim/);
  });

  it("rejects a paragraph with no page number — Appendix C always needs one", () => {
    const result = resolveCandidate(
      candidate({ paragraph: "no-page", quote: "An epigraph with no page marker at all." }),
      HTML,
      CARDS,
      "https://example.org"
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toMatch(/no page number/);
  });

  it("enforces the 300-grapheme Bluesky limit rather than trimming the quote", () => {
    const long = "x".repeat(BLUESKY_GRAPHEME_LIMIT);
    const longHtml = `<p id="long" data-page="1">${long}</p>`;
    const result = resolveCandidate(
      candidate({ paragraph: "long", quote: long }),
      longHtml,
      new Set(["demo/default"]),
      "https://example.org"
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toMatch(/over Bluesky's 300 limit/);
  });

  it("falls back to the report's default card for an editorial-origin candidate, never a share-quotes card it wasn't rendered from", () => {
    const result = resolveCandidate(candidate({ origin: "editorial" }), HTML, CARDS, "https://example.org");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.card).toBe("assets/cards/demo/default.png");
    expect(result.item.cardIsDefault).toBe(true);
  });

  it("uses the quote card for exactly these words when one was rendered (f2e)", () => {
    const quote = 'When an advisor rushed to tell Mr. Trump, he replied "So what?"';
    const id = quoteCardId("so-what", quote);
    const cards = new Set([...CARDS, `demo/${id}`]);
    for (const origin of ["editorial", "share-quotes"] as const) {
      const result = resolveCandidate(candidate({ origin }), HTML, cards, "https://example.org");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.item.card).toBe(`assets/cards/demo/${id}.png`);
      expect(result.item.cardIsDefault).toBe(false);
    }
  });

  it("rejects a candidate with no card at all, specific or default", () => {
    const result = resolveCandidate(candidate({ origin: "editorial" }), HTML, new Set(), "https://example.org");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toMatch(/no card image/);
  });
});

describe("roundRobin", () => {
  it("interleaves reports rather than exhausting one before the next", () => {
    const items = [
      { report: "a", n: 1 },
      { report: "a", n: 2 },
      { report: "b", n: 1 },
      { report: "c", n: 1 },
      { report: "c", n: 2 },
    ];
    const out = roundRobin(items, ["a", "b", "c"]);
    expect(out.map((i) => i.report)).toEqual(["a", "b", "c", "a", "c"]);
  });

  it("appends a report absent from reportOrder after the named ones", () => {
    const items = [
      { report: "z", n: 1 },
      { report: "a", n: 1 },
    ];
    const out = roundRobin(items, ["a"]);
    expect(out.map((i) => i.report)).toEqual(["a", "z"]);
  });
});

function resolved(overrides: Partial<ResolvedPost> = {}): ResolvedPost {
  return {
    id: "demo:so-what:aaaaaaaa",
    report: "demo",
    paragraph: "so-what",
    quote: "So what?",
    text: '"So what?"\n\n— The Demo Report, p. 30',
    link: "https://example.org/reports/demo?p=so-what&src=bsky",
    card: "assets/cards/demo/default.png",
    cardIsDefault: true,
    ...overrides,
  };
}

describe("buildQueue", () => {
  it("gives a not-yet-posted item its current card, and leaves a posted one as posted (f2e)", () => {
    const first = buildQueue({
      resolved: [resolved({ id: "a", card: "assets/cards/demo/default.png" }), resolved({ id: "b", paragraph: "other", card: "assets/cards/demo/default.png" })],
      existing: [],
      today: "2026-09-27",
      reportOrder: ["demo"],
    });
    const posted = first.queue.map((i) => (i.id === "b" ? { ...i, posted_url: "https://bsky.app/x" } : i));
    const { queue } = buildQueue({
      resolved: [resolved({ id: "a", card: "assets/cards/demo/q-1.png" }), resolved({ id: "b", paragraph: "other", card: "assets/cards/demo/q-2.png" })],
      existing: posted,
      today: "2026-09-28",
      reportOrder: ["demo"],
    });
    expect(queue.map((i) => [i.id, i.card, i.scheduled])).toEqual([
      ["a", "assets/cards/demo/q-1.png", first.queue[0].scheduled],
      ["b", "assets/cards/demo/default.png", first.queue[1].scheduled],
    ]);
  });

  it("moves a not-yet-posted item's page number with the pinned text, never a posted one's (p3o8)", () => {
    const first = buildQueue({
      resolved: [resolved({ id: "a" }), resolved({ id: "b", paragraph: "other" })],
      existing: [],
      today: "2026-09-27",
      reportOrder: ["demo"],
    });
    const posted = first.queue.map((i) => (i.id === "b" ? { ...i, posted_url: "https://bsky.app/x" } : i));
    const moved = '"So what?"\n\n— The Demo Report, p. 29';
    const { queue } = buildQueue({
      resolved: [resolved({ id: "a", text: moved }), resolved({ id: "b", paragraph: "other", text: moved })],
      existing: posted,
      today: "2026-09-28",
      reportOrder: ["demo"],
    });
    expect(queue.map((i) => [i.id, i.text.endsWith("p. 29")])).toEqual([["a", true], ["b", false]]);
  });

  it("schedules every candidate starting the day after today, round-robin", () => {
    const { queue, added } = buildQueue({
      resolved: [resolved({ id: "a", report: "one" }), resolved({ id: "b", report: "two" })],
      existing: [],
      today: "2026-09-27",
      reportOrder: ["one", "two"],
    });
    expect(added).toBe(2);
    expect(queue.map((i) => [i.id, i.scheduled])).toEqual([
      ["a", "2026-09-28"],
      ["b", "2026-09-29"],
    ]);
    expect(queue.every((i) => i.posted_url === null)).toBe(true);
  });

  it("is idempotent: rerunning with the same candidates changes nothing", () => {
    const first = buildQueue({
      resolved: [resolved({ id: "a" }), resolved({ id: "b", paragraph: "other" })],
      existing: [],
      today: "2026-09-27",
      reportOrder: ["demo"],
    });
    const second = buildQueue({
      resolved: [resolved({ id: "a" }), resolved({ id: "b", paragraph: "other" })],
      existing: first.queue,
      today: "2026-10-05", // even on a later day, nothing already scheduled moves
      reportOrder: ["demo"],
    });
    expect(second.queue).toEqual(first.queue);
    expect(second.added).toBe(0);
  });

  it("never touches an existing item's scheduled date or posted_url", () => {
    const existing: QueueItem[] = [
      {
        id: "a",
        report: "demo",
        paragraph: "so-what",
        quote: "So what?",
        text: "x",
        link: "y",
        card: "z",
        scheduled: "2026-01-01",
        posted_url: "https://bsky.app/post/1",
      },
    ];
    const { queue, added } = buildQueue({
      resolved: [resolved({ id: "a" }), resolved({ id: "new-one" })],
      existing,
      today: "2026-09-27",
      reportOrder: ["demo"],
    });
    expect(queue[0]).toEqual(existing[0]);
    expect(added).toBe(1);
    // New items schedule after the *last* existing date, not after today.
    expect(queue[1].scheduled).toBe("2026-01-02");
  });

  it("flags a not-yet-posted item whose source no longer resolves as staleUnposted", () => {
    const existing: QueueItem[] = [
      {
        id: "gone",
        report: "demo",
        paragraph: "so-what",
        quote: "So what?",
        text: "x",
        link: "y",
        card: "z",
        scheduled: "2026-01-01",
        posted_url: null,
      },
    ];
    const { staleUnposted, stalePosted, queue } = buildQueue({
      resolved: [],
      existing,
      today: "2026-09-27",
      reportOrder: [],
    });
    expect(staleUnposted).toEqual(["gone"]);
    expect(stalePosted).toEqual([]);
    // Still kept — an unposted stale item is a problem to fix, not to hide.
    expect(queue).toEqual(existing);
  });

  it("flags an already-posted item whose source no longer resolves as stalePosted, not an error", () => {
    const existing: QueueItem[] = [
      {
        id: "gone",
        report: "demo",
        paragraph: "so-what",
        quote: "So what?",
        text: "x",
        link: "y",
        card: "z",
        scheduled: "2026-01-01",
        posted_url: "https://bsky.app/post/1",
      },
    ];
    const { staleUnposted, stalePosted } = buildQueue({
      resolved: [],
      existing,
      today: "2026-09-27",
      reportOrder: [],
    });
    expect(staleUnposted).toEqual([]);
    expect(stalePosted).toEqual(["gone"]);
  });
});

describe("isoDate", () => {
  it("formats a Date as YYYY-MM-DD in UTC", () => {
    expect(isoDate(new Date("2026-09-27T23:30:00Z"))).toBe("2026-09-27");
  });
});
