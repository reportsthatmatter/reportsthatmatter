import { createHash } from "node:crypto";
import type { IngestResult } from "./pipeline";

/**
 * A digest of one report's output.
 *
 * Small enough to commit and to read in a diff, detailed enough that any
 * heuristic change which moves a report's structure moves the digest. This is
 * the corpus regression signal the pipeline had none of: `AGENTS.md` asks that
 * every heuristic be tested against the messiest source in the corpus, and
 * until now that was a human instruction rather than a check. The Leveson fix
 * changed three other reports without anyone noticing (#118 §1.7); this is
 * what would have caught it.
 */
export type Baseline = {
  markdownSha: string;
  words: number;
  blocks: Record<string, number>;
  headings: string[];
  footnotes: number;
  pageMarkers: number;
  poppler: string;
};

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function computeBaseline(result: IngestResult, poppler: string): Baseline {
  const body = result.markdown.replace(FRONT_MATTER, "");
  const lines = body.split("\n");

  const headings = lines
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, "").trim());

  const blocks: Record<string, number> = {
    heading: headings.length,
    quote: lines.filter((line) => /^>\s/.test(line)).length,
    list: lines.filter((line) => /^(>\s)?-\s/.test(line)).length,
    paragraph: lines.filter(
      (line) => line.trim() && !/^([#>\-]|%%page|\[\^)/.test(line.trim())
    ).length,
  };

  return {
    markdownSha: createHash("sha256").update(result.markdown).digest("hex"),
    words: body.split(/\s+/).filter(Boolean).length,
    blocks,
    headings,
    footnotes: result.footnotes.length,
    pageMarkers: lines.filter((line) => /^%%page \d+%%$/.test(line.trim())).length,
    poppler,
  };
}

/** Human-readable differences, most structural first. Empty when identical. */
export function diffBaselines(before: Baseline, after: Baseline): string[] {
  const out: string[] = [];

  if (before.poppler !== after.poppler) {
    out.push(
      `poppler ${before.poppler} → ${after.poppler} — tool drift, not a code ` +
        "change; regenerate the before side with the same version before " +
        "reading any diff"
    );
  }

  for (const kind of Object.keys({ ...before.blocks, ...after.blocks })) {
    const a = before.blocks[kind] ?? 0;
    const b = after.blocks[kind] ?? 0;
    if (a !== b) out.push(`${kind}: ${a} → ${b} (${b > a ? "+" : ""}${b - a})`);
  }

  for (const field of ["words", "footnotes", "pageMarkers"] as const) {
    if (before[field] !== after[field]) {
      out.push(`${field}: ${before[field]} → ${after[field]}`);
    }
  }

  const gone = before.headings.filter((h) => !after.headings.includes(h));
  const added = after.headings.filter((h) => !before.headings.includes(h));
  for (const heading of gone.slice(0, 10)) out.push(`heading removed: ${heading}`);
  for (const heading of added.slice(0, 10)) out.push(`heading added:   ${heading}`);
  if (gone.length > 10) out.push(`… and ${gone.length - 10} more headings removed`);
  if (added.length > 10) out.push(`… and ${added.length - 10} more headings added`);

  if (!out.length && before.markdownSha !== after.markdownSha) {
    out.push("text changed, but no structural counts moved — read the diff");
  }

  return out;
}
