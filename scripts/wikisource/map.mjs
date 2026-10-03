/* Map each mirrored Wikisource page to a page of the report's PDF (reportsthatmatter-7d4y).
 *
 *   node scripts/wikisource/map.mjs <report-repo-dir> <pdf>
 *
 * Wikisource's page index (the djvu or PDF page number) need not be our PDF's page number, so the
 * map is measured, not assumed: for each Wikisource page, the share of its 4-word shingles found
 * on each PDF page (pdftotext, one page at a time); the best page wins when it holds at least half
 * of them and beats the runner-up. A page with too little text (blank, a figure, a title) takes the
 * offset of its nearest mapped neighbours when both agree, and is marked "inferred". Writes
 * <repo>/reference/wikisource/pagemap.json: per page the PDF page, the overlap and how it was
 * decided, plus the offsets in use and every disagreement with the constant-offset reading.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanWikitext } from "../../src/lib/score/wikisource.ts";
import { words } from "../../src/lib/score/tokens.ts";

const [repo, pdf] = process.argv.slice(2);
if (!repo || !pdf) {
  console.error("usage: node scripts/wikisource/map.mjs <report-repo-dir> <pdf>");
  process.exit(2);
}
const dir = join(repo, "reference", "wikisource");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const pdfPages = execFileSync("pdftotext", [pdf, "-"], { maxBuffer: 1 << 28 }).toString("utf8").split("\f");
if (pdfPages.at(-1).trim() === "") pdfPages.pop();
const K = 4;
const shingles = (w) => {
  const out = new Set();
  for (let i = 0; i + K <= w.length; i++) out.add(w.slice(i, i + K).join(" "));
  return out;
};
const index = new Map();
pdfPages.forEach((t, i) => {
  for (const s of shingles(words(t))) {
    if (!index.has(s)) index.set(s, new Set());
    index.get(s).add(i + 1);
  }
});

const rows = [];
for (const p of manifest.pages) {
  const page = cleanWikitext(readFileSync(join(dir, p.file), "utf8"));
  const w = words(page.text + " " + page.notes.join(" "));
  const sh = [...shingles(w)];
  const row = { n: p.n, quality: p.quality, printed: page.printed, words: words(page.text).length, pdf: null, overlap: null, method: null };
  if (sh.length >= 10) {
    const hits = new Map();
    for (const s of sh) for (const q of index.get(s) ?? []) hits.set(q, (hits.get(q) ?? 0) + 1);
    const ranked = [...hits].sort((a, b) => b[1] - a[1]);
    const [best, second] = ranked;
    if (best && best[1] / sh.length >= 0.5 && (!second || best[1] > second[1] * 1.5)) Object.assign(row, { pdf: best[0], overlap: +(best[1] / sh.length).toFixed(3), method: "text" });
    else row.method = "unmatched";
  } else row.method = "too-short";
  rows.push(row);
}
// the offset (pdf - n) in force: the mode among matched pages
const offsets = {};
for (const r of rows) if (r.pdf) offsets[r.pdf - r.n] = (offsets[r.pdf - r.n] ?? 0) + 1;
const dominant = Number(Object.entries(offsets).sort((a, b) => b[1] - a[1])[0][0]);
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (r.pdf) continue;
  const prev = rows.slice(0, i).reverse().find((x) => x.pdf);
  const next = rows.slice(i + 1).find((x) => x.pdf);
  const o = prev && next && prev.pdf - prev.n === next.pdf - next.n ? prev.pdf - prev.n : null;
  if (o !== null && r.n + o >= 1 && r.n + o <= pdfPages.length) Object.assign(r, { pdf: r.n + o, method: "inferred (" + r.method + ")" });
}
// our own page labels (%%page N%% in the report's full.md) need not be PDF pages: Chilcot's are the
// summary's printed numbers (PDF page 5 is printed 1). Measure the offset (our label - pdf page).
const ours = new Map();
{
  let label = null;
  for (const block of readFileSync(join(repo, "full.md"), "utf8").split(/\n{2,}/)) {
    const m = /^%%page (\d+)%%$/.exec(block.trim());
    if (m) label = Number(m[1]);
    else if (label !== null) ours.set(label, (ours.get(label) ?? "") + " " + block);
  }
}
const shOurs = new Map([...ours].map(([k, t]) => [k, shingles(words(t))]));
const votes = {};
for (const r of rows) {
  if (r.method !== "text" || r.words < 80) continue;
  const mine = [...shingles(words(cleanWikitext(readFileSync(join(dir, manifest.pages.find((p) => p.n === r.n).file), "utf8")).text))];
  let best = null;
  for (let d = -40; d <= 40; d++) {
    const have = shOurs.get(r.pdf + d);
    if (!have) continue;
    const c = mine.filter((x) => have.has(x)).length / mine.length;
    if (c >= 0.4 && (!best || c > best[1])) best = [d, c];
  }
  if (best) votes[best[0]] = (votes[best[0]] ?? 0) + 1;
}
const labelOffset = Number(Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]);
for (const r of rows) r.ours = r.pdf && r.pdf + labelOffset >= 1 ? r.pdf + labelOffset : null;
const off = rows.filter((r) => r.method === "text" && r.pdf - r.n !== dominant);
const out = {
  report: manifest.report,
  pdf: pdf.split("/").slice(-1)[0],
  pdf_pages: pdfPages.length,
  method: "4-word shingle overlap with pdftotext per page; match needs >= 50% of the Wikisource page's shingles and 1.5x the runner-up",
  offsets: offsets,
  our_label_offset: labelOffset,
  our_label_offset_votes: votes,
  our_label_note: "our %%page N%% label = PDF page + our_label_offset in the report's full.md at the time of mapping",
  dominant_offset: dominant,
  matched_by_text: rows.filter((r) => r.method === "text").length,
  inferred: rows.filter((r) => r.method.startsWith("inferred")).length,
  unmapped: rows.filter((r) => !r.pdf).map((r) => ({ n: r.n, method: r.method })),
  off_dominant: off.map((r) => ({ n: r.n, pdf: r.pdf, overlap: r.overlap })),
  pages: rows,
};
writeFileSync(join(dir, "pagemap.json"), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify({ offsets, dominant, text: out.matched_by_text, inferred: out.inferred, unmapped: out.unmapped.length, off_dominant: off.length }));

// the manifest pins the map (SHA-256) and credits the volunteers whose proofreading is the reference (CC BY-SA attribution)
const users = new Map();
for (const p of manifest.pages) {
  const u = /<pagequality[^>]*\buser="([^"]*)"/.exec(readFileSync(join(dir, p.file), "utf8"))?.[1];
  p.last_proofreader = u ?? null;
  if (u) users.set(u, (users.get(u) ?? 0) + 1);
}
manifest.contributors = Object.fromEntries([...users].sort((a, b) => b[1] - a[1]));
manifest.contributors_note = "User named by the page's proofreading status (the editor who last set it) for each page; the full author list is each page's history on Wikisource.";
manifest.pagemap = { path: "reference/wikisource/pagemap.json", sha256: createHash("sha256").update(readFileSync(join(dir, "pagemap.json"))).digest("hex") };
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
