/**
 * The quality bar (reportsthatmatter-38s.16, decision 0030): one grade per report, the errors a reader
 * meets per 10 pages, over six reader-facing dimensions, built from measurements we already record.
 * Pure functions; `scripts/grade.mjs` (`pnpm grade`, 38s.19) reads the records and calls them.
 *
 * A count from a check becomes an estimated error count by multiplying it by the check's measured
 * precision (the oracle against the golden pages, per report where there are enough findings, else
 * pooled), or by an error rate measured on adjudicated page breaks. Each dimension says whether it is
 * `measured` (exact counts or report-specific precision), `estimated` (a pooled, prior or assumed
 * precision somewhere in it), `indicative` (a number we show but do not grade on: its precision as a
 * reader-facing error is unknown) or `unmeasured`. The method is in docs/scoring.md, "The quality bar".
 */

export type Letter = "A" | "B" | "C" | "D" | "F";
export type Basis = "measured" | "estimated" | "indicative" | "unmeasured";
export type DimensionKey = "words" | "paragraphs" | "headings" | "notes" | "pages" | "ids";
export type OracleScore = { tp: number; fp: number; fn: number };

/** Decision 0030: errors a reader meets per 10 pages. A <= 1, B <= 3, C <= 10, D <= 30, F above. */
export const THRESHOLDS: Array<[Letter, number]> = [
  ["A", 1],
  ["B", 3],
  ["C", 10],
  ["D", 30],
];
/** Decision 0030: B or better, with no graded dimension below C, is publishable. */
export const PUBLISHABLE: Letter[] = ["A", "B"];
const RANK: Record<Letter, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };

export const DIMENSIONS: Array<{ key: DimensionKey; label: string; short: string }> = [
  { key: "words", label: "words right", short: "W" },
  { key: "paragraphs", label: "paragraphs right", short: "P" },
  { key: "headings", label: "headings and structure", short: "H" },
  { key: "notes", label: "notes linked correctly", short: "N" },
  { key: "pages", label: "page citations right", short: "G" },
  { key: "ids", label: "ids citable and stable", short: "I" },
];

/** A check's count needs this many counted findings on golden pages before its own precision is used. */
export const MIN_FINDINGS = 5;
/** `note-off-page` is not scored against golden pages; half its findings are taken as real (assumed, docs/scoring.md). */
export const NOTE_OFF_PAGE_PRECISION = 0.5;
/** A random stratum smaller than this falls back to every adjudicated break of the report. */
export const MIN_RANDOM_BREAKS = 10;

export type PageBreaks = {
  /** where the rate comes from */
  source: "mini-reference" | "reference";
  wrong: number;
  judged: number;
  /** what the rate is over: the random stratum alone (unbiased) or every adjudicated break (biased upwards) */
  stratum: "random" | "all";
};

export type GradeInput = {
  id: string;
  /** `%%page N%%` markers in the served full.md */
  pages: number;
  /** words in the served full.md */
  words: number;
  /** served from a clean edition (cleanEdition in its ingest.ts): the edition's paragraphs run over page breaks */
  cleanEdition: boolean;
  /** the layout oracle's counts (reports/verify-last.json) */
  oracle: Record<string, number> | null;
  /** the oracle on this report's golden pages (reports/verify-last.json `goldenOracle`) */
  goldenOracle?: Record<string, OracleScore>;
  /** the oracle on every golden page (reports/verify-last.json `oracleVsGolden`) */
  pooled: Record<string, OracleScore>;
  /** the page-anchor counts (reports/anchor-budget.yaml: a ratcheted budget, so an upper bound on the count) */
  anchors: Record<string, number> | null;
  /** reports/<id>/aliases.yaml */
  aliases: { unmatched: number; reused: number } | null;
  /** adjudicated page breaks: the mini-reference (reports/referee-last.json) or the reference (docs/scores.json) */
  pageBreaks: PageBreaks | null;
  /** page-level word error rate (docs/scores.json `wer_pages`, Wikisource or checked page text) */
  werPages: { wer: number; pages: number } | null;
};

export type Term = { source: string; count: number; precision: number; precisionFrom: string; errors: number };
export type DimensionGrade = { key: DimensionKey; basis: Basis; graded: boolean; errors: number | null; per10: number | null; letter: Letter | null; terms: Term[]; note?: string; unmatched?: { count: number; per10: number } };
export type ReportGrade = {
  id: string;
  pages: number;
  per10: number;
  letter: Letter;
  publishable: boolean;
  /** graded dimensions below C */
  below: DimensionKey[];
  dimensions: Record<DimensionKey, DimensionGrade>;
  /** no page markers: not graded, never publishable */
  unmeasured?: true;
};

export function letterFor(per10: number): Letter {
  for (const [l, max] of THRESHOLDS) if (per10 <= max + 1e-9) return l;
  return "F";
}

/** The precision a check's count is weighted by: the report's own on golden pages when it has enough findings, else pooled, else a Laplace prior on pooled. */
export function precisionOf(signal: string, own: Record<string, OracleScore> | undefined, pooled: Record<string, OracleScore>): { p: number; from: string } {
  const o = own?.[signal];
  if (o && o.tp + o.fp >= MIN_FINDINGS) return { p: o.tp / (o.tp + o.fp), from: `report golden ${o.tp}/${o.tp + o.fp}` };
  const g = pooled[signal];
  if (g && g.tp + g.fp >= MIN_FINDINGS) return { p: g.tp / (g.tp + g.fp), from: `pooled golden ${g.tp}/${g.tp + g.fp}` };
  const tp = g?.tp ?? 0;
  const n = g ? g.tp + g.fp : 0;
  return { p: (tp + 1) / (n + 2), from: `prior (${tp}+1)/(${n}+2)` };
}

const sum = (terms: Term[]) => terms.reduce((a, t) => a + t.errors, 0);
const exact = (from: string) => /^(report golden|adjudicated random|exact)/.test(from);

function dimension(key: DimensionKey, pages: number, terms: Term[] | null, opts: { graded?: boolean; basis?: Basis; errors?: number; note?: string } = {}): DimensionGrade {
  if (!terms) return { key, basis: "unmeasured", graded: false, errors: null, per10: null, letter: null, terms: [], ...(opts.note ? { note: opts.note } : {}) };
  const errors = opts.errors ?? sum(terms);
  const per10 = pages ? (errors / pages) * 10 : 0;
  const basis = opts.basis ?? (terms.every((t) => exact(t.precisionFrom)) ? "measured" : "estimated");
  const graded = opts.graded ?? true;
  return { key, basis, graded, errors, per10, letter: letterFor(per10), terms, ...(opts.note ? { note: opts.note } : {}) };
}

function oracleTerm(input: GradeInput, signal: string, fixed?: { p: number; from: string }): Term | null {
  const count = input.oracle?.[signal];
  if (count === undefined) return null;
  const { p, from } = fixed ?? precisionOf(signal, input.goldenOracle, input.pooled);
  return { source: `oracle ${signal}`, count, precision: p, precisionFrom: from, errors: count * p };
}

const present = (terms: Array<Term | null>): Term[] | null => {
  const t = terms.filter((x): x is Term => x !== null);
  return t.length ? t : null;
};

/** The page-break error rate: the random stratum of the adjudicated breaks when it is big enough, else all of them. */
export function pageBreakRate(pb: PageBreaks): number {
  return pb.judged ? pb.wrong / pb.judged : 0;
}

export function gradeReport(input: GradeInput): ReportGrade {
  const { pages } = input;
  const dims = {} as Record<DimensionKey, DimensionGrade>;

  // Words: page-level WER is shown, not graded. Most of it on the reports that have it is the reference's own
  // differences (a hybrid served from the official HTML against a Wikisource transcription of the PDF), and
  // nobody has measured how much is an error a reader meets (b78.6 sampled review, 38s.3 vision gold).
  if (input.werPages && pages) {
    const perPage = input.words / pages;
    const errors = input.werPages.wer * perPage * pages;
    dims.words = dimension("words", pages, [{ source: `page-level WER over ${input.werPages.pages} pages`, count: Math.round(errors), precision: 1, precisionFrom: "unknown", errors }], { graded: false, basis: "indicative", note: "WER x words per page; shown, not graded (precision as reader errors unmeasured)" });
  } else dims.words = dimension("words", pages, null, { note: "no page-level reference" });

  // Paragraphs: a paragraph cut in two (oracle oversplit) or run on at a page break (adjudicated breaks), and a
  // paragraph set as a quotation (quotes-spurious). Oversplits and page-break errors overlap (a missed join at a
  // page break is an oversplit), so the larger of the two is taken, not their sum.
  {
    const over = oracleTerm(input, "paragraphs-oversplit");
    const quotes = oracleTerm(input, "quotes-spurious");
    let pb: Term | null = null;
    let note: string | undefined;
    if (input.cleanEdition) note = "served from a clean edition: page breaks taken as whole";
    else if (input.pageBreaks) {
      const rate = pageBreakRate(input.pageBreaks);
      pb = { source: `page breaks (${input.pageBreaks.source}, ${input.pageBreaks.stratum}) ${input.pageBreaks.wrong}/${input.pageBreaks.judged} wrong x ${pages} pages`, count: pages, precision: rate, precisionFrom: input.pageBreaks.stratum === "random" ? "adjudicated random stratum" : "adjudicated, all strata (biased up)", errors: rate * pages };
    } else note = "page breaks unmeasured (no reference, no mini-reference)";
    const terms = present([over, pb, quotes]);
    const errors = terms ? Math.max(over?.errors ?? 0, pb?.errors ?? 0) + (quotes?.errors ?? 0) : undefined;
    const d = dimension("paragraphs", pages, terms, { errors, note });
    if (terms && !pb && !input.cleanEdition && d.basis === "measured") d.basis = "estimated";
    dims.paragraphs = d;
  }

  dims.headings = dimension("headings", pages, present([oracleTerm(input, "headings-missed"), oracleTerm(input, "headings-spurious")]));

  dims.notes = dimension(
    "notes",
    pages,
    present([oracleTerm(input, "markers-unlinked"), oracleTerm(input, "markers-spurious"), oracleTerm(input, "note-off-page", { p: NOTE_OFF_PAGE_PRECISION, from: "assumed" })]),
  );

  dims.pages = input.anchors
    ? dimension(
        "pages",
        pages,
        ["markers-wrong", "pages-unmarked", "blocks-wrong"].map((k) => ({ source: `anchors ${k} (budget)`, count: input.anchors![k] ?? 0, precision: 1, precisionFrom: "assumed", errors: input.anchors![k] ?? 0 })),
      )
    : dimension("pages", pages, null);

  // Ids: an old ?p= link that now lands on other text (reused) is a silent wrong citation, graded. An old link that
  // finds nothing (unmatched) is shown, not graded: a reader meets it only by following a link made before the id
  // went, and we have no link data; most were lost in pre-launch re-ingests (decision bead filed with 38s.16).
  {
    const al = input.aliases ?? { unmatched: 0, reused: 0 };
    const d = dimension("ids", pages, [{ source: "aliases reused (old ?p= link lands on other text)", count: al.reused, precision: 1, precisionFrom: "exact", errors: al.reused }], {
      note: input.aliases ? undefined : "no aliases.yaml: no id has been lost or moved since first publication",
    });
    d.unmatched = { count: al.unmatched, per10: pages ? (al.unmatched / pages) * 10 : 0 };
    dims.ids = d;
  }

  if (!pages) {
    // nothing to divide by: no page markers in the served text
    return { id: input.id, pages, per10: NaN, letter: "F", publishable: false, below: [], dimensions: dims, unmeasured: true };
  }
  const graded = Object.values(dims).filter((d) => d.graded && d.per10 !== null);
  const per10 = graded.reduce((a, d) => a + (d.per10 ?? 0), 0);
  const letter = letterFor(per10);
  const below = graded.filter((d) => RANK[d.letter!] > RANK.C).map((d) => d.key);
  return { id: input.id, pages, per10, letter, publishable: PUBLISHABLE.includes(letter) && below.length === 0, below, dimensions: dims };
}

const f1 = (n: number | null) => (n === null || Number.isNaN(n) ? "–" : n.toFixed(1));
const f2 = (n: number) => (Number.isNaN(n) ? "–" : n.toFixed(2));

/** The grade table, one row per report, best first: per dimension errors per 10 pages (`~` estimated, `?` indicative, `–` unmeasured). */
export function gradeTable(grades: ReportGrade[]): string {
  const head = ["report", "pages", ...DIMENSIONS.map((d) => `${d.short} ${d.label}`), "per 10 pp", "grade", "publishable"];
  const rows = [...grades].sort((a, b) => (Number.isNaN(a.per10) ? 1 : 0) - (Number.isNaN(b.per10) ? 1 : 0) || a.per10 - b.per10).map((g) => {
    const cells = DIMENSIONS.map(({ key }) => {
      const d = g.dimensions[key];
      if (d.per10 === null) return "–";
      const mark = d.basis === "estimated" ? "~" : d.basis === "indicative" ? "?" : "";
      const extra = d.unmatched?.count ? ` (?${f1(d.unmatched.per10)} unmatched)` : "";
      return `${mark}${f1(d.per10)}${d.graded ? ` ${d.letter}` : ""}${extra}`;
    });
    if (g.unmeasured) return [g.id, String(g.pages), ...cells, "–", "–", "no (no page markers)"];
    return [g.id, String(g.pages), ...cells, f2(g.per10), g.letter, g.publishable ? "yes" : g.below.length ? `no (${g.below.join(", ")} below C)` : "no"];
  });
  return [`| ${head.join(" | ")} |`, `|${head.map((_, i) => (i === 0 ? "---" : "---:")).join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

export type GradeRecord = { ingest: string | null; site: string | null; recorded: string; reports: Record<string, ReportGrade> };

/** Letter and index moves between two grade records. */
export function gradeDiff(now: GradeRecord, was: GradeRecord | null): string {
  const lines: string[] = [];
  for (const [id, g] of Object.entries(now.reports).sort(([a], [b]) => a.localeCompare(b))) {
    const p = was?.reports?.[id];
    if (!p) {
      lines.push(`| ${id} | – | ${g.letter} ${f1(g.per10)} | new |`);
      continue;
    }
    const d = g.per10 - p.per10;
    const dims = DIMENSIONS.map(({ key, short }) => {
      const a = p.dimensions[key]?.per10 ?? null;
      const b = g.dimensions[key].per10;
      if (a === null && b === null) return null;
      if (a === null || b === null || Math.abs(b - a) >= 0.05) return `${short} ${f1(a)}→${f1(b)}`;
      return null;
    }).filter(Boolean);
    const move = g.letter !== p.letter ? (RANK[g.letter] < RANK[p.letter] ? "▲ up" : "▼ down") : Math.abs(d) >= 0.05 ? (d < 0 ? "better" : "worse") : "";
    lines.push(`| ${id} | ${p.letter} ${f1(p.per10)} | ${g.letter} ${f1(g.per10)} | ${[move, ...dims].filter(Boolean).join("; ")} |`);
  }
  return ["| report | was | now | moves |", "|---|---|---|---|", ...lines].join("\n");
}
