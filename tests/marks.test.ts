import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_PER_DAY,
  actorHash,
  markCounts,
  parseMarkPayload,
  recordMark,
  todayUTC,
} from "../src/lib/marks";
import { createFakeD1 } from "./support/fake-d1";

describe("actorHash", () => {
  it("is deterministic for the same inputs", async () => {
    const a = await actorHash("secret", "2026-08-21", "1.2.3.4", "Mozilla/5.0");
    const b = await actorHash("secret", "2026-08-21", "1.2.3.4", "Mozilla/5.0");
    expect(a).toBe(b);
  });

  it("changes when the date rotates, so it cannot dedupe across days", async () => {
    const day1 = await actorHash("secret", "2026-08-21", "1.2.3.4", "Mozilla/5.0");
    const day2 = await actorHash("secret", "2026-08-22", "1.2.3.4", "Mozilla/5.0");
    expect(day1).not.toBe(day2);
  });

  it("changes for a different reader", async () => {
    const readerA = await actorHash("secret", "2026-08-21", "1.2.3.4", "Mozilla/5.0");
    const readerB = await actorHash("secret", "2026-08-21", "5.6.7.8", "Mozilla/5.0");
    expect(readerA).not.toBe(readerB);
  });
});

describe("todayUTC", () => {
  it("formats as an ISO date", () => {
    expect(todayUTC(Date.UTC(2026, 7, 21, 23, 59))).toBe("2026-08-21");
  });
});

describe("parseMarkPayload", () => {
  const valid = {
    report: "litvinenko-inquiry",
    section: "conclusions",
    paragraph: "the-fsb-operation",
    exact: "probably approved by Mr Patrushev",
    prefix: "was ",
    suffix: " and also",
    page: 246,
    kind: "share",
  };

  it("accepts a well-formed payload", () => {
    expect(parseMarkPayload(valid)).toEqual(valid);
  });

  it("rejects a kind that is neither share nor save", () => {
    expect(parseMarkPayload({ ...valid, kind: "delete" })).toBeNull();
  });

  it("rejects a payload missing the quoted text", () => {
    expect(parseMarkPayload({ ...valid, exact: "" })).toBeNull();
  });

  it("rejects a non-object body", () => {
    expect(parseMarkPayload("not json")).toBeNull();
    expect(parseMarkPayload(null)).toBeNull();
  });

  it("fills in missing optional fields rather than rejecting", () => {
    const { prefix, suffix, page, ...rest } = valid;
    expect(parseMarkPayload(rest)).toEqual({ ...rest, prefix: "", suffix: "", page: null });
  });

  it("accepts an empty section — the /full page has no single section", () => {
    expect(parseMarkPayload({ ...valid, section: "" })).toEqual({ ...valid, section: "" });
  });

  it("defaults a missing section to empty rather than rejecting", () => {
    const { section, ...rest } = valid;
    expect(parseMarkPayload(rest)).toEqual({ ...rest, section: "" });
  });
});

describe("recordMark", () => {
  const event = {
    report: "litvinenko-inquiry",
    section: "conclusions",
    paragraph: "the-fsb-operation",
    exact: "probably approved by Mr Patrushev",
    prefix: "was ",
    suffix: " and also",
    page: 246,
    kind: "share" as const,
  };

  it("stores the event", async () => {
    const db = createFakeD1();
    await recordMark(db, event, "actor-1", 1000);
    expect(db.rows).toEqual([{ ...event, actor: "actor-1", created_at: 1000 }]);
  });

  it("refuses once the same actor exceeds the daily limit for a report", async () => {
    const db = createFakeD1();
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_PER_DAY; i++) {
      const result = await recordMark(db, event, "actor-1", now + i);
      expect(result).toBe("ok");
    }

    const result = await recordMark(db, event, "actor-1", now + RATE_LIMIT_PER_DAY);
    expect(result).toBe("rate-limited");
    expect(db.rows).toHaveLength(RATE_LIMIT_PER_DAY);
  });

  it("does not rate-limit a different actor", async () => {
    const db = createFakeD1();
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_PER_DAY; i++) {
      await recordMark(db, event, "actor-1", now + i);
    }
    const result = await recordMark(db, event, "actor-2", now);
    expect(result).toBe("ok");
  });
});

describe("markCounts", () => {
  it("counts distinct readers of the same passage, not raw events", async () => {
    const db = createFakeD1();
    const passage = {
      report: "litvinenko-inquiry",
      section: "conclusions",
      paragraph: "the-fsb-operation",
      exact: "probably approved",
      prefix: "was ",
      suffix: " by Mr",
      page: 246,
      kind: "share" as const,
    };
    // The same reader shares, then saves — one reader, two events.
    await recordMark(db, passage, "reader-1", 1);
    await recordMark(db, { ...passage, kind: "save" }, "reader-1", 2);
    await recordMark(db, passage, "reader-2", 3);

    const counts = await markCounts(db, "litvinenko-inquiry", 1);
    expect(counts).toEqual([
      {
        paragraph: "the-fsb-operation",
        exact: "probably approved",
        prefix: "was ",
        suffix: " by Mr",
        page: 246,
        readers: 2,
      },
    ]);
  });

  it("excludes passages below the threshold", async () => {
    const db = createFakeD1();
    const passage = {
      report: "litvinenko-inquiry",
      section: "conclusions",
      paragraph: "the-fsb-operation",
      exact: "probably approved",
      prefix: "",
      suffix: "",
      page: 246,
      kind: "share" as const,
    };
    await recordMark(db, passage, "reader-1", 1);

    expect(await markCounts(db, "litvinenko-inquiry", 2)).toEqual([]);
    expect(await markCounts(db, "litvinenko-inquiry", 1)).toHaveLength(1);
  });

  it("keeps passages in different reports separate", async () => {
    const db = createFakeD1();
    const passage = {
      report: "litvinenko-inquiry",
      section: "conclusions",
      paragraph: "the-fsb-operation",
      exact: "probably approved",
      prefix: "",
      suffix: "",
      page: 246,
      kind: "share" as const,
    };
    await recordMark(db, passage, "reader-1", 1);
    await recordMark(db, { ...passage, report: "other-report" }, "reader-1", 2);

    expect(await markCounts(db, "litvinenko-inquiry", 1)).toHaveLength(1);
  });
});
