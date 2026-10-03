/**
 * Per-report budgets for the layout oracle's precise signals
 * (`reports/oracle-budget.yaml`, bead b78.9; docs/quality-harness.md).
 *
 * The oracle needs the source PDFs, so it runs in `pnpm ingest verify`, not
 * in `pnpm quality`; its budgets are checked there. A count over its budget
 * fails verify; a count under it is a ratchet waiting to happen
 * (`pnpm ingest verify --ratchet-oracle` lowers the budgets of the reports it
 * ran, never raises one). Raising one is a hand edit with a `# why: <bead>`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export type OracleBudget = Record<string, Record<string, number>>;

/** `reports:` of the file: report id to signal to the most findings allowed. */
export function parseOracleBudget(text: string): OracleBudget {
  const doc = (parseYaml(text) ?? {}) as { reports?: OracleBudget };
  return doc.reports ?? {};
}

/**
 * `notes-at-back:` of the file: reports whose notes are printed at the back of a chapter or the
 * volume (or not parsed at all), so a note is never on the page of its marker and `note-off-page`
 * has nothing to say. Everything else is held to its notes being at the foot of the page that cites them.
 */
export function parseNotesAtBack(text: string): string[] {
  const doc = (parseYaml(text) ?? {}) as { "notes-at-back"?: string[] };
  return doc["notes-at-back"] ?? [];
}

export function loadNotesAtBack(path: string): string[] {
  return existsSync(path) ? parseNotesAtBack(readFileSync(path, "utf8")) : [];
}

export function loadOracleBudget(path: string): OracleBudget {
  return existsSync(path) ? parseOracleBudget(readFileSync(path, "utf8")) : {};
}

export type BudgetResult = {
  over: Array<{ signal: string; count: number; budget: number }>;
  /** Budgeted signals now below their budget: what a ratchet would lower. */
  slack: Array<{ signal: string; count: number; budget: number }>;
};

export function checkOracleBudget(budget: OracleBudget, id: string, counts: Record<string, number>): BudgetResult {
  const out: BudgetResult = { over: [], slack: [] };
  for (const [signal, max] of Object.entries(budget[id] ?? {})) {
    const count = counts[signal] ?? 0;
    if (count > max) out.over.push({ signal, count, budget: max });
    else if (count < max) out.slack.push({ signal, count, budget: max });
  }
  return out;
}

/**
 * Rewrites each lowered number in place, keeping the file's comments and layout.
 * Only lowers: a count above its budget is left alone (it fails the check).
 */
export function ratchetOracleBudgetText(text: string, id: string, counts: Record<string, number>): string {
  let inReport = false;
  return text
    .split("\n")
    .map((line) => {
      const report = /^  ([a-z0-9-]+):\s*(#.*)?$/.exec(line);
      if (report) {
        inReport = report[1] === id;
        return line;
      }
      const entry = /^(    ([a-z-]+): )(\d+)(.*)$/.exec(line);
      if (inReport && entry && counts[entry[2]] !== undefined && counts[entry[2]] < Number(entry[3])) {
        return `${entry[1]}${counts[entry[2]]}${entry[4]}`;
      }
      return line;
    })
    .join("\n");
}

export function ratchetOracleBudgetFile(path: string, id: string, counts: Record<string, number>): boolean {
  const before = readFileSync(path, "utf8");
  const after = ratchetOracleBudgetText(before, id, counts);
  if (after !== before) writeFileSync(path, after, "utf8");
  return after !== before;
}
