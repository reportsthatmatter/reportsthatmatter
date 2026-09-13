/* Rebuilds every candidate mark from the report PDFs, per the recipe in
 * docs/design/2026-09-12-imagery/sources.yaml. How to add or change a plate,
 * end to end: docs/plates.md.
 *
 *   pnpm marks                 # all of them
 *   pnpm marks columbia        # one report's
 *
 * The study candidates it writes are not committed — the recipe is. The
 * shipped plates are: assets/marks/<report-id>.webp and -row.webp, plus the
 * size manifest src/generated/marks.ts, because a deploy has no report PDFs
 * to rebuild them from. A mark is a pure function of (source, crop,
 * treatment), and the treatment's noise is seeded, so two runs on the same
 * machine are byte-identical. Needs pdftoppm and cwebp (Homebrew poppler, webp).
 *
 * Two source kinds: `pdf`+`page` rasterises a page from that report's own
 * repo (cloned as a sibling directory — missing ones are reported and
 * skipped, not fatal); `external` fetches a URL instead, for the two reports
 * with no usable imagery in their own PDF (see sources.yaml's comment on
 * each). Fetches are cached in the OS temp dir by URL hash, so a rebuild
 * doesn't refetch, but never silently goes stale either — delete the cache
 * dir to force a refetch.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..", "..");
const siblings = resolve(root, "..");
const spec = parse(readFileSync(join(root, "docs/design/2026-09-12-imagery/sources.yaml"), "utf8"));
const outDir = join(root, "docs/design/2026-09-12-imagery/candidates");
const only = process.argv.slice(2);

// Shipped plates are committed, the way share cards are: a deploy has none of
// the report PDFs to rebuild them from. Named by registry id, which is not
// always the report repo's directory name (jack-smith-vol1 lives in
// ../jack-smith-report), so reports/manifest.yaml maps one to the other.
const shipDir = join(root, "assets/marks");
const ROW_WIDTH = 276; // 3x the archive row's 92px slot
const siteIds = new Map(
  parse(readFileSync(join(root, "reports/manifest.yaml"), "utf8")).reports
    .map((r) => [r.dir.replace(/^\.\.\//, ""), r.id])
);

mkdirSync(outDir, { recursive: true });
mkdirSync(shipDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "rtm-marks-"));
const cacheDir = join(tmpdir(), "rtm-marks-fetch-cache");
mkdirSync(cacheDir, { recursive: true });
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

function fetchExternal(url) {
  const ext = extname(new URL(url).pathname) || ".jpg";
  const cached = join(cacheDir, `${createHash("sha256").update(url).digest("hex")}${ext}`);
  if (!existsSync(cached)) {
    run("curl", ["-sL", "-A", "Mozilla/5.0 (research; reportsthatmatter.org)", "-o", cached, url]);
  }
  return cached;
}

let built = 0;
const skipped = [];

for (const m of spec.marks) {
  // String(): YAML reads `id: 911` as a number, and argv is always strings,
  // so `pnpm marks 911` used to skip it silently.
  if (only.length && !only.includes(String(m.id))) continue;

  let source;
  if (m.external) {
    try {
      source = fetchExternal(m.external);
    } catch (e) {
      skipped.push(`${m.set}-${m.id}: fetch failed for ${m.external} — ${e.message}`);
      continue;
    }
  } else {
    const pdf = join(siblings, m.report, m.pdf);
    if (!existsSync(pdf)) {
      skipped.push(`${m.set}-${m.id}: no ${m.report}/${m.pdf} — clone that report's repo as a sibling`);
      continue;
    }
    // pdftoppm names its output <prefix>-<zero-padded page>.png, and the
    // padding width follows the document's page count, so glob rather than guess.
    const prefix = join(tmp, `${m.set}-${m.id}`);
    run("pdftoppm", ["-png", "-r", String(m.dpi), "-f", String(m.page), "-l", String(m.page), pdf, prefix]);
    const page = readdirSync(tmp).find((f) => f.startsWith(`${m.set}-${m.id}-`) && f.endsWith(".png"));
    if (!page) { skipped.push(`${m.set}-${m.id}: pdftoppm produced nothing for page ${m.page}`); continue; }
    source = join(tmp, page);
  }

  const cropped = join(tmp, `${m.set}-${m.id}-crop.png`);
  run("node", [join(root, "scripts/imagery/crop.mjs"), source, cropped, ...m.crop.map(String)]);

  const args = [join(root, "scripts/imagery/treat.mjs"), cropped, join(outDir, `${m.set}-${m.id}.png`)];
  for (const [k, v] of Object.entries({ ...spec.defaults, ...m.treat })) {
    if (v === true) args.push(`--${k}`);
    else if (v !== false) args.push(`--${k}`, String(v));
  }
  run("node", args);

  // A plate also ships. Twice, not once resized: the grain is fixed to output
  // pixels, so the archive row's copy is treated at its own 3x (276px for a
  // 92px slot) rather than downsampled from the 660px one, which would average
  // the tooth away. Lossless WebP — lossy smears exactly the grain that is the
  // point, and lossless is still about half the PNG.
  if (m.set === "plate") {
    const siteId = siteIds.get(m.report);
    if (!siteId) {
      skipped.push(`${m.set}-${m.id}: no reports/manifest.yaml entry with dir ../${m.report}`);
      continue;
    }
    const rowPng = join(tmp, `${m.set}-${m.id}-row.png`);
    run("node", [...args.slice(0, 2), rowPng, ...args.slice(3).map((a, i, all) =>
      all[i - 1] === "--width" ? String(ROW_WIDTH) : a)]);
    run("cwebp", ["-quiet", "-lossless", "-z", "9", join(outDir, `${m.set}-${m.id}.png`), "-o", join(shipDir, `${siteId}.webp`)]);
    run("cwebp", ["-quiet", "-lossless", "-z", "9", rowPng, "-o", join(shipDir, `${siteId}-row.webp`)]);
  }

  console.log(`${m.set}-${m.id}  ←  ${m.external ?? `${m.report} p.${m.page}`}`);
  built++;
}

// The manifest is read back off what is on disk in assets/marks/, not off this
// run, so `pnpm marks <one>` rewrites it without dropping the other nine.
const marks = {};
for (const f of readdirSync(shipDir).filter((f) => /^[^.]+(?<!-row)\.webp$/.test(f)).sort()) {
  marks[f.replace(/\.webp$/, "")] = webpSize(join(shipDir, f));
}
writeFileSync(join(root, "src/generated/marks.ts"), `/* Generated by scripts/imagery/build.mjs — do not edit. Pixel size of each
 * report's plate in assets/marks/<id>.webp; <id>-row.webp is the same plate
 * treated at ${ROW_WIDTH}px on its long edge, for the archive row. */
export const MARKS: Readonly<Record<string, { width: number; height: number }>> = ${JSON.stringify(marks, null, 2)};
`);

if (skipped.length) {
  console.log(`\n${skipped.length} skipped:`);
  for (const s of skipped) console.log(`  ${s}`);
}
console.log(`\n${built} built into docs/design/2026-09-12-imagery/candidates/`);
console.log(`${Object.keys(marks).length} plate(s) in assets/marks/; manifest written to src/generated/marks.ts`);

/** Reads a lossless (VP8L) WebP's dimensions from its header. */
function webpSize(path) {
  const b = readFileSync(path);
  if (b.toString("ascii", 12, 16) !== "VP8L") throw new Error(`${path}: not a lossless WebP`);
  const bits = b.readUInt32LE(21);
  return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
}
