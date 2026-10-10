/**
 * Compare four texts against the hand-checked pages in <report-repo>/reference/page-text/
 * (reportsthatmatter-kyj3): the PDF's text layer, our served text (full.md), the vision model's raw
 * output, and the verified output (the model's structure kept only where its words agree with the layer).
 *
 *   pnpm exec tsx scripts/vision/compare.ts <report-repo> [--ref <dir>] [--out <file.md>] [--backend mlx|cpu] [--only 10,13,19]
 *
 * <ref>/<label>.txt is the page body, <label>.notes.txt its notes; <ref>/manifest.json gives each label's PDF page and
 * stratum (golden: a page golden.yaml already describes, so the pipeline was tuned on it; random: drawn with a seeded shuffle). RTM_REPORT_DIRS as in `pnpm score` reads full.md from another checkout.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { overrideDir } from "../lib/report-dirs";
import { openLayer } from "./layer";
import { comparePage, layerDoc, oursDoc, parsePageText, prf, tally, verifiedDoc, visionDoc, type PageMetrics } from "../../src/lib/vision/compare";
import { parseDoctags } from "../../src/lib/vision/doctags";
import { verifyWithLayout } from "../../src/lib/vision/verify";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const repo = resolve(args[0]);
const refDir = resolve(flag("ref", join(repo, "reference", "page-text"))!);
const backend = flag("backend", "mlx")!;
const pdf = join(repo, "archive", readdirSync(join(repo, "archive")).filter((f) => f.endsWith(".pdf")).sort()[0]);
const digest = createHash("sha256").update(readFileSync(pdf)).digest("hex");
const cdir = join(process.env.RTM_VISION_CACHE ?? join(repo, ".cache", "vision"), digest, backend);
// RTM_REPORT_DIRS (or the older RTM_REPO_ROOT): read full.md from a worktree of the same repo, as `pnpm score` does.
const overrideRoot = overrideDir();
const fullMd = readFileSync(join(overrideRoot && existsSync(join(overrideRoot, basename(repo))) ? join(overrideRoot, basename(repo)) : repo, "full.md"), "utf8");
type PageEntry = { pdf: number; label?: string; stratum: "golden" | "random"; table?: boolean; exhibit?: boolean };
const manifest = existsSync(join(refDir, "manifest.json")) ? (JSON.parse(readFileSync(join(refDir, "manifest.json"), "utf8")) as { pages: Record<string, PageEntry> }) : { pages: {} as Record<string, PageEntry> };
const pagesJson: Record<string, number> = Object.fromEntries(Object.entries(manifest.pages).map(([k, v]) => [k, v.pdf]));

const layer = openLayer(repo);

const SOURCES = ["layer", "ours", "vision raw", "verified", "verified (lenient)"] as const;
type Src = (typeof SOURCES)[number];
const only = flag("only") ? new Set(flag("only")!.split(",").map(Number)) : null;
const labels = readdirSync(refDir).filter((f) => /^\d+\.txt$/.test(f)).map((f) => Number(f.slice(0, -4))).filter((n) => !only || only.has(n)).sort((a, b) => a - b);
const rows: Record<Src, PageMetrics[]> = { layer: [], ours: [], "vision raw": [], verified: [], "verified (lenient)": [] };
const words: Record<Src, PageMetrics[]> = { layer: [], ours: [], "vision raw": [], verified: [], "verified (lenient)": [] };
const perPage: string[] = [];
const tallies: ReturnType<typeof tally>[] = [];
const exhibitTallies: ReturnType<typeof tally>[] = [];
const stat: string[] = [];
for (const label of labels) {
  const pdfPage = pagesJson[String(label)] ?? label;
  const ref = parsePageText(readFileSync(join(refDir, `${label}.txt`), "utf8"), existsSync(join(refDir, `${label}.notes.txt`)) ? readFileSync(join(refDir, `${label}.notes.txt`), "utf8") : "");
  const raw = parseDoctags(readFileSync(join(cdir, `p${String(pdfPage).padStart(4, "0")}.doctags`), "utf8"));
  const lines = layer.lines(pdfPage);
  const strict = verifyWithLayout(raw, lines);
  const len = verifyWithLayout(raw, lines, { minAgreement: 0.75, maxRun: 8 });
  const docs: Record<Src, ReturnType<typeof layerDoc>> = {
    layer: layerDoc(layer.rawLines(pdfPage).map((l) => l.text).join("\n")),
    ours: oursDoc(fullMd, ref, manifest.pages[String(label)]?.label),
    "vision raw": visionDoc(raw),
    verified: verifiedDoc(strict, strict.layerText),
    "verified (lenient)": verifiedDoc(len, len.layerText),
  };
  const entry = manifest.pages[String(label)];
  if (entry?.exhibit) exhibitTallies.push(tally(ref, docs["layer"], docs["vision raw"]));
  else if (!entry?.table) tallies.push(tally(ref, docs["layer"], docs["vision raw"]));
  const cells: string[] = [];
  for (const s of SOURCES) {
    const m = comparePage(ref, docs[s], { structure: s !== "layer", combined: s === "layer" });
    rows[s].push(m);
    const w = comparePage(ref, docs[s], { combined: true });
    words[s].push(w);
    cells.push(`${((w.errors / w.refWords) * 100).toFixed(1)}%`);
  }
  perPage.push(`| ${label}${pdfPage !== label ? ` (pdf ${pdfPage})` : ""} | ${rows.layer[rows.layer.length - 1].refWords} | ${cells.join(" | ")} | ${strict.status} (${strict.blocks.filter((b) => b.accepted).length}/${strict.blocks.length}) |`);
  stat.push(`${label}: strict ${strict.status}, ${strict.flags.length} flags`);
}
const pct = (x: number) => (Number.isNaN(x) ? "n/a" : (x * 100).toFixed(1) + "%");
const sum = (ms: PageMetrics[], k: "boundaries" | "headings" | "notes" | "markers"): [number, number, number] => ms.reduce((a, m) => [a[0] + m[k][0], a[1] + m[k][1], a[2] + m[k][2]] as [number, number, number], [0, 0, 0]);
const out: string[] = [];
out.push(`# Vision structure comparison: ${repo.split("/").pop()}`, "", `${labels.length} hand-checked pages (${labels.join(", ")}), model output backend ${backend}.`, "");
const table = (title: string, pick: (i: number) => boolean) => {
  out.push(`## ${title}`, "", "| source | words: WER, notes and body as one stream | WER without inserted bare numbers | WER with notes scored apart from body | block starts P / R / F1 | heading P / R | note blocks P / R | markers P / R |", "|---|---:|---:|---:|---|---|---|---|");
  for (const s of SOURCES) {
    const ms = rows[s].filter((_, i) => pick(i));
    const wm = words[s].filter((_, i) => pick(i));
    if (!ms.length) continue;
    const ref = ms.reduce((a, m) => a + m.refWords, 0);
    const err = ms.reduce((a, m) => a + m.errors, 0);
    const wErr = wm.reduce((a, m) => a + m.errors, 0);
    const wErrN = wm.reduce((a, m) => a + m.errorsNoNum, 0);
    const wRef = wm.reduce((a, m) => a + m.refWords, 0);
    if (s === "layer") {
      out.push(`| ${s} | ${pct(wErr / wRef)} | ${pct(wErrN / wRef)} | n/a | n/a | n/a | n/a | n/a |`);
      continue;
    }
    const b = prf(sum(ms, "boundaries"));
    const h = prf(sum(ms, "headings"));
    const n = prf(sum(ms, "notes"));
    const k = prf(sum(ms, "markers"));
    out.push(`| ${s} | ${pct(wErr / wRef)} | ${pct(wErrN / wRef)} | ${pct(err / ref)} | ${pct(b.p)} / ${pct(b.r)} / ${pct(b.f1)} | ${pct(h.p)} / ${pct(h.r)} | ${pct(n.p)} / ${pct(n.r)} | ${pct(k.p)} / ${pct(k.r)} |`);
  }
  out.push("");
};
const strata = labels.map((l) => manifest.pages[String(l)]?.stratum ?? "golden");
const isTable = labels.map((l) => manifest.pages[String(l)]?.table === true);
table(`All ${labels.length} pages`, () => true);
const isExhibit = labels.map((l) => manifest.pages[String(l)]?.exhibit === true);
if (isExhibit.some(Boolean)) table(`Without the ${isExhibit.filter(Boolean).length} exhibit scan(s) (a typed form or memo reproduced from a photocopy: the text layer is garbage there)`, (i) => !isExhibit[i] && !isTable[i]);
if (isTable.some(Boolean)) table(`Without the ${isTable.filter(Boolean).length} table page(s): the model's tables come out empty, which the verifier flags (see the per-page table)`, (i) => !isTable[i]);
if (strata.includes("random")) {
  table(`Random pages only (${strata.filter((x) => x === "random").length}): the pipeline was not tuned on these`, (i) => strata[i] === "random");
  table(`Golden pages only (${strata.filter((x) => x === "golden").length}): the pipeline was tuned on these`, (i) => strata[i] === "golden");
}
const tallyTable = (title: string, ts: ReturnType<typeof tally>[]) => {
  if (!ts.length) return;
  const T = ts.reduce((a, t) => ({ bothRight: a.bothRight + t.bothRight, layerOnly: a.layerOnly + t.layerOnly, modelOnly: a.modelOnly + t.modelOnly, bothWrong: a.bothWrong + t.bothWrong }), { bothRight: 0, layerOnly: 0, modelOnly: 0, bothWrong: 0 });
  const allW = T.bothRight + T.layerOnly + T.modelOnly + T.bothWrong;
  out.push(title, "", "| both right | only the text layer | only the model | neither |", "|---:|---:|---:|---:|", `| ${T.bothRight} (${pct(T.bothRight / allW)}) | ${T.layerOnly} (${pct(T.layerOnly / allW)}) | ${T.modelOnly} (${pct(T.modelOnly / allW)}) | ${T.bothWrong} (${pct(T.bothWrong / allW)}) |`, "");
};
tallyTable("Who reads each checked word right (text layer as extracted, model raw; body and notes together; table and exhibit pages left out):", tallies);
tallyTable("The same on the exhibit scans alone (text layer and model, as extracted):", exhibitTallies);
out.push("Per page word error rate (body and notes as one stream):", "", `| page | reference words | ${SOURCES.join(" | ")} | verifier (strict): blocks accepted |`, `|---|---:|${SOURCES.map(() => "---:").join("|")}|---|`, ...perPage, "");
const o = flag("out");
if (o) writeFileSync(o, out.join("\n"));
console.log(out.join("\n"));
