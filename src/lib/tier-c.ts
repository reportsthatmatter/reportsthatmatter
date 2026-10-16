/**
 * The tier rule for highlights in affected-community reports (reportsthatmatter-zh1w; marketing strategy section 8,
 * decision bead 63cd). Pure, so `pnpm editorial`, `pnpm posts` and the tests share one reading of it.
 *
 * Tier C (landing page only, never a card, post or thread): the passage states or counts deaths or injuries,
 * names a private individual, or reproduces words quoted in order to condemn them. Only the first two are
 * machine-checkable: the word list below and an editorial file's optional `private_people:` list. The third
 * (a smear, a last word) is for the person who marks the highlight. Tier A is also a person's mark (`tier: A`, see `tierOf` in posts.ts).
 */

/** 63cd is decided (Rufus, 2026-10-16): a Tier C `card: true` fails `pnpm editorial` and `pnpm posts` refuses it. */
export const TIER_C_IS_FAILURE = true;

/** Strategy section 8's word list, with the plural and spelling variants a reader would count as the same word. */
export const TIER_C_WORDS: readonly string[] = [
  "died",
  "death",
  "deaths",
  "dead",
  "killed",
  "lives",
  "suicide",
  "survived",
  "crush",
  "crushed",
  "bodies",
  "victim",
  "victims",
  "traumatised",
  "traumatized",
];

export type TierCFinding = { report: string; paragraph: string; matched: string; kind: "word" | "person" };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORDS = new RegExp(`(?<![\\p{L}\\p{N}])(${TIER_C_WORDS.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "iu");

/** The report ids flagged `affected_community: true` in the registry. */
export function affectedCommunityIds(registry: { reports: Array<{ id: string; affected_community?: boolean }> }): string[] {
  return registry.reports.filter((r) => r.affected_community === true).map((r) => r.id);
}

/** The first Tier C word or listed private person in a quote, or null. */
export function tierCMatch(quote: string, privatePeople: readonly string[] = []): { matched: string; kind: "word" | "person" } | null {
  const word = WORDS.exec(quote);
  if (word) return { matched: word[1].toLowerCase(), kind: "word" };
  const lower = quote.toLowerCase();
  const person = privatePeople.find((p) => p.trim() && lower.includes(p.trim().toLowerCase()));
  return person ? { matched: person, kind: "person" } : null;
}

/** Every `card: true` highlight of an affected-community editorial file that is Tier C. Other reports and non-card highlights are none of its business. */
export function tierCFindings(
  source: { report: string; private_people?: string[]; highlights?: Array<{ paragraph: string; quote: string; card?: boolean }> },
  affected: readonly string[]
): TierCFinding[] {
  if (!affected.includes(source.report)) return [];
  const out: TierCFinding[] = [];
  for (const h of source.highlights ?? []) {
    if (!h.card) continue;
    const m = tierCMatch(h.quote, source.private_people ?? []);
    if (m) out.push({ report: source.report, paragraph: h.paragraph, ...m });
  }
  return out;
}

export function describeTierC(f: TierCFinding): string {
  return `${f.report}/${f.paragraph}: card: true on a Tier C highlight (${f.kind === "word" ? `word "${f.matched}"` : `names ${f.matched}`}); strategy section 8 allows a card only for Tier A`;
}
