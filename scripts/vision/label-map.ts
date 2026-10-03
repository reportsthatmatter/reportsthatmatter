/**
 * Which `%%page N%%` label of full.md does each checked PDF page carry? (docs/scoring.md names a page reference
 * by that label; the label is the PDF page in some reports and the printed number in others.)
 *
 *   pnpm exec tsx scripts/vision/label-map.ts <report-repo> <pdf page>[,<pdf page>...]  (reads reference/page-text/<pdf>.txt)
 *
 * Aligns the checked page's words to full.md's and prints the label of the page marker in force at the first
 * aligned word (and at the last, which differs when the page's text spills over a marker).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { align } from "../../src/lib/score/align";
import { flatten, parsePageText } from "../../src/lib/vision/compare";
import { tokens } from "../../src/lib/score/tokens";

const repo = resolve(process.argv[2]);
const dir = process.argv[4] ? resolve(process.argv[4]) : join(repo, "reference", "page-text");
const md = readFileSync(join(repo, "full.md"), "utf8");
const O: string[] = [];
const labelAt: string[] = [];
let label = "";
for (const chunk of md.split(/\n\s*\n/)) {
  const t = chunk.trim();
  const m = /^%%page ([^%\s]+)%%$/.exec(t);
  if (m) {
    label = m[1];
    continue;
  }
  if (!t || /^\[\^[^\]\s]+\]:/.test(t)) continue;
  for (const w of tokens(t.replace(/\[\^[^\]]*\]/g, "")))
    {
      O.push(w.word);
      labelAt.push(label);
    }
}
for (const p of process.argv[3].split(",")) {
  const ref = parsePageText(readFileSync(join(dir, `${p}.txt`), "utf8"));
  const G = flatten(ref).words;
  const al = align(G, O);
  const hits = [...al.map].filter((x) => x >= 0);
  console.log(`pdf ${p}: label ${labelAt[hits[0]]} (last aligned word under ${labelAt[hits[hits.length - 1]]}; ${hits.length}/${G.length} words aligned)`);
}
