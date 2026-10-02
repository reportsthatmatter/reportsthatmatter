/**
 * reports/quality-budget.yaml: per-report maximum counts for each gated
 * signal, plus the defaults a report with no entry is held to.
 *
 *   defaults:
 *     per1k:  { <signal>: findings per 1,000 words }   corpus median; × the report's words, rounded up
 *     max:    { <signal>: ceiling }                    metric signals: corpus median ceiling
 *   reports:
 *     <id>:
 *       citationVocabulary: [SCO-, Hearing Exhibit]   optional, feeds note-citation-vocabulary
 *       <signal>: <max count>   # why: <bead>          a hand-raised budget carries its reason
 *
 * Budgets only move down by `pnpm quality ratchet`. A raise is a hand edit
 * with a `# why: <bead>` comment on the line; `pnpm quality check` fails an
 * uncommented raise against git HEAD's copy of the file.
 */
import { parse } from "yaml";
import { SIGNALS } from "./signals";

export type Budgets = Record<string, number>;

export type BudgetFile = {
  defaults: { per1k: Record<string, number>; max: Record<string, number> };
  reports: Record<string, { citationVocabulary?: string[]; budgets: Budgets }>;
  /** `${report}.${signal}` -> the `# why: ...` text on that line. */
  comments: Record<string, string>;
};

export const GATED = SIGNALS.filter((s) => !s.advisory);

const HEADER = `# Per-report quality budgets (docs/design/2026-10-02-quality-harness-plan.md §3.1).
#
# Each number is the most findings a signal may report for that report; \`pnpm quality check\`
# (in verify.sh) fails when a count exceeds it. Budgets start at the corpus's counts and only
# move down: \`pnpm quality ratchet\` lowers them to the current counts, never up. Raising one is
# a hand edit with a \`# why: <bead id>\` comment on the line; check fails an uncommented raise
# against git HEAD. \`pnpm quality baseline --why <reason>\` regenerates every number from the
# current corpus (use after a re-ingest). Signals are listed in \`pnpm quality report\`.
#
# A report with no entry is held to \`defaults\`: the corpus median rate per 1,000 words times
# the report's words (rounded up), so a new ingest cannot ship above the corpus's typical level.
`;

export function parseBudgetFile(text: string): BudgetFile {
  const doc = (parse(text) ?? {}) as {
    defaults?: { per1k?: Record<string, number>; max?: Record<string, number> };
    reports?: Record<string, Record<string, unknown>>;
  };
  const reports: BudgetFile["reports"] = {};
  for (const [id, entry] of Object.entries(doc.reports ?? {})) {
    const budgets: Budgets = {};
    let citationVocabulary: string[] | undefined;
    for (const [key, value] of Object.entries(entry ?? {})) {
      if (key === "citationVocabulary") citationVocabulary = value as string[];
      else if (typeof value === "number") budgets[key] = value;
    }
    reports[id] = { budgets, ...(citationVocabulary ? { citationVocabulary } : {}) };
  }
  const comments: Record<string, string> = {};
  let current = "";
  let inReports = false;
  for (const line of text.split("\n")) {
    if (/^reports:/.test(line)) inReports = true;
    else if (/^\S/.test(line) && !line.startsWith("#")) inReports = false;
    if (!inReports) continue;
    const head = /^  ([^\s:#][^:]*):\s*$/.exec(line);
    if (head) current = head[1];
    const row = /^    ([\w-]+):\s*\d+(?:\.\d+)?\s*(#.*)$/.exec(line);
    if (row && current) comments[`${current}.${row[1]}`] = row[2].trim();
  }
  return {
    defaults: { per1k: doc.defaults?.per1k ?? {}, max: doc.defaults?.max ?? {} },
    reports,
    comments,
  };
}

export function serializeBudgetFile(file: BudgetFile): string {
  const lines: string[] = [HEADER, "defaults:"];
  lines.push("  per1k:");
  for (const [k, v] of Object.entries(file.defaults.per1k)) lines.push(`    ${k}: ${v}`);
  lines.push("  max:");
  for (const [k, v] of Object.entries(file.defaults.max)) lines.push(`    ${k}: ${v}`);
  lines.push("", "reports:");
  for (const id of Object.keys(file.reports).sort()) {
    const entry = file.reports[id];
    lines.push(`  ${id}:`);
    if (entry.citationVocabulary) lines.push(`    citationVocabulary: ${JSON.stringify(entry.citationVocabulary)}`);
    for (const signal of GATED) {
      const v = entry.budgets[signal.id];
      if (v === undefined) continue;
      const why = file.comments[`${id}.${signal.id}`];
      lines.push(`    ${signal.id}: ${v}${why ? `  ${why}` : ""}`);
    }
  }
  return lines.join("\n") + "\n";
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Corpus medians from every report's counts: rate per 1,000 words, or the ceiling for metric signals. */
export function deriveDefaults(rows: { words: number; counts: Record<string, number> }[]): BudgetFile["defaults"] {
  const per1k: Record<string, number> = {};
  const max: Record<string, number> = {};
  for (const signal of GATED) {
    if (signal.kind === "metric") {
      max[signal.id] = Math.ceil(median(rows.map((r) => r.counts[signal.id])));
    } else {
      const rate = median(rows.map((r) => (r.words ? (r.counts[signal.id] / r.words) * 1000 : 0)));
      per1k[signal.id] = Math.round(rate * 1000) / 1000;
    }
  }
  return { per1k, max };
}

/** The budget a signal holds a report to: its own entry, else the corpus default scaled by its size. */
export function budgetFor(file: BudgetFile, report: string, signalId: string, words: number): number {
  const own = file.reports[report]?.budgets[signalId];
  if (own !== undefined) return own;
  const signal = GATED.find((s) => s.id === signalId);
  if (!signal) return Infinity;
  if (signal.kind === "metric") return file.defaults.max[signalId] ?? 0;
  return Math.ceil(((file.defaults.per1k[signalId] ?? 0) * words) / 1000);
}

export type Exceeded = { signal: string; count: number; budget: number };

export function exceeded(file: BudgetFile, report: string, words: number, counts: Record<string, number>): Exceeded[] {
  const out: Exceeded[] = [];
  for (const signal of GATED) {
    const budget = budgetFor(file, report, signal.id, words);
    if (counts[signal.id] > budget) out.push({ signal: signal.id, count: counts[signal.id], budget });
  }
  return out;
}

export type Raise = { report: string; signal: string; from: number; to: number; why: string | null };

/** Budgets higher in `current` than in `previous`, with the `# why:` comment each carries. */
export function raisedBudgets(previous: BudgetFile, current: BudgetFile): Raise[] {
  const out: Raise[] = [];
  for (const [report, entry] of Object.entries(current.reports)) {
    const before = previous.reports[report];
    if (!before) continue;
    for (const [signal, to] of Object.entries(entry.budgets)) {
      const from = before.budgets[signal];
      if (from === undefined || to <= from) continue;
      const comment = current.comments[`${report}.${signal}`];
      out.push({ report, signal, from, to, why: comment && /^#\s*why:\s*\S/.test(comment) ? comment : null });
    }
  }
  return out;
}

/** The budgets after a ratchet: every number min(budget, count), never up. */
export function ratchet(file: BudgetFile, report: string, counts: Record<string, number>): { next: Budgets; lowered: string[] } {
  const entry = file.reports[report];
  const next: Budgets = { ...(entry?.budgets ?? {}) };
  const lowered: string[] = [];
  for (const signal of GATED) {
    const current = next[signal.id];
    if (current === undefined) continue;
    if (counts[signal.id] < current) {
      next[signal.id] = counts[signal.id];
      lowered.push(`${signal.id} ${current} → ${counts[signal.id]}`);
    }
  }
  return { next, lowered };
}
