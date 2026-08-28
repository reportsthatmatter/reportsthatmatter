import { parse } from "yaml";
import type { Block } from "./paragraphs";

/**
 * A human judgement about this document's text, expressed as data.
 *
 * Corrections are the things the pipeline cannot decide: an OCR repair checked
 * against the scan, a word the extractor mangled beyond any rule's reach.
 * They are applied deterministically as a final pass, so re-running still
 * reproduces the same output and the fidelity checks still see everything.
 *
 * **A correction describes the text. A pass describes how to read the source.**
 * If you are writing a correction to undo something the parser did, you needed
 * a different pass or a bug fix.
 */
export type Correction = {
  id: string;
  /** Narrows the correction to one page. Omit to search the whole document. */
  where?: { volume?: number; printed?: number };
  find: string;
  replace: string;
  reason?: string;
  added?: string;
};

export function parseCorrections(yamlText: string, reportId: string): Correction[] {
  const raw = parse(yamlText) as { corrections?: Correction[] } | null;
  const corrections = raw?.corrections ?? [];

  const seen = new Set<string>();
  for (const correction of corrections) {
    if (!correction?.id) {
      throw new Error(`${reportId}: a correction has no id — errors have to name one`);
    }
    if (seen.has(correction.id)) {
      throw new Error(`${reportId}: duplicate correction id ${correction.id}`);
    }
    seen.add(correction.id);
    if (typeof correction.find !== "string" || !correction.find) {
      throw new Error(`${reportId}: correction ${correction.id} has no find`);
    }
    if (typeof correction.replace !== "string") {
      throw new Error(`${reportId}: correction ${correction.id} has no replace`);
    }
  }
  return corrections;
}

function inScope(block: Block, where: Correction["where"]): boolean {
  if (!where) return true;
  if (where.volume !== undefined && block.at?.volume !== where.volume) return false;
  if (where.printed !== undefined && block.at?.printed !== where.printed) return false;
  return true;
}

/** Every string a block carries that a correction could address. */
function texts(block: Block): string[] {
  if (block.kind === "list") return block.items;
  if (block.kind === "page") return [];
  return [block.text];
}

/**
 * Applies corrections to the parsed blocks.
 *
 * **Every correction must match exactly once.** Zero matches or more than one
 * fails the build, naming the id. A stale correction is a loud error and never
 * a silent skip — that is what keeps the output reproducible while the parser
 * underneath it changes, and what stops a correction from quietly rotting into
 * a lie about what was reviewed.
 */
export function applyCorrections(
  blocks: Block[],
  corrections: Correction[],
  reportId: string
): { blocks: Block[]; applied: number } {
  if (!corrections.length) return { blocks, applied: 0 };

  const out = blocks.map((block) => ({ ...block }) as Block);

  for (const correction of corrections) {
    let matches = 0;
    for (const block of out) {
      if (!inScope(block, correction.where)) continue;
      for (const text of texts(block)) {
        let index = text.indexOf(correction.find);
        while (index !== -1) {
          matches += 1;
          index = text.indexOf(correction.find, index + correction.find.length);
        }
      }
    }

    if (matches !== 1) {
      const scope = correction.where
        ? ` in ${JSON.stringify(correction.where)}`
        : " in the whole document";
      throw new Error(
        `${reportId}: correction ${correction.id} matched ${matches} times${scope}, ` +
          "expected exactly 1.\n" +
          `  find: ${JSON.stringify(correction.find)}\n` +
          (matches === 0
            ? "  The text has changed, or the correction was never right. Re-check it " +
              "against the scan rather than deleting it blind."
            : "  Narrow it with `where: { volume, printed }`, or make `find` longer.")
      );
    }

    for (const block of out) {
      if (!inScope(block, correction.where)) continue;
      if (block.kind === "list") {
        block.items = block.items.map((item) =>
          item.replace(correction.find, correction.replace)
        );
      } else if (block.kind !== "page") {
        block.text = block.text.replace(correction.find, correction.replace);
      }
    }
  }

  return { blocks: out, applied: corrections.length };
}

/** Words a correction introduces, so the lossless check does not call them invented. */
export function correctionVocabulary(corrections: Correction[]): string[] {
  return corrections.flatMap((correction) => correction.replace.split(/\s+/));
}
