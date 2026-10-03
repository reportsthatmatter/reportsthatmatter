/**
 * Mini-references for reports with no clean edition (reportsthatmatter-38s.15): draw page breaks
 * to adjudicate from the PDF's own layout, render the two page edges, and turn the answers into
 * the report repo's `reference/adjudicated.yaml`, the file `pnpm ingest referee eval` judges against.
 *
 *   pnpm ingest referee draft <id>... [--out <dir>] [--seed 38] [--random 15] [--per-tier 5] [--dpi 150]
 *   pnpm ingest referee draft <id>... --verdicts <dir>      # <dir>/<id>/verdicts.json → <repo>/reference/adjudicated.yaml
 *
 * The population is every page turn of every volume: the last line of running text on the old page
 * and the first on the new one, read from `pdftohtml -xml` (furniture and notes left out, below). Each
 * pair gets the layout rules' call as `decidePageBreak` makes it (`layoutPageJoins`, 38s.10) and its
 * confidence tier (38s.11): taken from the pipeline's own run where the pass referred it (low and
 * medium calls), otherwise computed on the two lines. The sample is `--random` pairs by a seeded
 * shuffle (the unbiased stratum) plus `--per-tier` more from each of low, medium and high (the tier
 * strata; a short tier is topped up from the others). Each pick is assigned to `dev` or `held-out`
 * by the same seeded shuffle, alternating within its stratum, so both halves cover every stratum.
 *
 * Draft output, per report, under `--out` (default score-out/pagebreak-draft): `cases.json` (each pick
 * with the lines either side, numbered, and the rules' call, which an adjudicator should not read
 * before answering), `brief.json` (the same without the rules' call: what the adjudicator gets) and
 * two crops per pick (`NN-a-old.png`, the foot of the old page; `NN-b-new.png`, the head of the new one).
 * The adjudicator writes `verdicts.json`: `[{n, verdict: "join"|"split"|"unjudgeable", prev_id?, next_id?,
 * between?, note?}]`, where `prev_id`/`next_id` correct the lines when the drawn ones are not the running
 * text (a footnote, a running head), and `between` names what stands between the two halves (notes,
 * caption, figure, heading, running head, table, none).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  decidePageBreak,
  letters,
  type Layout,
  type LayoutLine,
  type PageBreakCase,
  type PageBreakDecision,
  type PipelineDef,
  type PageBreakReferee,
} from "@rtm/ingest";

export type SampleHost = {
  root: string;
  reportDir(id: string): string;
  loadDefinition(id: string): Promise<PipelineDef>;
  run(id: string, def: PipelineDef): unknown;
  pdfs(id: string, def: PipelineDef): string[];
  layout(id: string, def: PipelineDef): Layout;
};

type Tier = "low" | "medium" | "high";
type Pair = {
  volume: number;
  /** PDF page of the old page's last line. */
  oldPage: number;
  /** PDF page of the new page's first line: the `page` an adjudication is keyed by. */
  page: number;
  prev: LayoutLine;
  next: LayoutLine;
  decision: PageBreakDecision;
  /** Whether the pipeline's run referred this pair (its decision is then the pass's own). */
  referred: boolean;
};
type Pick = Pair & { n: number; stratum: "random" | `tier-${Tier}`; set: "dev" | "held-out" };

const option = (args: string[], name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

/** mulberry32, seeded from a string. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let s = h | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(xs: T[], next: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Lines of running text: not a footnote (set below 0.88 of the body size), not furniture (a line whose
 * letters recur on four or more pages of the volume: running heads, footers, "Page x of y"), and with
 * enough letters for the eval to find it in the output (six).
 */
function runningLines(layout: Layout, volume: number): Map<number, LayoutLine[]> {
  const body = layout.bodyFont.size;
  const seen = new Map<string, Set<number>>();
  const pages = layout.pages(volume);
  for (const p of pages) {
    for (const l of layout.lines(volume, p)) {
      const k = letters(l.text);
      if (k.length < 4) continue;
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k)!.add(p);
    }
  }
  const out = new Map<number, LayoutLine[]>();
  for (const p of pages) {
    out.set(
      p,
      layout.lines(volume, p).filter((l) => {
        const k = letters(l.text);
        return k.length >= 6 && l.size >= 0.88 * body && (seen.get(k)?.size ?? 0) < 4;
      })
    );
  }
  return out;
}

/** The line under `next` as `findPageBreakLines` finds it: below, overlapping, within two and a half lines. */
function lineUnder(layout: Layout, next: LayoutLine): LayoutLine | undefined {
  const lines = layout.lines(next.volume, next.page);
  const pitch = layout.page(next.volume, next.page)?.pitch ?? 0;
  const reach = Math.max(2.5 * Math.max(next.height, 1), 1.5 * pitch);
  for (const l of lines.slice(next.index + 1)) {
    if (l.top <= next.top || l.top - next.top > reach) continue;
    if (l.left > next.right || l.right < next.left) continue;
    return l;
  }
  return undefined;
}

/** The rules' call on two lines: the pass's own where its run referred the pair, else `decidePageBreak` on the lines. */
function rulesFor(layout: Layout, referred: PageBreakCase[], prev: LayoutLine, next: LayoutLine, scanned: boolean): { decision: PageBreakDecision; referred: boolean } {
  const own = referred.find((c) => c.lines.next.volume === next.volume && c.lines.next.page === next.page && c.lines.next.index === next.index && c.lines.prev.page === prev.page && c.lines.prev.index === prev.index);
  if (own) return { decision: own.decision, referred: true };
  const under = lineUnder(layout, next);
  const underContinues = under !== undefined && under.font === next.font && letters(under.text).length > 0;
  const decision = decidePageBreak({ prev, next, under, underContinues, prevPage: layout.page(prev.volume, prev.page)! }, prev.text, `${next.text} ${under?.text ?? ""}`, { scanned });
  return { decision, referred: false };
}

/** The pipeline's own run, its `layoutPageJoins` referring low and medium calls to a recorder: the pass's decisions on the pairs it sees. */
function referredCases(host: SampleHost, id: string, def: PipelineDef): PageBreakCase[] {
  const referred: PageBreakCase[] = [];
  const referee: PageBreakReferee = (c) => {
    referred.push(c);
    return undefined;
  };
  const passes = (def.passes as unknown as Array<{ name: string }>).map((p) => (p.name === "layoutPageJoins" ? { ...p, referee, refer: "medium" } : p));
  host.run(id, { ...def, passes } as unknown as PipelineDef);
  return referred;
}

/** Every page turn, with the rules' call: the pipeline's where it referred the pair, else computed on the lines. */
function pairsOf(layout: Layout, referred: PageBreakCase[], scanned: boolean): Pair[] {
  const out: Pair[] = [];
  for (let v = 1; v <= layout.volumes; v++) {
    const running = runningLines(layout, v);
    const pages = layout.pages(v);
    for (let i = 1; i < pages.length; i++) {
      const prev = running.get(pages[i - 1])?.at(-1);
      const next = running.get(pages[i])?.[0];
      if (!prev || !next) continue;
      out.push({ volume: v, oldPage: prev.page, page: next.page, prev, next, ...rulesFor(layout, referred, prev, next, scanned) });
    }
  }
  return out;
}

function sample(pairs: Pair[], id: string, seed: string, random: number, perTier: number): Pick[] {
  const next = rng(`${id}:${seed}`);
  const order = shuffle(pairs, next);
  const picks: Array<Pair & { stratum: Pick["stratum"] }> = order.slice(0, random).map((p) => ({ ...p, stratum: "random" as const }));
  const taken = new Set<Pair>(order.slice(0, random));
  const tiers: Tier[] = ["low", "medium", "high"];
  let short = 0;
  for (const t of tiers) {
    const pool = order.filter((p) => !taken.has(p) && p.decision.confidence === t).slice(0, perTier);
    for (const p of pool) {
      picks.push({ ...p, stratum: `tier-${t}` });
      taken.add(p);
    }
    short += perTier - pool.length;
  }
  // A tier with fewer pairs than asked is topped up from the rarest of the others, so the total stays fixed.
  for (const t of ["low", "medium", "high"] as Tier[]) {
    if (short <= 0) break;
    for (const p of order.filter((x) => !taken.has(x) && x.decision.confidence === t)) {
      if (short <= 0) break;
      picks.push({ ...p, stratum: `tier-${t}` });
      taken.add(p);
      short--;
    }
  }
  // dev / held-out: alternate within each stratum, in a seeded order.
  const sets = rng(`${id}:${seed}:sets`);
  const out: Pick[] = [];
  for (const stratum of [...new Set(picks.map((p) => p.stratum))]) {
    const members = shuffle(picks.filter((p) => p.stratum === stratum), sets);
    const first = sets() < 0.5 ? "dev" : "held-out";
    members.forEach((p, i) => out.push({ ...p, n: 0, set: (i % 2 === 0) === (first === "dev") ? "dev" : "held-out" }));
  }
  out.sort((a, b) => a.volume - b.volume || a.page - b.page);
  out.forEach((p, i) => (p.n = i + 1));
  return out;
}

/** A crop of one page, from `top` to `bottom` in layout units (pdftohtml -xml: 1.5 × 72 dpi), at `dpi`. */
function crop(pdf: string, page: number, top: number, bottom: number, width: number, dpi: number, file: string): void {
  const k = dpi / 108;
  const y = Math.max(0, Math.floor(top * k));
  const h = Math.max(1, Math.ceil((bottom - top) * k));
  execFileSync("pdftoppm", ["-f", String(page), "-l", String(page), "-r", String(dpi), "-x", "0", "-y", String(y), "-W", String(Math.ceil(width * k)), "-H", String(h), "-png", "-singlefile", pdf, file.replace(/\.png$/, "")]);
}

const lineRow = (l: LayoutLine) => ({ id: l.index, text: l.text });

async function writeDraft(host: SampleHost, id: string, args: string[], out: string): Promise<void> {
  const def = await host.loadDefinition(id);
  const pass = (def.passes as unknown as Array<{ name: string; scanned?: boolean; referee?: PageBreakReferee; refer?: string }>).find((p) => p.name === "layoutPageJoins");
  if (!pass) throw new Error(`${id}: no layoutPageJoins`);
  const referred = referredCases(host, id, def);
  const layout = host.layout(id, def);
  const pairs = pairsOf(layout, referred, pass.scanned === true);
  const picks = sample(pairs, id, option(args, "seed") ?? "38s.15", Number(option(args, "random") ?? 15), Number(option(args, "per-tier") ?? 5));
  const dir = join(out, id);
  mkdirSync(dir, { recursive: true });
  const pdfs = host.pdfs(id, def);
  const dpi = Number(option(args, "dpi") ?? 150);
  const cases = picks.map((p) => {
    const oldLines = layout.lines(p.volume, p.oldPage);
    const newLines = layout.lines(p.volume, p.page);
    const nn = String(p.n).padStart(2, "0");
    const lh = Math.max(p.prev.height, 8);
    // The old page from six lines above its last running line to the foot (notes and folio included); the new page from its head to eight lines below.
    // At least the lower half of the old page and the upper half of the new one, so a footnote or caption taken for the last line still shows the text above it.
    crop(pdfs[p.volume - 1], p.oldPage, Math.min(p.prev.top - 7 * lh, 0.5 * p.prev.pageHeight), p.prev.pageHeight, p.prev.pageWidth, dpi, join(dir, `${nn}-a-old.png`));
    crop(pdfs[p.volume - 1], p.page, 0, Math.max(p.next.top + 9 * Math.max(p.next.height, 8), 0.5 * p.next.pageHeight), p.next.pageWidth, dpi, join(dir, `${nn}-b-new.png`));
    return {
      n: p.n,
      volume: p.volume,
      old_page: p.oldPage,
      page: p.page,
      prev_id: p.prev.index,
      next_id: p.next.index,
      prev: p.prev.text,
      next: p.next.text,
      old_lines: oldLines.filter((l) => l.index >= p.prev.index - 10).map(lineRow),
      new_lines: newLines.filter((l) => l.index <= p.next.index + 10).map(lineRow),
      images: [`${nn}-a-old.png`, `${nn}-b-new.png`],
      stratum: p.stratum,
      set: p.set,
      tier: p.decision.confidence,
      rule: `${p.decision.rule}: ${p.decision.reason}`,
      rules_join: p.decision.join,
      referred: p.referred,
    };
  });
  writeFileSync(join(dir, "cases.json"), JSON.stringify({ report: id, pdfs, population: pairs.length, tiers: tally(pairs), cases }, null, 1) + "\n");
  // What the adjudicator sees: no rules' call, no stratum.
  const brief = cases.map(({ n, volume, old_page, page, prev_id, next_id, prev, next, old_lines, new_lines, images }) => ({ n, volume, old_page, page, prev_id, next_id, prev, next, old_lines, new_lines, images }));
  writeFileSync(join(dir, "brief.json"), JSON.stringify({ report: id, pdfs, cases: brief }, null, 1) + "\n");
  console.log(`  ${id}: ${pairs.length} page turns (${Object.entries(tally(pairs)).map(([k, v]) => `${k} ${v}`).join(", ")}); drew ${picks.length} → ${dir}`);
}

const tally = (pairs: Pair[]) => {
  const t: Record<string, number> = { low: 0, medium: 0, high: 0 };
  for (const p of pairs) t[p.decision.confidence]++;
  return t;
};

type Verdict = { n: number; verdict: "join" | "split" | "unjudgeable"; prev_id?: number; next_id?: number; between?: string; note?: string; sure?: boolean };

async function writeReference(host: SampleHost, id: string, args: string[], out: string, verdictsDir: string): Promise<void> {
  const draft = JSON.parse(readFileSync(join(out, id, "cases.json"), "utf8")) as { cases: Array<Record<string, unknown> & { n: number; volume: number; old_page: number; page: number }> };
  const verdicts = JSON.parse(readFileSync(join(verdictsDir, id, "verdicts.json"), "utf8")) as Verdict[];
  const def = await host.loadDefinition(id);
  const layout = host.layout(id, def);
  const scanned = (def.passes as unknown as Array<{ name: string; scanned?: boolean }>).some((p) => p.name === "layoutPageJoins" && p.scanned === true);
  const referred = referredCases(host, id, def);
  const q = (s: unknown) => JSON.stringify(String(s ?? ""));
  const by = option(args, "by") ?? "Claude (Opus 5.5) subagent, blind to the rules' call, reading the page images; every disagreement with the pipeline re-read";
  const lines = [
    `report: ${id}`,
    `adjudicated: ${new Date().toISOString().slice(0, 10)}`,
    `by: ${q(by)}`,
    `method: ${q(
      "Mini-reference for a report with no clean edition (38s.15; scripts/ingest/pagebreak-sample.ts, `pnpm ingest referee draft`). Population: every page turn, the last line of running text on the old page and the first on the new (pdftohtml -xml; notes, running heads and folios left out). 15 drawn by a seeded shuffle (stratum random), then 5 from each confidence tier of the layout rules at @rtm/ingest v0.21.0 (stratum tier-low/medium/high; a short tier topped up from the others). Each break was answered from the rendered page images (the foot of the old page, the head of the new one), blind to the rules' call: does a new block (paragraph, bullet, numbered paragraph, quotation, heading) start between the two lines, or does the block run on? prev and next are the running-text lines either side; when notes, a caption or a heading stand between, the verdict says whether the paragraph's text continues on the new page, and `between` names what stands between. `set` assigns the break to development or held-out (alternating within each stratum, seeded); `tier` and `rule` are the rules' call at v0.21.0 when drawn."
    )}`,
    `seed: ${q(option(args, "seed") ?? "38s.15")}`,
    "breaks:",
  ];
  for (const c of draft.cases) {
    const v = verdicts.find((x) => x.n === c.n);
    if (!v) throw new Error(`${id}: no verdict for case ${c.n}`);
    const lineOf = (page: number, idx: number) => layout.lines(c.volume, page).find((l) => l.index === idx);
    const prevLine = lineOf(c.old_page, v.prev_id ?? Number(c.prev_id));
    const nextLine = lineOf(c.page, v.next_id ?? Number(c.next_id));
    if (!prevLine || !nextLine) throw new Error(`${id} case ${c.n}: line ${v.prev_id}/${v.next_id} not on p.${c.old_page}/${c.page}`);
    const prev = prevLine.text;
    const next = nextLine.text;
    // The tier of the lines adjudicated (the adjudicator may have corrected the drawn ones): what the error tables group by.
    const corrected = prevLine.index !== Number(c.prev_id) || nextLine.index !== Number(c.next_id);
    const rules = corrected ? rulesFor(layout, referred, prevLine, nextLine, scanned).decision : undefined;
    const tier = rules ? rules.confidence : c.tier;
    const rule = rules ? `${rules.rule}: ${rules.reason}` : c.rule;
    lines.push(`  - page: ${c.page}`);
    if (layout.volumes > 1) lines.push(`    volume: ${c.volume}`);
    lines.push(
      `    prev: ${q(prev)}`,
      `    next: ${q(next)}`,
      `    verdict: ${v.verdict}`,
      `    stratum: ${c.stratum}`,
      `    set: ${c.set}`,
      `    tier: ${tier}`,
      `    rule: ${q(rule)}`,
      `    between: ${v.between ?? "none"}`,
      `    image: true`
    );
    // A short last line ("failed.481") is too short to find in the output: give the line above it too.
    const above = letters(prev).length < 12 ? layout.lines(c.volume, c.old_page).filter((l) => l.index < prevLine.index && letters(l.text).length > 0).at(-1) : undefined;
    if (above) lines.push(`    above: ${q(above.text)}`);
    if (v.sure === false) lines.push("    sure: false");
    if (corrected) lines.push(`    drawn: ${q(`${c.tier}; ${String(c.prev).trim().slice(-40)} / ${String(c.next).trim().slice(0, 40)}`)}`);
    if (v.note) lines.push(`    note: ${q(v.note)}`);
  }
  const file = join(host.reportDir(id), "reference", "adjudicated.yaml");
  mkdirSync(join(host.reportDir(id), "reference"), { recursive: true });
  writeFileSync(file, lines.join("\n") + "\n");
  console.log(`  ${id}: ${draft.cases.length} breaks → ${file}`);
}

export async function runDraft(host: SampleHost, args: string[]): Promise<number> {
  const flagged = new Set(["out", "seed", "random", "per-tier", "dpi", "verdicts", "by"]);
  const ids = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && flagged.has(args[i - 1].slice(2))));
  if (!ids.length) {
    console.error("Usage: pnpm ingest referee draft <id>... [--out <dir>] [--seed s] [--random 15] [--per-tier 5] | --verdicts <dir>");
    return 1;
  }
  const out = option(args, "out") ?? join(host.root, "score-out", "pagebreak-draft");
  const verdicts = option(args, "verdicts");
  for (const id of ids) {
    if (verdicts) await writeReference(host, id, args, out, verdicts);
    else await writeDraft(host, id, args, out);
  }
  if (!verdicts && !existsSync(out)) return 1;
  return 0;
}
