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
