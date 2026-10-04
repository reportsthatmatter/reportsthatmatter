/**
 * The share cards, the manifest and the posting queue agree with the highlights, and regenerating them changes
 * nothing on a clean checkout (reportsthatmatter-u09x). A re-ingest that moves a `card: true` highlight's paragraph
 * id renames its card; without these, the old card, manifest line and queue link go stale and only
 * share-links.test.ts notices (and only for queued items). `pnpm cards` prunes; `pnpm ship` runs it after a re-ingest.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { CARDS } from "../src/generated/cards";
import { orphanCards, wantedQuoteCards, type CardHighlight } from "../src/lib/card-plan";
import { quoteCardId } from "../src/lib/card-key";

const root = join(import.meta.dirname, "..");
const tsx = join(root, "node_modules/.bin/tsx");

describe("orphanCards", () => {
  const disk = ["a/default", "a/q-00000001", "a/q-00000002", "a/old-curated", "b/q-00000003"];
  it("flags every unwanted card in a full run", () => {
    expect(orphanCards(disk, ["a/default", "a/q-00000001", "b/q-00000003"])).toEqual(["a/old-curated", "a/q-00000002"]);
  });
  it("a highlights run judges only q-* cards, and only in the reports asked for", () => {
    expect(orphanCards(disk, ["a/q-00000001"], { quoteOnly: true })).toEqual(["a/q-00000002", "b/q-00000003"]);
    expect(orphanCards(disk, ["a/q-00000001"], { quoteOnly: true, reports: ["a"] })).toEqual(["a/q-00000002"]);
  });
  it("names a card by (report, paragraph, words), so a moved paragraph id is a new card", () => {
    const h = (paragraph: string): CardHighlight => ({ report: "r", paragraph, exact: "Some words.", card: true });
    expect(wantedQuoteCards([h("p-old")])).toEqual([`r/${quoteCardId("p-old", "Some words.")}`]);
    expect(wantedQuoteCards([h("p-new")])).not.toEqual(wantedQuoteCards([h("p-old")]));
    expect(wantedQuoteCards([{ ...h("p"), card: false }])).toEqual([]);
    expect(wantedQuoteCards([{ ...h("p"), card: false }], true)).toHaveLength(1);
  });
});

describe("committed cards", () => {
  let highlights: CardHighlight[] = [];
  const onDisk: string[] = [];

  beforeAll(() => {
    const json = join(root, "build/editorial-highlights.json");
    if (!existsSync(json)) execFileSync(tsx, ["scripts/editorial.mjs"], { cwd: root, stdio: "ignore" });
    highlights = JSON.parse(readFileSync(json, "utf8"));
    for (const dir of readdirSync(join(root, "assets/cards"), { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      for (const file of readdirSync(join(root, "assets/cards", dir.name))) if (file.endsWith(".png")) onDisk.push(`${dir.name}/${file.replace(/\.png$/, "")}`);
    }
  });

  it("every card: true highlight has its card, on disk and in the manifest", () => {
    const wanted = wantedQuoteCards(highlights);
    expect(wanted.length).toBeGreaterThan(40);
    expect(wanted.filter((name) => !onDisk.includes(name))).toEqual([]);
    expect(wanted.filter((name) => !CARDS.has(name))).toEqual([]);
  });

  it("no orphan card is left: every q-* on disk or in the manifest is wanted by a highlight", () => {
    const wanted = wantedQuoteCards(highlights);
    expect(orphanCards(onDisk, wanted, { quoteOnly: true })).toEqual([]);
    expect(orphanCards([...CARDS], wanted, { quoteOnly: true })).toEqual([]);
  });

  it("no other orphan: a curated card is in docs/share-quotes.yaml, a default card is a report's", () => {
    const quotes = parse(readFileSync(join(root, "docs/share-quotes.yaml"), "utf8")).quotes as Array<{ report: string; paragraph: string }>;
    const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8")).reports as Array<{ id: string }>;
    const keep = [...quotes.map((q) => `${q.report}/${q.paragraph}`), ...registry.map((r) => `${r.id}/default`), ...wantedQuoteCards(highlights)];
    expect(orphanCards(onDisk, keep)).toEqual([]);
  });

  it("the manifest lists exactly the cards on disk", () => {
    expect([...CARDS].sort()).toEqual([...onDisk].sort());
  });
});

describe("regenerating changes nothing on a clean checkout", () => {
  it("pnpm posts --verify: marketing/queue.yaml is what a run would write", () => {
    const run = () => execFileSync(tsx, ["scripts/posts.mjs", "--verify"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(run()).toContain("up to date");
  }, 60_000);

  // Renders all 90-odd cards in chromium (about a minute and a half) and compares bytes: opt in with RTM_RENDER_CARDS=1
  // (needs `pnpm exec playwright install chromium`). `pnpm ship` runs the same render in its cards step.
  it.skipIf(!process.env.RTM_RENDER_CARDS)("pnpm cards --check: every card and the manifest match a fresh render", () => {
    expect(() => execFileSync(tsx, ["scripts/cards.mjs", "--check"], { cwd: root, stdio: "pipe" })).not.toThrow();
  }, 400_000);
});
