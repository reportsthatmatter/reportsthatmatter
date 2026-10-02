/**
 * Adjudicated page breaks (38s.12): a small answer key for the reference edition itself.
 *
 * Every reference is a pipeline output (tagged-PDF elements, scraped HTML, OCR text) and has its own
 * errors, worst at page breaks, where the question is whether a paragraph runs on. Each report repo
 * commits `reference/adjudicated.yaml`: about 30 page breaks decided by reading the PDF's page text
 * and, where the text alone did not settle it, the rendered page image. `pnpm score` matches them to
 * the decision dataset's page-break rows and reports how often the reference (and we) are wrong
 * against them.
 *
 * File shape:
 *
 *   report: <id>
 *   adjudicated: 2026-10-02
 *   by: ...
 *   method: ...
 *   breaks:
 *     - page: 259            # physical PDF page of the first line after the break
 *       prev: "... last words of the old page"
 *       next: "first words of the new page ..."
 *       verdict: join        # join (the block runs on) | split (a new block starts) | unjudgeable
 *       stratum: random      # random | disagreement (chosen because we and the reference differed)
 *       image: false         # the rendered page was needed
 *       note: ...
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Row } from "./decisions";

export type Verdict = "join" | "split" | "unjudgeable";
export type Adjudication = {
  page: number;
  prev: string;
  next: string;
  verdict: Verdict;
  stratum?: "random" | "disagreement";
  image?: boolean;
  note?: string;
};
export type AdjudicatedFile = { report: string; adjudicated?: string; by?: string; method?: string; breaks: Adjudication[] };

export function loadAdjudicated(repo: string): AdjudicatedFile | null {
  const p = join(repo, "reference", "adjudicated.yaml");
  if (!existsSync(p)) return null;
  const f = parse(readFileSync(p, "utf8")) as AdjudicatedFile;
  return { ...f, breaks: (f.breaks ?? []).map((b) => ({ ...b, page: Number(b.page) })) };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
const head = (s: string, n: number) => norm(s).split(" ").slice(0, n).join(" ");

/** The page-break row an adjudication is about: same page, crossing a page, next line opens the same way. */
export function matchRow(rows: Row[], a: Adjudication): Row | null {
  const cands = rows.filter((r) => r.decision === "boundary" && r.source === "layout" && r.crosses_page === true && r.page === a.page);
  if (!cands.length) return null;
  // a page has one break row unless a two-column page's column order made a second
  if (cands.length === 1) return cands[0];
  const want = head(a.next, 3);
  return cands.find((r) => head(String(r.next_text ?? ""), 3) === want) ?? (cands.length === 1 && head(String(cands[0].next_text ?? ""), 1) === head(a.next, 1) ? cands[0] : null);
}

/** Write each matched row's verdict onto it and mark it `adjudicated`. Returns the matched pairs. */
export function applyAdjudication(rows: Row[], file: AdjudicatedFile): { a: Adjudication; row: Row | null }[] {
  return file.breaks.map((a) => {
    const row = matchRow(rows, a);
    if (row && a.verdict !== "unjudgeable") {
      row.adjudicated = a.verdict;
      row.label_confidence = "adjudicated";
      row.correct_adjudicated_ref = row.ref_boundary === null ? null : row.ref_boundary === (a.verdict === "split");
      row.correct_adjudicated_ours = row.ours_boundary === null ? null : row.ours_boundary === (a.verdict === "split");
    }
    return { a, row };
  });
}

export type AdjudicationStats = {
  breaks: number;
  unjudgeable: number;
  unmatched: number;
  /** matched, but the reference has no answer (the line is not in it) */
  uncovered: number;
  /** judged and covered by the reference */
  judged: number;
  referenceWrong: number;
  referenceErrorRate: number | null;
  /** 95% Wilson interval */
  referenceErrorCI: [number, number] | null;
  /** wrong or no answer, over all judged-and-matched breaks */
  referenceUnusableRate: number | null;
  oursJudged: number;
  oursWrong: number;
  oursErrorRate: number | null;
  /** the random stratum alone (an unbiased sample of the report's page breaks) */
  random: { judged: number; oursJudged: number; referenceWrong: number; referenceErrorRate: number | null; oursWrong: number; oursErrorRate: number | null };
  /** how many breaks the reference says split / join, and the adjudicated truth */
  referenceWrongAs: { splitWhereJoin: number; joinWhereSplit: number };
};

const wilson = (k: number, n: number): [number, number] | null => {
  if (!n) return null;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const w = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - w) / d), Math.min(1, (c + w) / d)];
};
const rate = (k: number, n: number) => (n ? k / n : null);

export function adjudicationStats(pairs: { a: Adjudication; row: Row | null }[]): AdjudicationStats {
  const unjudgeable = pairs.filter((p) => p.a.verdict === "unjudgeable").length;
  const unmatched = pairs.filter((p) => p.a.verdict !== "unjudgeable" && !p.row).length;
  const uncovered = pairs.filter((p) => p.row && p.a.verdict !== "unjudgeable" && p.row.ref_boundary === null).length;
  const judged = pairs.filter((p) => p.row && p.a.verdict !== "unjudgeable" && p.row.ref_boundary !== null);
  const refWrong = judged.filter((p) => p.row!.correct_adjudicated_ref === false);
  const oursJ = pairs.filter((p) => p.row && p.a.verdict !== "unjudgeable" && p.row.ours_boundary !== null);
  const oursWrong = oursJ.filter((p) => p.row!.correct_adjudicated_ours === false);
  const rj = judged.filter((p) => p.a.stratum === "random");
  const roj = oursJ.filter((p) => p.a.stratum === "random");
  return {
    breaks: pairs.length,
    unjudgeable,
    unmatched,
    uncovered,
    judged: judged.length,
    referenceWrong: refWrong.length,
    referenceErrorRate: rate(refWrong.length, judged.length),
    referenceErrorCI: wilson(refWrong.length, judged.length),
    referenceUnusableRate: rate(refWrong.length + uncovered, judged.length + uncovered),
    oursJudged: oursJ.length,
    oursWrong: oursWrong.length,
    oursErrorRate: rate(oursWrong.length, oursJ.length),
    random: {
      judged: rj.length,
      oursJudged: roj.length,
      referenceWrong: rj.filter((p) => p.row!.correct_adjudicated_ref === false).length,
      referenceErrorRate: rate(rj.filter((p) => p.row!.correct_adjudicated_ref === false).length, rj.length),
      oursWrong: roj.filter((p) => p.row!.correct_adjudicated_ours === false).length,
      oursErrorRate: rate(roj.filter((p) => p.row!.correct_adjudicated_ours === false).length, roj.length),
    },
    referenceWrongAs: {
      splitWhereJoin: refWrong.filter((p) => p.a.verdict === "join").length,
      joinWhereSplit: refWrong.filter((p) => p.a.verdict === "split").length,
    },
  };
}

const pct = (x: number | null) => (x === null ? "n/a" : (x * 100).toFixed(1) + "%");

export function adjudicationMarkdown(s: AdjudicationStats, file: AdjudicatedFile, pairs: { a: Adjudication; row: Row | null }[]): string {
  const ci = s.referenceErrorCI ? ` (95% interval ${pct(s.referenceErrorCI[0])} to ${pct(s.referenceErrorCI[1])})` : "";
  const lines = [
    "## Reference error rate at page breaks (adjudicated against the PDF)",
    "",
    `${s.breaks} page breaks adjudicated (${file.adjudicated ?? "undated"}); ${s.unjudgeable} unjudgeable, ${s.unmatched} not matched to a layout row, ${s.uncovered} where the reference has no answer (the line is not in it), ${s.judged} judged and covered by the reference.`,
    "",
    "| | wrong | of | error rate |",
    "|---|---:|---:|---:|",
    `| the reference | ${s.referenceWrong} | ${s.judged} | **${pct(s.referenceErrorRate)}**${ci} |`,
    `| ours | ${s.oursWrong} | ${s.oursJudged} | ${pct(s.oursErrorRate)} |`,
    `| the reference, random stratum only | ${s.random.referenceWrong} | ${s.random.judged} | ${pct(s.random.referenceErrorRate)} |`,
    `| ours, random stratum only | ${s.random.oursWrong} | ${s.random.oursJudged} | ${pct(s.random.oursErrorRate)} |`,
    "",
    `Counting the breaks where the reference has no answer as failures too, the reference gives a wrong answer or none at ${pct(s.referenceUnusableRate)} of the page breaks adjudicated.`,
    "",
    `The reference's errors: ${s.referenceWrongAs.splitWhereJoin} split where the paragraph runs on, ${s.referenceWrongAs.joinWhereSplit} joined where a new block starts.`,
  ];
  const wrong = pairs.filter((p) => p.row?.correct_adjudicated_ref === false);
  if (wrong.length) {
    lines.push("", "Reference wrong:", "");
    for (const { a, row } of wrong) lines.push(`- p${a.page} (${a.verdict}; ${row!.ref_boundary ? "reference splits" : "reference joins"}): …${String(row!.prev_text).slice(-40)} | ${String(row!.next_text).slice(0, 40)}…${a.note ? ` ${a.note}` : ""}`);
  }
  return lines.join("\n") + "\n";
}

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/**
 * A draft `adjudicated.yaml` to fill in: `random` page breaks drawn by a seeded shuffle from every page break
 * the reference covers (an unbiased sample of the decision), then `disagreement` ones where we and the reference
 * differ (where the reference is likeliest wrong). Verdicts are left null. Read each at
 * `pdftotext -layout -f <page-1> -l <page> <pdf> -` and look at the page image when the text is not enough.
 */
export function draftAdjudication(report: string, rows: Row[], random = 20, disagreement = 10): string {
  const pool = rows.filter((r) => r.decision === "boundary" && r.source === "layout" && r.crosses_page === true && r.ref_boundary !== null && r.ref_boundary !== undefined && ["paragraph", "quote", "list", "heading", "contents"].includes(String(r.ref_next_type)));
  const next = rng(hash(report));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked = new Map<Row, "random" | "disagreement">();
  for (const r of shuffled.slice(0, random)) picked.set(r, "random");
  for (const r of shuffled.filter((r) => !picked.has(r) && r.ours_boundary !== null && r.ours_boundary !== r.ref_boundary).slice(0, disagreement)) picked.set(r, "disagreement");
  for (const r of shuffled) if (picked.size < random + disagreement && !picked.has(r)) picked.set(r, "random");
  const q = (s: unknown) => JSON.stringify(String(s ?? ""));
  const out = [`report: ${report}`, `adjudicated: ${new Date().toISOString().slice(0, 10)}`, "by: ", "method: ", "breaks:"];
  for (const [r, stratum] of [...picked.entries()].sort((a, b) => Number(a[0].page) - Number(b[0].page))) {
    out.push(`  - page: ${r.page}`, `    prev: ${q(r.prev_text)}`, `    next: ${q(r.next_text)}`, `    verdict: null`, `    stratum: ${stratum}`, `    image: false`, `    note: ""`);
  }
  return out.join("\n") + "\n";
}
