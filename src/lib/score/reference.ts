/**
 * A reference edition as mirrored in a report repo: reference/manifest.json
 * and reference/blocks.jsonl, written by scripts/score/reference.py.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type RefType = "heading" | "paragraph" | "quote" | "list" | "note" | "table" | "contents";

export type RefBlock = {
  i: number;
  type: RefType;
  level: number | null;
  num: string | null;
  text: string;
  section: string;
  markers: { label: string; offset: number; note: string | null }[];
  /** notes: the note's id and printed label, and the block carrying its marker */
  id?: string;
  label?: string;
  ref?: number | null;
  page?: string | number | null;
};

export type Manifest = {
  report: string;
  set: "development" | "held-out";
  edition: string;
  licence: string;
  sources: { path: string; url?: string; sha256: string }[];
  blocks: { path: string; sha256: string; normaliser: string; counts: Record<string, number> };
  version?: { differs: boolean; reference: string; ours: string; policy: string };
  caveats?: string[];
};

export type Reference = { manifest: Manifest; blocks: RefBlock[] };

export function hasReference(repo: string): boolean {
  return existsSync(join(repo, "reference", "manifest.json")) && existsSync(join(repo, "reference", "blocks.jsonl"));
}

export function loadReference(repo: string): Reference {
  const manifest = JSON.parse(readFileSync(join(repo, "reference", "manifest.json"), "utf8")) as Manifest;
  const blocks = readFileSync(join(repo, "reference", "blocks.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RefBlock);
  return { manifest, blocks };
}

export function parseReferenceLines(jsonl: string): RefBlock[] {
  return jsonl
    .split("\n")
    .filter(Boolean)
    .map((l, i) => ({ markers: [], level: null, num: null, section: "", i, ...JSON.parse(l) }) as RefBlock);
}

/**
 * A served full.md as a reference edition: for a report built from a clean
 * edition (`cleanEdition` in its ingest.ts), the text the site serves is the
 * answer key its PDF ingest, kept as a shadow, is scored against
 * (`pnpm score <id> --shadow`, reportsthatmatter-ivg.1). Body blocks keep
 * their type, level and markers; each note definition becomes a note whose
 * id its markers name.
 */
export function referenceFromMarkdown(ours: { body: OurBlockLike[]; notes: OurBlockLike[] }): RefBlock[] {
  const out: RefBlock[] = [];
  const noteId = (k: number) => `n${k}`;
  // the closing "## Notes" the pipeline writes over the definitions is not the report's
  const body = ours.body.at(-1)?.type === "heading" && ours.body.at(-1)?.text === "Notes" ? ours.body.slice(0, -1) : ours.body;
  for (const b of body) {
    out.push({
      i: out.length,
      type: b.type === "contents" ? "contents" : (b.type as RefType),
      level: b.level,
      num: null,
      text: b.text,
      section: b.section,
      markers: b.markers.map((m) => ({ label: m.label, offset: m.offset, note: m.note === null ? null : noteId(m.note) })),
    });
  }
  ours.notes.forEach((n, k) => {
    out.push({ i: out.length, type: "note", level: null, num: null, text: n.text, section: "Notes", markers: [], id: noteId(k), label: n.label?.replace(/-\d+$/, "") });
  });
  const owner = new Map<string, number>();
  for (const blk of out) for (const m of blk.markers) if (m.note && !owner.has(m.note)) owner.set(m.note, blk.i);
  for (const blk of out) if (blk.type === "note") blk.ref = owner.get(blk.id!) ?? null;
  return out;
}

type OurBlockLike = {
  type: string;
  level: number | null;
  text: string;
  section: string;
  label?: string;
  markers: { label: string; offset: number; note: number | null }[];
};
