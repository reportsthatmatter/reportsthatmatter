/**
 * `pnpm ingest folios` (reportsthatmatter-vwqr): what the ingest read as each PDF page's printed number, and which
 * pages changed source (vision or pipeline) or folio read between two ingests, for `pnpm ingest try`.
 *
 * The run and stray rule is not here: it is `strayFolios` in @rtm/ingest (the rule `foliosInStep` applies), and
 * `folioReport` there computes the report this file formats and compares. The types are repeated structurally so
 * this loads against a pinned ingest that predates `folioReport`.
 */
export type FolioPage = {
  volume: number;
  pdfIndex: number;
  printed: number | null;
  stray?: { printed: number; dropped: boolean };
  inferred?: number;
  source: "pipeline" | "vision" | "html";
  offset: number | null;
};
export type FolioRun = { volume: number; fromPdf: number; toPdf: number; reads: number; offset: number; firstPrinted: number; lastPrinted: number };
export type FolioReport = { pages: FolioPage[]; runs: FolioRun[]; unread: number; inferred: number; strays: number };

const at = (p: { volume: number; pdfIndex: number }, volumes: number) => (volumes > 1 ? `vol ${p.volume} p.${p.pdfIndex}` : `p.${p.pdfIndex}`);
const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Pages as `from-to` ranges of consecutive PDF pages, so 40 flipped pages are not 40 lines. */
function ranges<T extends { volume: number; pdfIndex: number }>(items: T[], same: (a: T, b: T) => boolean): T[][] {
  const out: T[][] = [];
  for (const item of items) {
    const group = out[out.length - 1];
    const last = group?.[group.length - 1];
    if (group && last.volume === item.volume && last.pdfIndex + 1 === item.pdfIndex && same(last, item)) group.push(item);
    else out.push([item]);
  }
  return out;
}

const span = (g: Array<{ volume: number; pdfIndex: number }>, volumes: number) => (g.length === 1 ? at(g[0], volumes) : `${at(g[0], volumes)}-${g[g.length - 1].pdfIndex}`);

export type FolioRowsFilter = "all" | { from: number; to: number };

export function parsePagesArg(value: string): FolioRowsFilter | undefined {
  if (value === "all") return "all";
  const m = /^(\d+)(?:-(\d+))?$/.exec(value);
  return m ? { from: Number(m[1]), to: Number(m[2] ?? m[1]) } : undefined;
}

/** A report's summary: offset runs, stray reads, unread pages; with `pages`, one row per PDF page as well. */
export function formatFolios(id: string, r: FolioReport, opts: { pages?: FolioRowsFilter; limit?: number } = {}): string {
  const limit = opts.limit ?? 20;
  const volumes = new Set(r.pages.map((p) => p.volume)).size;
  const bySource = new Map<string, number>();
  for (const p of r.pages) bySource.set(p.source, (bySource.get(p.source) ?? 0) + 1);
  const read = r.pages.filter((p) => p.printed !== null).length;
  const lines = [`${id}: ${r.pages.length} PDF pages; ${read} read a printed number, ${r.inferred} numbered from their neighbours, ${r.unread} none, ${r.strays} stray read${r.strays === 1 ? "" : "s"}; source ${[...bySource].map(([k, v]) => `${k} ${v}`).join(", ")}`];
  lines.push(`  ${r.runs.length} offset run${r.runs.length === 1 ? "" : "s"} (printed minus PDF page; a run is the reads at one offset, strays and unread pages inside it do not break it):`);
  for (const run of r.runs.slice(0, limit)) {
    lines.push(`    ${at({ volume: run.volume, pdfIndex: run.fromPdf }, volumes)}${run.toPdf === run.fromPdf ? "" : `-${run.toPdf}`}  offset ${sign(run.offset)}  printed ${run.firstPrinted}-${run.lastPrinted}  ${run.reads} read${run.reads === 1 ? "" : "s"}`);
  }
  if (r.runs.length > limit) lines.push(`    … ${r.runs.length - limit} more`);
  const strays = r.pages.filter((p) => p.stray);
  if (strays.length) {
    lines.push("  stray reads (out of step with the pages round them):");
    for (const p of strays.slice(0, limit)) lines.push(`    ${at(p, volumes)} read ${p.stray!.printed} (offset ${sign(p.stray!.printed - p.pdfIndex)}) ${p.stray!.dropped ? "dropped by foliosInStep" : "kept: the report does not declare foliosInStep"}`);
    if (strays.length > limit) lines.push(`    … ${strays.length - limit} more`);
  }
  const unread = ranges(r.pages.filter((p) => p.printed === null && !p.stray), () => true);
  if (unread.length) {
    lines.push("  pages with no read number:");
    for (const g of unread.slice(0, limit)) lines.push(`    ${span(g, volumes)}${g.every((p) => p.inferred !== undefined) ? ` (marked ${g[0].inferred}${g.length > 1 ? `-${g[g.length - 1].inferred}` : ""} from neighbours)` : g.some((p) => p.inferred !== undefined) ? " (some marked from neighbours)" : ""}`);
    if (unread.length > limit) lines.push(`    … ${unread.length - limit} more`);
  }
  const flips = ranges(r.pages, (a, b) => a.source === b.source).filter((g) => g.length && r.pages.some((p) => p.source !== r.pages[0].source));
  if (flips.length > 1) lines.push(`  source runs: ${flips.slice(0, limit).map((g) => `${span(g, volumes)} ${g[0].source}`).join(", ")}${flips.length > limit ? `, … ${flips.length - limit} more` : ""}`);
  if (opts.pages) {
    lines.push("", "  PDF page | printed | offset | source | note");
    for (const p of r.pages) {
      if (opts.pages !== "all" && (p.pdfIndex < opts.pages.from || p.pdfIndex > opts.pages.to)) continue;
      const note = p.stray ? `stray read ${p.stray.printed}${p.stray.dropped ? " (dropped)" : ""}` : p.inferred !== undefined ? `marked ${p.inferred} from neighbours` : "";
      lines.push(`  ${at(p, volumes)} | ${p.printed ?? "none"} | ${p.offset === null ? "" : sign(p.offset)} | ${p.source} | ${note}`);
    }
  }
  return lines.join("\n");
}

export type FolioDiff = {
  /** Pages whose source changed (vision to pipeline, pipeline to vision), in PDF order. */
  flipped: Array<{ volume: number; pdfIndex: number; from: FolioPage["source"]; to: FolioPage["source"] }>;
  /** Pages whose read printed number changed (a read added, dropped, or a different number). */
  reread: Array<{ volume: number; pdfIndex: number; from: number | null; to: number | null }>;
};

export function diffFolios(before: FolioReport, after: FolioReport): FolioDiff {
  const was = new Map(before.pages.map((p) => [`${p.volume}:${p.pdfIndex}`, p]));
  const flipped: FolioDiff["flipped"] = [];
  const reread: FolioDiff["reread"] = [];
  for (const p of after.pages) {
    const b = was.get(`${p.volume}:${p.pdfIndex}`);
    if (!b) continue;
    if (b.source !== p.source) flipped.push({ volume: p.volume, pdfIndex: p.pdfIndex, from: b.source, to: p.source });
    if (b.printed !== p.printed) reread.push({ volume: p.volume, pdfIndex: p.pdfIndex, from: b.printed, to: p.printed });
  }
  return { flipped, reread };
}

export function formatFolioDiff(id: string, d: FolioDiff, limit: number): string {
  if (!d.flipped.length && !d.reread.length) return `${id}: no page changed source or printed-number read`;
  const volumes = new Set([...d.flipped, ...d.reread].map((p) => p.volume)).size;
  const lines = [`${id}: ${d.flipped.length} page${d.flipped.length === 1 ? "" : "s"} changed source, ${d.reread.length} changed printed-number read`];
  const list = (label: string, groups: string[]) => {
    if (!groups.length) return;
    lines.push(`  ${label}`);
    for (const g of groups.slice(0, limit)) lines.push(`    ${g}`);
    if (groups.length > limit) lines.push(`    … ${groups.length - limit} more`);
  };
  list("source flips:", ranges(d.flipped, (a, b) => a.from === b.from && a.to === b.to).map((g) => `${span(g, volumes)}  ${g[0].from} → ${g[0].to}`));
  list("printed-number reads that changed:", ranges(d.reread, (a, b) => a.from === b.from && a.to === b.to).map((g) => `${span(g, volumes)}  ${g[0].from ?? "none"} → ${g[0].to ?? "none"}${g.length > 1 ? " (each)" : ""}`));
  return lines.join("\n");
}
