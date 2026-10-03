/**
 * Why did a section vanish (or appear) between two corpus fingerprints?
 *
 * `pnpm corpus check` used to say `section gone: <slug>` and leave the reader to work out whether a
 * chapter was lost or merely folded into its neighbour. The usual cause is the sliver rule in
 * @rtm/ingest's section splitter (src/sections.ts): a part with under 2,500 characters of text is merged
 * into the section before it (a division banner, or a leading sliver, into the one after). That moves its
 * paragraphs, not its text, so the evidence is in the counts: the neighbour's citable-paragraph count
 * rises by about what the vanished section held. The baseline keeps no per-section paragraph lists, so
 * this reads the counts it does keep, and says "consistent with" rather than claiming it saw the merge.
 */
export type Section = { slug: string; title: string; paragraphs: number; ids: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Surviving neighbours either side of position `i` in `list`, by slug present in `keep`. */
function survivors(list: Section[], i: number, keep: Map<string, Section>): { prev?: Section; next?: Section } {
  let prev: Section | undefined;
  let next: Section | undefined;
  for (let j = i - 1; j >= 0 && !prev; j--) if (keep.has(list[j].slug)) prev = list[j];
  for (let j = i + 1; j < list.length && !next; j++) if (keep.has(list[j].slug)) next = list[j];
  return { prev, next };
}

/** Are `list[a]` and `list[b]` both outside `keep`, with no member of `keep` between them? */
function sameGap(list: Section[], a: number, b: number, keep: Map<string, Section>): boolean {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  for (let k = lo + 1; k < hi; k++) if (keep.has(list[k].slug)) return false;
  return true;
}

/**
 * One line of explanation for a section in `before` that is not in `after`.
 *
 * - the same paragraph ids under a new slug: it was renamed;
 * - a neighbour kept in `after` gained at least the paragraphs this gap lost: folded into it
 *   (backwards first, which is what the sliver rule does);
 * - otherwise: its paragraphs are not accounted for, so say that rather than guess.
 */
export function explainGone(before: Section[], after: Section[], slug: string): string {
  const afterBySlug = new Map(after.map((s) => [s.slug, s]));
  const beforeBySlug = new Map(before.map((s) => [s.slug, s]));
  const i = before.findIndex((s) => s.slug === slug);
  const gone = before[i];
  if (!gone) return "";

  const renamed = after.find((s) => !beforeBySlug.has(s.slug) && s.ids === gone.ids && gone.paragraphs > 0);
  if (renamed) return `renamed to ${renamed.slug} (same ${plural(gone.paragraphs, "paragraph id")})`;

  // Everything that vanished in the same gap, between the same two survivors, folds together.
  const { prev, next } = survivors(before, i, afterBySlug);
  const gap = before.filter((s, k) => !afterBySlug.has(s.slug) && (k === i || sameGap(before, k, i, afterBySlug)));
  const lost = gap.reduce((total, s) => total + s.paragraphs, 0);
  const others = gap.length - 1;
  const together = others > 0 ? ` (with ${plural(others, "other section")} in the same gap, ${plural(lost, "paragraph")} in all)` : "";
  const rose = (s: Section | undefined) => (s ? afterBySlug.get(s.slug)!.paragraphs - beforeBySlug.get(s.slug)!.paragraphs : 0);

  if (prev && lost > 0 && rose(prev) >= lost) {
    return `folded into the section before it, ${prev.slug}, which gained ${plural(rose(prev), "paragraph")}${together}: consistent with the sliver rule (a part under 2,500 characters merges into the one before it)`;
  }
  if (next && lost > 0 && rose(next) >= lost) {
    return `folded forward into the section after it, ${next.slug}, which gained ${plural(rose(next), "paragraph")}${together}: consistent with a division banner or leading sliver folding forward`;
  }
  if (prev && next && lost > 0 && rose(prev) + rose(next) >= lost) {
    return `split between its neighbours ${prev.slug} (+${rose(prev)}) and ${next.slug} (+${rose(next)})${together}`;
  }
  return `no neighbouring section gained its ${plural(gone.paragraphs, "paragraph")}${together}: the text was removed or moved elsewhere, not merged; read the \`pnpm ingest check\` diff`;
}

/** One line for a section in `after` that was not in `before`: split out of a neighbour that shrank, or just new. */
export function explainNew(before: Section[], after: Section[], slug: string): string {
  const beforeBySlug = new Map(before.map((s) => [s.slug, s]));
  const afterBySlug = new Map(after.map((s) => [s.slug, s]));
  const i = after.findIndex((s) => s.slug === slug);
  const added = after[i];
  if (!added) return "";
  const gone = before.find((s) => !afterBySlug.has(s.slug) && s.ids === added.ids && added.paragraphs > 0);
  if (gone) return `renamed from ${gone.slug} (same ${plural(added.paragraphs, "paragraph id")})`;
  const { prev, next } = survivors(after, i, beforeBySlug);
  const fell = (s: Section | undefined) => (s ? beforeBySlug.get(s.slug)!.paragraphs - afterBySlug.get(s.slug)!.paragraphs : 0);
  for (const [label, s] of [["before", prev], ["after", next]] as const) {
    if (s && added.paragraphs > 0 && fell(s) >= added.paragraphs) {
      return `split out of the section ${label} it, ${s.slug}, which lost ${plural(fell(s), "paragraph")}`;
    }
  }
  return `${plural(added.paragraphs, "paragraph")}, not taken from a neighbouring section`;
}
