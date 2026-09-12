/* Rebuilds every candidate mark from the report PDFs, per the recipe in
 * docs/design/2026-09-12-imagery/sources.yaml.
 *
 *   pnpm marks                 # all of them
 *   pnpm marks columbia        # one report's
 *
 * Output is not committed — the recipe is. A mark is a pure function of
 * (PDF, page, dpi, crop, treatment), and the treatment's noise is seeded, so
 * two runs on the same machine are byte-identical.
 *
 * Needs each report's own repo cloned as a sibling directory; the PDFs live
 * there, not here. Missing ones are reported and skipped, not fatal.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..", "..");
const siblings = resolve(root, "..");
const spec = parse(readFileSync(join(root, "docs/design/2026-09-12-imagery/sources.yaml"), "utf8"));
const outDir = join(root, "docs/design/2026-09-12-imagery/candidates");
const only = process.argv.slice(2);

mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "rtm-marks-"));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

let built = 0;
const skipped = [];

for (const m of spec.marks) {
  if (only.length && !only.includes(m.id)) continue;
  const pdf = join(siblings, m.report, m.pdf);
  if (!existsSync(pdf)) {
    skipped.push(`${m.set}-${m.id}: no ${m.report}/${m.pdf} — clone that report's repo as a sibling`);
    continue;
  }

  // pdftoppm names its output <prefix>-<zero-padded page>.png, and the padding
  // width follows the document's page count, so glob rather than guess.
  const prefix = join(tmp, `${m.set}-${m.id}`);
  run("pdftoppm", ["-png", "-r", String(m.dpi), "-f", String(m.page), "-l", String(m.page), pdf, prefix]);
  const page = readdirSync(tmp).find((f) => f.startsWith(`${m.set}-${m.id}-`) && f.endsWith(".png"));
  if (!page) { skipped.push(`${m.set}-${m.id}: pdftoppm produced nothing for page ${m.page}`); continue; }

  const cropped = join(tmp, `${m.set}-${m.id}-crop.png`);
  run("node", [join(root, "scripts/imagery/crop.mjs"), join(tmp, page), cropped, ...m.crop.map(String)]);

  const args = [join(root, "scripts/imagery/treat.mjs"), cropped, join(outDir, `${m.set}-${m.id}.png`)];
  for (const [k, v] of Object.entries({ ...spec.defaults, ...m.treat })) {
    if (v === true) args.push(`--${k}`);
    else if (v !== false) args.push(`--${k}`, String(v));
  }
  run("node", args);
  console.log(`${m.set}-${m.id}  ←  ${m.report} p.${m.page}`);
  built++;
}

if (skipped.length) {
  console.log(`\n${skipped.length} skipped:`);
  for (const s of skipped) console.log(`  ${s}`);
}
console.log(`\n${built} built into docs/design/2026-09-12-imagery/candidates/`);
