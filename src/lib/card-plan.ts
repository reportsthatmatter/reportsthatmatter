/**
 * Which share cards should exist, and which on disk are orphans (reportsthatmatter-u09x).
 *
 * A quote card is named by `quoteCardId(paragraph, words)`, so a re-ingest that moves a highlight's
 * paragraph id (or an edit to its words) moves the card's name: the new card is rendered and the old
 * file stays behind unless something prunes it. `pnpm cards` prunes with `orphanCards`; the test
 * `tests/cards.test.ts` and `pnpm cards --check` fail on any orphan or missing card with the same logic.
 *
 * Names are `<report>/<card>` without the `.png`, the form `src/generated/cards.ts` lists.
 */
import { quoteCardId } from "./card-key";

export interface CardHighlight {
  report: string;
  paragraph: string;
  exact: string;
  card?: boolean;
}

/** The quote cards the editor's highlights ask for: every `card: true` one (or every highlight with `all`). */
export function wantedQuoteCards(highlights: readonly CardHighlight[], all = false): string[] {
  return [...new Set(highlights.filter((h) => all || h.card).map((h) => `${h.report}/${quoteCardId(h.paragraph, h.exact)}`))].sort();
}

const isQuoteCard = (name: string) => /\/q-[0-9a-f]{8}$/.test(name);

/**
 * Cards on disk nobody asks for. `keep` is every wanted name. With `quoteOnly` only `q-*` cards can be orphans (a
 * `--highlights` run knows nothing about the curated and default cards); otherwise any card not in `keep` is.
 * `reports` limits the judgement to those reports (a `--highlights <report>` run).
 */
export function orphanCards(onDisk: readonly string[], keep: Iterable<string>, opts: { quoteOnly?: boolean; reports?: readonly string[] } = {}): string[] {
  const wanted = new Set(keep);
  return onDisk
    .filter((name) => !wanted.has(name))
    .filter((name) => !opts.quoteOnly || isQuoteCard(name))
    .filter((name) => !opts.reports?.length || opts.reports.includes(name.split("/")[0]))
    .sort();
}
