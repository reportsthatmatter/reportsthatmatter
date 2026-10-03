/**
 * Paragraph-id aliases, the generating half (reportsthatmatter-q8c; the
 * matcher is ivg.1's, from PR #228's scripts/aliases.ts, moved here).
 *
 * Ids are read off the renderer (`renderArtifacts` + `extractPassages`, the
 * same source `pnpm corpus check` fingerprints), so a recorded id is exactly a
 * `?p=` value the site served. An old paragraph is matched to the new text by
 * containment: its first 12, 8, 6 or 4 normalised words found exactly once in
 * the new text, and the id of the new paragraph holding that position is the
 * alias target; where the opening was garbled, 8 words from its middle.
 */
import { renderArtifacts, extractPassages } from "@rtm/ingest";
import { followAlias } from "./aliases";

export type Passage = { id: string; text: string; section: string };
export type Rendered = { passages: Passage[]; sections: { slug: string }[] };

export type AliasFile = {
  aliases: Record<string, string>;
  sections: Record<string, string>;
  unmatched: string[];
};

export const emptyAliases = (): AliasFile => ({ aliases: {}, sections: {}, unmatched: [] });

/** Every citable passage of a report's markdown, in order, with its section. */
export function render(markdown: string): Rendered {
  const { meta, fragments } = renderArtifacts(markdown);
  const passages: Passage[] = [];
  for (const section of meta.sections) {
    for (const p of extractPassages(fragments[section.slug])) passages.push({ id: p.paragraphId, text: p.text, section: section.slug });
  }
  return { passages, sections: meta.sections.map((s: { slug: string }) => ({ slug: s.slug })) };
}

const norm = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Old ids the new text no longer has: where each went (`moved`) or that it is gone (`lost`). */
export function computeMoves(before: Rendered, after: Rendered) {
  const live = new Map(after.passages.map((p) => [p.id, p]));
  let stream = "";
  const starts: { at: number; id: string }[] = [];
  for (const p of after.passages) {
    starts.push({ at: stream.length, id: p.id });
    stream += norm(p.text) + " ";
  }
  const idAt = (pos: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid].at <= pos) lo = mid;
      else hi = mid - 1;
    }
    return starts[lo].id;
  };
  const once = (probe: string) => {
    if (!probe) return -1;
    const i = stream.indexOf(probe);
    return i >= 0 && stream.indexOf(probe, i + 1) < 0 ? i : -1;
  };
  const moved: Record<string, string> = {};
  const lost: string[] = [];
  let kept = 0;
  for (const old of before.passages) {
    if (live.has(old.id)) {
      kept++;
      continue;
    }
    const words = norm(old.text).split(" ");
    let found = -1;
    for (const k of [12, 8, 6, 4]) {
      if (words.length < k && k !== 4) continue;
      found = once(words.slice(0, k).join(" "));
      if (found >= 0) break;
    }
    if (found < 0 && words.length >= 10) {
      const mid = Math.floor(words.length / 2);
      found = once(words.slice(mid, mid + 8).join(" "));
    }
    if (found >= 0) moved[old.id] = idAt(found);
    else lost.push(old.id);
  }
  return { moved, lost, kept };
}

/** A section slug the new text lacks maps to the section most of its moved paragraphs landed in. */
export function sectionMoves(before: Rendered, after: Rendered, moved: Record<string, string>): Record<string, string> {
  const newSlugs = new Set(after.sections.map((s) => s.slug));
  const sectionOf = new Map(after.passages.map((p) => [p.id, p.section]));
  const votes = new Map<string, Map<string, number>>();
  for (const p of before.passages) {
    if (newSlugs.has(p.section)) continue;
    const target = sectionOf.get(p.id) ?? (moved[p.id] ? sectionOf.get(moved[p.id]) : undefined);
    if (!target) continue;
    const v = votes.get(p.section) ?? new Map<string, number>();
    v.set(target, (v.get(target) ?? 0) + 1);
    votes.set(p.section, v);
  }
  const out: Record<string, string> = {};
  for (const [slug, v] of votes) out[slug] = [...v.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return out;
}

/**
 * Folds one step (old text -> new text) into the alias file.
 *
 * Existing aliases are kept and re-pointed through this step's moves, so a
 * chain old -> middle -> new collapses to old -> new; an id that is live again
 * drops out; an id with no home goes to `unmatched`. Returns the new file; the
 * input is not modified.
 */
export function fold(prev: AliasFile, before: Rendered, after: Rendered): AliasFile {
  const { moved, lost } = computeMoves(before, after);
  const live = new Set(after.passages.map((p) => p.id));
  const liveSlugs = new Set(after.sections.map((s) => s.slug));
  const all = { ...prev.aliases, ...moved };
  const aliases: Record<string, string> = {};
  const unmatched = new Set(prev.unmatched.concat(lost));
  for (const id of Object.keys(all)) {
    if (live.has(id)) continue;
    const target = followAlias(all, id, (x) => live.has(x));
    if (target) aliases[id] = target;
    else unmatched.add(id);
  }
  for (const id of [...unmatched]) if (live.has(id) || aliases[id]) unmatched.delete(id);
  const secAll = { ...prev.sections, ...sectionMoves(before, after, moved) };
  const sections: Record<string, string> = {};
  for (const slug of Object.keys(secAll)) {
    if (liveSlugs.has(slug)) continue;
    const target = followAlias(secAll, slug, (x) => liveSlugs.has(x));
    if (target) sections[slug] = target;
  }
  const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { aliases: sorted(aliases), sections: sorted(sections), unmatched: [...unmatched].sort() };
}

export const idsOf = (r: Rendered) => r.passages.map((p) => p.id);

/** One id per line, sorted, no blanks. */
export const parseIds = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
export const formatIds = (ids: Iterable<string>) => [...new Set(ids)].sort().join("\n") + "\n";
