/**
 * Verified vision structure against the report's golden pages and the layout oracle (reportsthatmatter-kyj3).
 *
 *   pnpm exec tsx scripts/vision/structure-check.ts <report-repo> [--backend mlx|cpu] [--lenient]
 *
 * Builds the pipeline's `Block[]` and notes from the verified pages (accepted blocks with the model's
 * structure, the layer's words), joins a page's first block to the page before's last when that one
 * stops without terminal punctuation (the model sees one page at a time; this is the simplest join rule,
 * not the pipeline's `layoutPageJoins`), then runs `checkGoldenPage` on every golden.yaml entry and
 * `measureLayout` over the whole report. Reads the pipeline's own numbers from `.cache/oracle.json`
 * (written by `pnpm ingest verify`) and prints both. Measure-only.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkGoldenPage, measureLayout, openLayout, parseGolden, type Block, type Footnote } from "@rtm/ingest";
import { openLayer } from "./layer";
import { verifiedDoc } from "../../src/lib/vision/compare";
import { parseDoctags } from "../../src/lib/vision/doctags";
import { verifyWithLayout } from "../../src/lib/vision/verify";

const args = process.argv.slice(2);
const repo = resolve(args[0]);
const backend = args.includes("--backend") ? args[args.indexOf("--backend") + 1] : "mlx";
const lenient = args.includes("--lenient");
const pdf = join(repo, "archive", readdirSync(join(repo, "archive")).filter((f) => f.endsWith(".pdf")).sort()[0]);
const digest = createHash("sha256").update(readFileSync(pdf)).digest("hex");
const cdir = join(process.env.RTM_VISION_CACHE ?? join(repo, ".cache", "vision"), digest, backend);
const pages = readdirSync(cdir).filter((f) => /^p\d{4}\.doctags$/.test(f)).map((f) => Number(f.slice(1, 5))).sort((a, b) => a - b);

const layer = openLayer(repo);

const blocks: Block[] = [];
const footnotes: Footnote[] = [];
let last: { block: Extract<Block, { kind: "paragraph" }> } | null = null;
for (const p of pages) {
  const raw = parseDoctags(readFileSync(join(cdir, `p${String(p).padStart(4, "0")}.doctags`), "utf8"));
  const v = verifyWithLayout(raw, layer.lines(p), lenient ? { minAgreement: 0.75, maxRun: 8 } : {});
  const doc = verifiedDoc(v, v.layerText);
  const at = { volume: 1, pdfIndex: p, printed: null };
  let first = true;
  for (const b of doc.blocks) {
    if (b.kind === "note") {
      if (b.label) footnotes.push({ number: Number(b.label), text: b.text, page: p, volume: 1, pdfIndex: p });
      continue;
    }
    const text = b.markers.length ? [...b.markers].sort((x, y) => y.offset - x.offset).reduce((t, m) => t.slice(0, m.offset) + `[^${m.label}]` + t.slice(m.offset), b.text) : b.text;
    if (b.kind === "paragraph" && first && last && !/[.?!"”')\]]\s*(\[\^[^\]]+\])*$/.test(last.block.text)) {
      last.block.text += " " + text; // runs on from the page before
      first = false;
      continue;
    }
    first = false;
    if (b.kind === "heading") {
      blocks.push({ kind: "heading", level: 2, text, at });
      last = null;
    } else {
      // a list item is a paragraph here: the golden entries (and the pipeline's `numberedFindings`) make each numbered finding its own block
      const blk: Extract<Block, { kind: "paragraph" }> & { at: typeof at } = { kind: "paragraph", text, at };
      blocks.push(blk);
      last = { block: blk };
    }
  }
}

console.log(`${pages.length} pages of verified vision output (${lenient ? "lenient" : "strict"}) → ${blocks.length} blocks, ${footnotes.length} notes`);
const gpath = join(repo, "golden.yaml");
if (existsSync(gpath)) {
  const golden = parseGolden(readFileSync(gpath, "utf8"));
  let pass = 0;
  const byKind: Record<string, number> = {};
  for (const g of golden.pages) {
    if (!pages.includes(g.pdf)) continue;
    const r = checkGoldenPage(g, blocks, footnotes, { relink: false });
    if (r.problems.length === 0) pass++;
    for (const k of r.failing) byKind[k] = (byKind[k] ?? 0) + 1;
    console.log(`  golden p${g.pdf}${g.xfail ? ` (pipeline xfail ${g.xfail}: ${g.xfail_only?.join(",") ?? "any"})` : ""}: ${r.problems.length === 0 ? "passes" : r.problems.slice(0, 3).join(" ; ").slice(0, 330)}`);
  }
  console.log(`golden pages: ${pass}/${golden.pages.length} pass on vision structure; failing assertion kinds: ${JSON.stringify(byKind)}`);
}
const layout = openLayout([pdf], join(repo, ".cache"));
const rep = measureLayout(layout, blocks, footnotes);
// the pipeline's own oracle counts: `pnpm ingest verify <id>` writes <report checkout>/.cache/oracle.json (--ours to point at another)
const oursPath = args.includes("--ours") ? args[args.indexOf("--ours") + 1] : join(repo, ".cache", "oracle.json");
const ours = existsSync(oursPath) ? JSON.parse(readFileSync(oursPath, "utf8")) : null;
console.log("\nlayout oracle (counts over the whole report; the oracle's own false positives apply to both columns):");
console.log("| signal | pipeline (ours) | verified vision |\n|---|---:|---:|");
for (const [k, v] of Object.entries(rep.counts)) console.log(`| ${k} | ${ours?.counts?.[k] ?? "?"} | ${v} |`);
console.log(`| expected / produced headings | ${ours?.expected?.headings ?? "?"} / ${ours?.produced?.headings ?? "?"} | ${rep.expected.headings} / ${rep.produced.headings} |`);
console.log(`| expected / produced markers | ${ours?.expected?.markers ?? "?"} / ${ours?.produced?.markers ?? "?"} | ${rep.expected.markers} / ${rep.produced.markers} |`);
console.log(`| expected / produced paragraph starts | ${ours?.expected?.paragraphStarts ?? "?"} / ${ours?.produced?.paragraphStarts ?? "?"} | ${rep.expected.paragraphStarts} / ${rep.produced.paragraphStarts} |`);
