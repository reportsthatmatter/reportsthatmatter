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
import * as pinned from "@rtm/ingest";
import { followAlias } from "./aliases";

/** The two ingest functions the generator needs; the old side of a move is rendered by the OLD pin's copy (hxo4). */
export type Ingest = Pick<typeof pinned, "renderArtifacts" | "extractPassages">;

/** `block`: the text the paragraph introduces (the list or quotation after it that has no id of its own), which a quote may cite through it. */
export type Passage = { id: string; text: string; section: string; block?: string };
export type Rendered = { passages: Passage[]; sections: { slug: string }[] };

/**
 * An id that now names a different paragraph than it did when published (reportsthatmatter-rf4c).
 * `movedTo` is where the old paragraph's text lives now (null when it is gone); `accepted` is set by
 * `pnpm aliases generate --accept-reuse` after somebody read it and fixed what cited the id.
 */
export type Reuse = { movedTo: string | null; accepted?: true };

export type AliasFile = {
  aliases: Record<string, string>;
  sections: Record<string, string>;
  unmatched: string[];
  /** Published section slugs whose paragraphs could not be found anywhere; a plain 404 for the old URL. */
  unmatchedSections: string[];
  reused: Record<string, Reuse>;
  /**
   * Ids that kept their paragraph but lost what it introduced (an ordered list whose items now have ids
   * of their own, mv1t): id -> where that content is now. Informational for a link to the id, which still
   * lands on the paragraph; `pnpm aliases check` fails when editorial cites one (a quote may be gone from it).
   */
  movedOut: Record<string, string | null>;
};

export const emptyAliases = (): AliasFile => ({ aliases: {}, sections: {}, unmatched: [], unmatchedSections: [], reused: {}, movedOut: {} });

const UNIT_START = /<(p|ul) id="([^"]+)"/g;
const plain = (html: string) =>
  html
    .replace(/<a class="page-marker"[\s\S]*?<\/a>/g, " ")
    .replace(/<span class="sidenote(?: [^"]*)?">[\s\S]*?<\/span>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/¶/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** For each citable id, the text between the end of its element and the next id'd element (an ordered list, a quotation). */
function introducedBlocks(html: string): Map<string, string> {
  const starts = [...html.matchAll(UNIT_START)];
  const out = new Map<string, string>();
  starts.forEach((m, i) => {
    const end = html.indexOf(`</${m[1]}>`, m.index) + m[1].length + 3;
    const block = plain(html.slice(end, i + 1 < starts.length ? starts[i + 1].index : html.length));
    if (block) out.set(m[2], block);
  });
  return out;
}

/** Every citable passage of a report's markdown, in order, with its section. */
export function render(markdown: string, ingest: Ingest = pinned): Rendered {
  const { renderArtifacts, extractPassages } = ingest;
  const { meta, fragments } = renderArtifacts(markdown);
  const passages: Passage[] = [];
  for (const section of meta.sections) {
    const blocks = introducedBlocks(fragments[section.slug]);
    for (const p of extractPassages(fragments[section.slug])) passages.push({ id: p.paragraphId, text: p.text, section: section.slug, block: blocks.get(p.paragraphId) });
  }
  return { passages, sections: meta.sections.map((s: { slug: string }) => ({ slug: s.slug })) };
}

const norm = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Finds where a piece of old text sits in the new text: the id of the new paragraph holding it, or null. */
function locator(after: Rendered) {
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
  return (text: string): string | null => {
    const words = norm(text).split(" ");
    let found = -1;
    // A heading the old text ran into the paragraph ("Initial response 2.4.42 By this time, however, …", a8l):
    // the paragraph opens at its printed number, which the new text, with the heading cut out, opens on.
    const label = words.findIndex((w, i) => i > 0 && i <= 12 && /^\d+$/.test(w) && /^\d+$/.test(words[i + 1] ?? "") && /^\d+$/.test(words[i + 2] ?? "") && !/^\d+$/.test(words[i - 1]));
    if (label > 0) {
      for (const k of [12, 8, 6]) {
        if (words.length - label < k) continue;
        found = once(words.slice(label, label + k).join(" "));
        if (found >= 0) break;
      }
      if (found >= 0) return idAt(found);
    }
    for (const k of [12, 8, 6, 4]) {
      if (words.length < k && k !== 4) continue;
      found = once(words.slice(0, k).join(" "));
      if (found >= 0) break;
    }
    if (found < 0 && words.length >= 10) {
      const mid = Math.floor(words.length / 2);
      found = once(words.slice(mid, mid + 8).join(" "));
    }
    return found >= 0 ? idAt(found) : null;
  };
}

/** Old ids the new text no longer has: where each went (`moved`) or that it is gone (`lost`). */
export function computeMoves(before: Rendered, after: Rendered) {
  const live = new Map(after.passages.map((p) => [p.id, p]));
  const locate = locator(after);
  const moved: Record<string, string> = {};
  const lost: string[] = [];
  let kept = 0;
  for (const old of before.passages) {
    if (live.has(old.id)) {
      kept++;
      continue;
    }
    const to = locate(old.text);
    if (to) moved[old.id] = to;
    else lost.push(old.id);
  }
  return { moved, lost, kept };
}

const words = (t: string) => new Set(norm(t).split(" ").filter(Boolean));

/** Whether two texts are plausibly the same paragraph edited: most of the shorter one's words are in the other. */
export function sameParagraph(a: string, b: string): boolean {
  const x = words(a);
  const y = words(b);
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  if (!small.size) return true;
  let hit = 0;
  for (const w of small) if (big.has(w)) hit++;
  return hit / small.size >= 0.5;
}

/** At least half of `small`'s words are in `big`. */
const contains = (big: string, small: string) => {
  const b = words(big);
  const s = [...words(small)];
  return s.filter((w) => b.has(w)).length / s.length >= 0.5;
};

/**
 * Ids that are live in both texts but name a different paragraph now (rf4c). An id that is merely
 * edited (a corrected word, a join that kept the opening) is the same paragraph; one whose old text is
 * unrelated to the new text under the same id was reassigned. `movedTo` says where the old text went.
 */
export function detectReuse(before: Rendered, after: Rendered): { reused: Record<string, Reuse>; movedOut: Record<string, string | null> } {
  const now = new Map(after.passages.map((p) => [p.id, p]));
  const locate = locator(after);
  const out: Record<string, Reuse> = {};
  const movedOut: Record<string, string | null> = {};
  for (const old of before.passages) {
    const cur = now.get(old.id);
    if (!cur) continue;
    if (!sameParagraph(old.text, cur.text)) {
      const to = locate(old.text);
      out[old.id] = { movedTo: to && to !== old.id ? to : null };
      continue;
    }
    // The paragraph is the same, but what it introduced (a list a quotation cites through it) is no longer under it.
    const oldBlock = old.block ?? "";
    if (words(oldBlock).size >= 8 && !contains(`${cur.text} ${cur.block ?? ""}`, oldBlock)) {
      // Items of a list lose their "1." when they are list items and gain it as paragraphs: probe the first item.
      const to = locate(oldBlock) ?? locate(oldBlock.split(/(?<=[.;:])\s/)[0]);
      movedOut[old.id] = to && to !== old.id ? to : null;
    }
  }
  return { reused: out, movedOut };
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
  const unmatchedSections = new Set(prev.unmatchedSections);
  for (const slug of Object.keys(secAll)) {
    if (liveSlugs.has(slug)) continue;
    const target = followAlias(secAll, slug, (x) => liveSlugs.has(x));
    if (target) sections[slug] = target;
  }
  // A section the old text had, the new text lacks, and no paragraph of it can be traced: a loss to read.
  for (const slug of new Set([...before.sections.map((s) => s.slug), ...Object.keys(prev.sections)])) {
    if (!liveSlugs.has(slug) && !sections[slug]) unmatchedSections.add(slug);
  }
  for (const slug of [...unmatchedSections]) if (liveSlugs.has(slug) || sections[slug]) unmatchedSections.delete(slug);
  // Reuse: this step's detections join the earlier ones (an accepted entry stays accepted); an id that is no longer live drops out.
  const reused: Record<string, Reuse> = {};
  const found = detectReuse(before, after);
  for (const [id, r] of Object.entries({ ...found.reused, ...prev.reused })) if (live.has(id)) reused[id] = r;
  const movedOut: Record<string, string | null> = {};
  for (const [id, to] of Object.entries({ ...found.movedOut, ...prev.movedOut })) if (live.has(id) && !reused[id]) movedOut[id] = to && live.has(to) ? to : null;
  const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { aliases: sorted(aliases), sections: sorted(sections), unmatched: [...unmatched].sort(), unmatchedSections: [...unmatchedSections].sort(), reused: sorted(reused), movedOut: sorted(movedOut) };
}

export const idsOf = (r: Rendered) => r.passages.map((p) => p.id);
export const slugsOf = (r: Rendered) => r.sections.map((s) => s.slug);

/** Marks every pending reuse accepted (somebody read the list and fixed what cited those ids). */
export const acceptReuse = (file: AliasFile): AliasFile => ({
  ...file,
  reused: Object.fromEntries(Object.entries(file.reused).map(([id, r]) => [id, { ...r, accepted: true as const }])),
});

/** One id per line, sorted, no blanks. */
export const parseIds = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
export const formatIds = (ids: Iterable<string>) => [...new Set(ids)].sort().join("\n") + "\n";
