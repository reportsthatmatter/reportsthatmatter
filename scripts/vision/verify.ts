/**
 * Verify cached vision output against the PDF's text layer, page by page (reportsthatmatter-kyj3).
 *
 *   pnpm exec tsx scripts/vision/verify.ts <report-repo> [--pages 1-30] [--backend mlx|cpu] [--lenient] [--out dir]
 *
 * Reads <report-repo>/.cache/vision/<sha256>/<backend>/pNNNN.doctags (or $RTM_VISION_CACHE), the PDF
 * text layer by pdftotext, and writes <out>/verification.{md,json} (default <report-repo>/reference/vision/, committed) and
 * the per-page verified/pNNNN.{json,md} (default in the cache beside the model output, or <out>/verified with --out). Accepted blocks carry the layer's words and the model's structure.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDoctags } from "../../src/lib/vision/doctags";
import { renderVerified, verifyWithLayout } from "../../src/lib/vision/verify";
import { openLayer } from "./layer";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const repo = resolve(args[0]);
const backend = flag("backend", "mlx")!;
const pdf = join(repo, readdirSync(join(repo, "archive")).filter((f) => f.endsWith(".pdf")).sort()[0] ? "archive/" + readdirSync(join(repo, "archive")).filter((f) => f.endsWith(".pdf")).sort()[0] : "");
const digest = createHash("sha256").update(readFileSync(pdf)).digest("hex");
const cdir = join(process.env.RTM_VISION_CACHE ?? join(repo, ".cache", "vision"), digest, backend);
const out = resolve(flag("out", join(repo, "reference", "vision"))!);
// the summary (verification.md, verification.json) is committed beside the manifest; the per-page output is regenerable, so by default it stays in the cache
const verifiedDir = flag("out") ? join(out, "verified") : join(process.env.RTM_VISION_CACHE ?? join(repo, ".cache", "vision"), digest, `verified-${backend}${args.includes("--lenient") ? "-lenient" : ""}`);
mkdirSync(out, { recursive: true });
mkdirSync(verifiedDir, { recursive: true });

const spec = flag("pages");
const wanted = spec ? new Set(spec.split(",").flatMap((p) => { const [a, b] = p.split("-").map(Number); return Array.from({ length: (b ?? a) - a + 1 }, (_, k) => a + k); })) : null;
const pages = readdirSync(cdir).filter((f) => /^p\d{4}\.doctags$/.test(f)).map((f) => Number(f.slice(1, 5))).filter((p) => !wanted || wanted.has(p)).sort((a, b) => a - b);

const layer = openLayer(repo);
console.log(`body size ${layer.bodySize} (sizes: ${layer.sizes})`);
const rows: string[] = [];
const summary: Record<string, number> = { accepted: 0, partial: 0, flagged: 0 };
const stats: unknown[] = [];
for (const p of pages) {
  const blocks = parseDoctags(readFileSync(join(cdir, `p${String(p).padStart(4, "0")}.doctags`), "utf8"));
  const { layerText, ...v } = verifyWithLayout(blocks, layer.lines(p), args.includes("--lenient") ? { minAgreement: 0.75, maxRun: 8 } : {});
  summary[v.status]++;
  const base = join(verifiedDir, `p${String(p).padStart(4, "0")}`);
  writeFileSync(base + ".json", JSON.stringify({ page: p, ...v }, null, 1) + "\n");
  writeFileSync(base + ".md", renderVerified(v, layerText));
  stats.push({ page: p, status: v.status, layerWords: v.layerWords, visionWords: v.visionWords, coverage: v.coverage, blocks: v.blocks.length, rejected: v.blocks.filter((b) => !b.accepted).length, missing: v.missing.length });
  rows.push(`| ${p} | ${v.status} | ${v.layerWords} | ${v.visionWords} | ${(v.coverage * 100).toFixed(1)}% | ${v.blocks.length} | ${v.blocks.filter((b) => !b.accepted).length} | ${v.flags.slice(0, 2).join(" ; ").replace(/\|/g, "/")} |`);
}
const md = [`# Vision output against the text layer`, "", `${basename(pdf)} (${digest.slice(0, 12)}), backend ${backend}, ${pages.length} pages: ${summary.accepted} accepted, ${summary.partial} partial, ${summary.flagged} flagged.`, "", "| page | status | layer words | model words | coverage | blocks | rejected | first flags |", "|---:|---|---:|---:|---:|---:|---:|---|", ...rows, ""].join("\n");
function basename(s: string) { return s.split("/").pop(); }
writeFileSync(join(out, "verification.md"), md);
writeFileSync(join(out, "verification.json"), JSON.stringify({ pdf_sha256: digest, backend, summary, pages: stats }, null, 1) + "\n");
console.log(`${pages.length} pages: ${summary.accepted} accepted, ${summary.partial} partial, ${summary.flagged} flagged → ${out}`);
