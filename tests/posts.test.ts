import { describe, expect, it } from "vitest";
import { cardMeta } from "../src/lib/poster";
import {
  BLUESKY_GRAPHEME_LIMIT,
  buildQueue,
  candidateId,
  formatHooked,
  formatPost,
  graphemeLength,
  isBlackout,
  isoDate,
  posterEligibility,
  queueViolations,
  reportPolicies,
  tierOf,
  resolveCandidate,
  roundRobin,
  scheduleItems,
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
        scheduled: "2026-03-01",
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
    expect(queue[1].scheduled).toBe("2026-03-02");
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
        scheduled: "2026-03-01",
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
        scheduled: "2026-03-01",
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

describe("hooks (post-writing skill)", () => {
  const hooked = (overrides: Partial<ResolvedPost> = {}) => resolved({ page: 30, sourceTitle: "Demo Report", ...overrides });
  const queued = (hook: string | null, overrides: Partial<ResolvedPost> = {}) => {
    const first = buildQueue({ resolved: [hooked(overrides)], existing: [], today: "2026-09-27", reportOrder: ["demo"] });
    return buildQueue({ resolved: [hooked(overrides)], existing: first.queue.map((i) => ({ ...i, hook })), today: "2026-09-28", reportOrder: ["demo"] });
  };

  it("formats the hook, then the short source line, then the context line; the quote is not repeated", () => {
    expect(formatHooked(" In 1986 a shuttle broke apart. ", "Demo Report", 3)).toBe("In 1986 a shuttle broke apart.\n\n— Demo Report, p. 3");
    expect(formatHooked("Hook.", "Demo Report", 3, "97 people died.")).toBe("Hook.\n\n— Demo Report, p. 3\n\n97 people died.");
  });

  it("a hooked post's source line still gives the link card its title and page", () => {
    expect(cardMeta({ text: formatHooked("Hook, with a comma.", "Challenger Accident Report (House Science Committee)", 3) })).toEqual({
      title: "Challenger Accident Report (House Science Committee)",
      description: "Page 3. Read the passage in context.",
    });
  });

  it("builds a not-yet-posted item's text from its hook and keeps the hook; no hook keeps the quote post", () => {
    const { queue, overLength } = queued("In 1986 a shuttle broke apart.");
    expect(queue[0].hook).toBe("In 1986 a shuttle broke apart.");
    expect(queue[0].text).toBe("In 1986 a shuttle broke apart.\n\n— Demo Report, p. 30");
    expect(overLength).toEqual([]);
    expect(queued(null).queue[0].text).toBe('"So what?"\n\n— The Demo Report, p. 30');
  });

  it("keeps the context line last, so the affected-community check still holds", () => {
    expect(queued("Hook.", { contextLine: "97 people died." }).queue[0].text.endsWith("97 people died.")).toBe(true);
  });

  it("reports a hook that takes the post over 300 graphemes and keeps the old text", () => {
    const { queue, overLength } = queued("x".repeat(BLUESKY_GRAPHEME_LIMIT));
    expect(overLength).toHaveLength(1);
    expect(queue[0].text).toBe('"So what?"\n\n— The Demo Report, p. 30');
  });

  it("never rewrites a posted item's text, hook or not", () => {
    const first = buildQueue({ resolved: [hooked()], existing: [], today: "2026-09-27", reportOrder: ["demo"] });
    const posted = first.queue.map((i) => ({ ...i, hook: "A later hook.", posted_url: "https://bsky.app/x" }));
    const { queue } = buildQueue({ resolved: [hooked()], existing: posted, today: "2026-09-28", reportOrder: ["demo"] });
    expect(queue[0].text).toBe(first.queue[0].text);
  });
});

describe("isoDate", () => {
  it("formats a Date as YYYY-MM-DD in UTC", () => {
    expect(isoDate(new Date("2026-09-27T23:30:00Z"))).toBe("2026-09-27");
  });
});

describe("scheduling rules (ay85)", () => {
  const item = (id: string, report: string, extra: Partial<QueueItem> = {}): QueueItem => ({
    ...resolved({ id, report, paragraph: id }),
    scheduled: "2026-10-20",
    posted_url: null,
    ...extra,
  });
  const gaps = (dates: string[]) =>
    dates.slice(1).map((d, n) => (Date.parse(d) - Date.parse(dates[n])) / 86_400_000);

  it("knows the kept-clear dates, 18 December to 2 January, in any year", () => {
    expect(["2026-12-17", "2027-01-03", "2026-06-01"].some(isBlackout)).toBe(false);
    expect(["2026-12-18", "2026-12-25", "2027-01-01", "2027-01-02", "2028-12-31"].every(isBlackout)).toBe(true);
  });

  it("knows the single kept-clear days (23 Oct, 23 Nov, 6, 28 and 30 Jan), in any year", () => {
    expect(["2026-10-23", "2026-11-23", "2027-01-06", "2027-01-28", "2027-01-30", "2030-10-23"].every(isBlackout)).toBe(true);
    expect(["2026-10-22", "2026-10-24", "2026-11-22", "2027-01-29"].some(isBlackout)).toBe(false);
  });

  it("opens with the opening report's excerpt on the start date, whatever the start, and never with Jack Smith", () => {
    for (const start of ["2026-10-20", "2026-11-03"]) {
      const out = scheduleItems(
        [{ report: "jack-smith-vol1" }, { report: "us-911-commission" }, { report: "challenger-accident" }],
        start,
        [],
        true
      );
      expect(out[0]).toEqual({ report: "challenger-accident", scheduled: start });
    }
    const noChallenger = scheduleItems([{ report: "jack-smith-vol1" }, { report: "us-911-commission" }], "2026-10-20", [], true);
    expect(noChallenger[0].report).toBe("us-911-commission");
  });

  it("keeps two Post Office items, and two Grenfell items, at least 14 days apart, filling the days between", () => {
    const po = "uk-post-office-horizon-inquiry";
    const gr = "uk-grenfell-tower-inquiry";
    const reports = [po, po, po, gr, gr, ...Array.from({ length: 40 }, () => "other")];
    const out = scheduleItems(reports.map((report) => ({ report })), "2026-10-20");
    for (const r of [po, gr]) {
      const dates = out.filter((i) => i.report === r).map((i) => i.scheduled);
      expect(dates.length).toBe(r === po ? 3 : 2);
      expect(Math.min(...gaps(dates))).toBeGreaterThanOrEqual(14);
    }
    expect(out).toHaveLength(reports.length);
  });

  it("counts an already posted item of a spaced report", () => {
    const out = scheduleItems(
      [{ report: "uk-grenfell-tower-inquiry" }, { report: "other" }],
      "2026-10-20",
      [{ report: "uk-grenfell-tower-inquiry", scheduled: "2026-10-15" }]
    );
    expect(out.map((i) => i.report)).toEqual(["other", "uk-grenfell-tower-inquiry"]);
    expect(out[1].scheduled >= "2026-10-29").toBe(true);
  });

  it("schedules nothing from 18 December to 2 January", () => {
    const out = scheduleItems(Array.from({ length: 20 }, () => ({ report: "other" })), "2026-12-10");
    expect(out.some((i) => isBlackout(i.scheduled))).toBe(false);
    expect(out[7].scheduled).toBe("2026-12-17");
    expect(out[8].scheduled).toBe("2027-01-03");
  });

  it("buildQueue --start applies all of it, and a later plain run keeps it", () => {
    const po = "uk-post-office-horizon-inquiry";
    const all = [
      resolved({ id: "js", report: "jack-smith-vol1", paragraph: "js" }),
      resolved({ id: "po1", report: po, paragraph: "po1" }),
      resolved({ id: "po2", report: po, paragraph: "po2" }),
      resolved({ id: "ch", report: "challenger-accident", paragraph: "ch" }),
      ...Array.from({ length: 30 }, (_, n) => resolved({ id: `o${n}`, report: "other", paragraph: `o${n}` })),
    ];
    const first = buildQueue({ resolved: all, existing: [], today: "2026-10-16", reportOrder: ["jack-smith-vol1", po, "challenger-accident"] });
    const second = buildQueue({ resolved: all, existing: first.queue, today: "2026-10-16", reportOrder: [], restartFrom: "2026-11-02" });
    expect(second.queue[0]).toMatchObject({ id: "ch", scheduled: "2026-11-02" });
    expect(queueViolations(second.queue)).toEqual([]);
    const third = buildQueue({
      resolved: [...all, resolved({ id: "po3", report: po, paragraph: "po3" })],
      existing: second.queue,
      today: "2026-10-16",
      reportOrder: [],
    });
    expect(third.added).toBe(1);
    expect(queueViolations(third.queue)).toEqual([]);
  });

  it("queueViolations names each broken rule, and ignores a posted item's date", () => {
    const po = "uk-post-office-horizon-inquiry";
    const queue = [
      item("js", "jack-smith-vol1", { scheduled: "2026-10-20" }),
      item("ch", "challenger-accident", { scheduled: "2026-10-21" }),
      item("po1", po, { scheduled: "2026-10-22" }),
      item("po2", po, { scheduled: "2026-10-30" }),
      item("xmas", "other", { scheduled: "2026-12-25" }),
    ];
    const problems = queueViolations(queue);
    expect(problems).toHaveLength(4);
    expect(problems.join("\n")).toMatch(/opens with jack-smith-vol1, not challenger-accident/);
    expect(problems.join("\n")).toMatch(/never the first/);
    expect(problems.join("\n")).toMatch(/under 14/);
    expect(problems.join("\n")).toMatch(/kept-clear/);
    const posted = queue.map((i) => ({ ...i, posted_url: "https://bsky.app/x" }));
    expect(queueViolations(posted)).toEqual([]);
  });
});

describe("who may reach the queue (63cd, 80qf)", () => {
  const registry = {
    reports: [
      { id: "challenger-accident", affected_community: true },
      { id: "uk-hillsborough-panel", affected_community: true, context_line: "Hillsborough Independent Panel (2012). 97 people died." },
      { id: "jack-smith-vol1", news_day_only: true },
      { id: "uk-leveson-inquiry" },
    ],
  };
  const policies = reportPolicies(registry);
  const item = (id: string, report: string, extra: Partial<QueueItem> = {}): QueueItem => ({
    ...resolved({ id, report, paragraph: id }),
    scheduled: "2026-10-20",
    posted_url: null,
    ...extra,
  });

  it("reads the registry flags and context line", () => {
    expect(policies.get("challenger-accident")).toEqual({ affected: true, newsDayOnly: false, contextLine: undefined });
    expect(policies.get("uk-hillsborough-panel")?.contextLine).toBe("Hillsborough Independent Panel (2012). 97 people died.");
    expect(policies.get("jack-smith-vol1")).toEqual({ affected: false, newsDayOnly: true, contextLine: undefined });
    expect(policies.get("uk-leveson-inquiry")).toEqual({ affected: false, newsDayOnly: false, contextLine: undefined });
  });

  it("tiers a highlight: C by the word list or a private person, A only when a person marked it, B otherwise", () => {
    expect(tierOf("South Yorkshire Police failed to close the tunnel.", "A")).toBe("A");
    expect(tierOf("South Yorkshire Police failed to close the tunnel.")).toBe("B");
    expect(tierOf("It appears instead they started from the assumption.")).toBe("B");
    expect(tierOf("The deaths of the 96 victims", "A")).toBe("C");
    expect(tierOf("Mr Smith told the inquiry", "A", ["mr smith"])).toBe("C");
  });

  it("lets only a marked Tier A highlight of an affected-community report through", () => {
    const quote = "NASA failed to act on the O-ring erosion.";
    expect(posterEligibility({ report: "challenger-accident", quote }, policies)).toMatchObject({ ok: false, kind: "tier-b" });
    expect(posterEligibility({ report: "challenger-accident", quote, tier: "A" }, policies)).toEqual({ ok: true });
    expect(posterEligibility({ report: "challenger-accident", quote: "Many died.", tier: "A" }, policies)).toMatchObject({ ok: false, kind: "tier-b" });
    expect(posterEligibility({ report: "uk-leveson-inquiry", quote }, policies)).toEqual({ ok: true });
    expect(posterEligibility({ report: "not-in-registry", quote }, policies)).toEqual({ ok: true });
  });

  it("holds every item of a news-day-only report, marked or not", () => {
    expect(posterEligibility({ report: "jack-smith-vol1", quote: "x", tier: "A" }, policies)).toMatchObject({ ok: false, kind: "news-day" });
  });

  it("appends the context line to the post, after the source line, and counts it against the 300 graphemes", () => {
    const context = "Hillsborough Independent Panel (2012). 97 people died.";
    expect(formatPost("The police failed.", "The Panel Report", 9, context)).toBe(`“The police failed.”\n\n— The Panel Report, p. 9\n\n${context}`);
    expect(formatPost("The police failed.", "The Panel Report", 9)).toBe("“The police failed.”\n\n— The Panel Report, p. 9");
    const ok = resolveCandidate(candidate({ contextLine: context }), HTML, CARDS, "https://x.org");
    expect(ok.ok && ok.item.text.endsWith(`\n\n${context}`)).toBe(true);
    const long = candidate({ quote: "x".repeat(0) + 'When an advisor rushed to tell Mr. Trump, he replied "So what?"', contextLine: "c".repeat(300) });
    expect(resolveCandidate(long, HTML, CARDS, "https://x.org")).toMatchObject({ ok: false });
  });

  it("never schedules a news-day-only item on an ordinary day: new ones are held, queued unposted ones leave, posted ones stay", () => {
    const js = (id: string) => resolved({ id, report: "jack-smith-vol1", paragraph: id });
    const fresh = buildQueue({
      resolved: [js("js1"), resolved({ id: "ch1", report: "challenger-accident", paragraph: "ch1" }), js("js2")],
      existing: [],
      today: "2026-10-16",
      reportOrder: [],
      restartFrom: "2026-10-20",
      newsDayOnly: ["jack-smith-vol1"],
    });
    expect(fresh.queue.map((i) => i.id)).toEqual(["ch1"]);

    const existing = [
      item("ch1", "challenger-accident", { scheduled: "2026-10-20" }),
      item("js1", "jack-smith-vol1", { scheduled: "2026-10-21" }),
      item("js2", "jack-smith-vol1", { scheduled: "2026-10-22", posted_url: "https://bsky.app/x" }),
    ];
    const rebuilt = buildQueue({
      resolved: [js("js1"), js("js2"), resolved({ id: "ch1", report: "challenger-accident", paragraph: "ch1" })],
      existing,
      today: "2026-10-16",
      reportOrder: [],
      newsDayOnly: ["jack-smith-vol1"],
    });
    expect(rebuilt.queue.map((i) => i.id)).toEqual(["ch1", "js2"]);
    expect(rebuilt.heldBack.map((i) => i.id)).toEqual(["js1"]);
  });

  it("queueViolations fails a queue that schedules a news-day-only item, but not a posted one", () => {
    const queue = [item("ch1", "challenger-accident"), item("js1", "jack-smith-vol1", { scheduled: "2026-10-21" })];
    expect(queueViolations(queue)).toEqual([]);
    expect(queueViolations(queue, ["jack-smith-vol1"]).join("\n")).toMatch(/js1.*only on its own news days/);
    expect(queueViolations([queue[0], { ...queue[1], posted_url: "https://bsky.app/x" }], ["jack-smith-vol1"])).toEqual([]);
  });

  it("opens with Challenger on the start date when --start re-dates a queue that held Jack Smith second", () => {
    const rs = [
      resolved({ id: "js1", report: "jack-smith-vol1", paragraph: "js1" }),
      resolved({ id: "lv1", report: "uk-leveson-inquiry", paragraph: "lv1" }),
      resolved({ id: "ch1", report: "challenger-accident", paragraph: "ch1" }),
    ];
    const { queue } = buildQueue({ resolved: rs, existing: rs.map((r, n) => ({ ...r, scheduled: `2026-10-0${n + 1}`, posted_url: null })), today: "2026-10-16", reportOrder: [], restartFrom: "2026-10-20", newsDayOnly: ["jack-smith-vol1"] });
    expect(queue.map((i) => [i.id, i.scheduled])).toEqual([["ch1", "2026-10-20"], ["lv1", "2026-10-21"]]);
  });

  it("the opening Challenger excerpt is not the passage the org launch thread shows an hour earlier", () => {
    const items = [
      { id: "a", report: "challenger-accident", paragraph: "committee-found-nasa-s-drive" },
      { id: "b", report: "challenger-accident", paragraph: "committee-concurs-dr-feynman-s" },
    ];
    expect(scheduleItems(items, "2026-10-20", [], true)[0]).toMatchObject({ id: "b", scheduled: "2026-10-20" });
  });

  it("the live registry flags exactly the three news-day reports, and the three context lines the strategy names", () => {
    const { parse } = require("yaml") as typeof import("yaml");
    const live = parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "../reports/registry.yaml"), "utf8"));
    const p = reportPolicies(live);
    expect([...p].filter(([, v]) => v.newsDayOnly).map(([id]) => id).sort()).toEqual(["jack-smith-vol1", "uk-chilcot-inquiry", "us-jan6-committee"]);
    expect([...p].filter(([, v]) => v.contextLine).map(([id]) => id).sort()).toEqual(["uk-grenfell-tower-inquiry", "uk-hillsborough-panel", "uk-post-office-horizon-inquiry"]);
    for (const id of [...p].filter(([, v]) => v.contextLine).map(([id]) => id)) expect(p.get(id)?.affected).toBe(true);
  });

  it("the committed queue obeys them: Challenger first, no news-day item, every affected-community item a marked Tier A", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const { parse } = require("yaml") as typeof import("yaml");
    const root = require("node:path").join(__dirname, "..");
    const live = reportPolicies(parse(fs.readFileSync(`${root}/reports/registry.yaml`, "utf8")));
    const items = (parse(fs.readFileSync(`${root}/marketing/queue.yaml`, "utf8")).items ?? []) as QueueItem[];
    const open = items.filter((i) => !i.posted_url);
    // The opening rule is about the queue's first post, posted or not (queueViolations): once Challenger has gone out, the next open item may be any report.
    expect([...items].sort((a, b) => a.scheduled.localeCompare(b.scheduled))[0].report).toBe("challenger-accident");
    expect(open.filter((i) => live.get(i.report)?.newsDayOnly).map((i) => i.id)).toEqual([]);
    for (const i of open.filter((i) => live.get(i.report)?.affected)) {
      const highlights = parse(fs.readFileSync(`${root}/editorial/${i.report}.yaml`, "utf8")).highlights as Array<{ paragraph: string; quote: string; tier?: string }>;
      const h = highlights.find((h) => h.paragraph === i.paragraph && i.quote.replace(/\s+/g, " ") === h.quote.replace(/\s+/g, " "));
      expect(h?.tier, i.id).toBe("A");
      const context = live.get(i.report)?.contextLine;
      if (context) expect(i.text.endsWith(context), i.id).toBe(true);
    }
  });
});
