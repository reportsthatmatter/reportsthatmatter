/**
 * Decision records in docs/decisions/: read them, check their numbering, and print the index.
 *
 * Records are `NNNN-<slug>.md` with a `# NNNN. Question` title and a `- **Status:**` line (the template is
 * 0000-template.md). The index is generated from them (`pnpm decisions`) and is not committed: a table in
 * README.md was appended to by every decision PR and conflicted at each integration (reportsthatmatter-d4es).
 * `checkDecisions` is what tests/decisions.test.ts runs: two records with one number, or a title that
 * disagrees with its file name, fail CI, so the renumber happens before merge (reportsthatmatter-js2r).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Decision {
  file: string;
  /** The 4-digit prefix of the file name. */
  number: string;
  /** The number the `# NNNN.` title carries, or null if the title is malformed. */
  titleNumber: string | null;
  question: string;
  status: string;
  decided: string;
  bead: string;
}

const RECORD = /^(\d{4})-.+\.md$/;

/** Every record in `dir` (the template 0000 included only if asked), sorted by file name. */
export function readDecisions(dir: string, { template = false } = {}): Decision[] {
  return readdirSync(dir)
    .filter((f) => RECORD.test(f) && (template || !f.startsWith("0000-")))
    .sort()
    .map((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      const title = text.match(/^# (\d{4})\. (.+)$/m);
      const field = (name: string) => text.match(new RegExp(`^- \\*\\*${name}:\\*\\* (.*)$`, "m"))?.[1].trim() ?? "";
      const decided = text.match(/\*\*Date decided:\*\* (\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
      // The bead marked "(this decision)" if the line marks one, else the first bead named.
      const id = "reportsthatmatter-([a-z0-9]+(?:\\.\\d+)*)";
      const bead = field("Beads").match(new RegExp(`${id} \\(this decision`))?.[1] ?? field("Beads").match(new RegExp(id))?.[1] ?? "";
      return {
        file,
        number: file.slice(0, 4),
        titleNumber: title?.[1] ?? null,
        question: title?.[2] ?? "",
        status: field("Status"),
        decided,
        bead,
      };
    });
}

/** What is wrong with the numbering of the records in `dir`; empty when sound. */
export function checkDecisions(dir: string): string[] {
  const records = readDecisions(dir);
  const problems: string[] = [];
  const byNumber = new Map<string, string[]>();
  for (const r of records) byNumber.set(r.number, [...(byNumber.get(r.number) ?? []), r.file]);
  for (const [number, files] of byNumber) {
    if (files.length > 1) problems.push(`number ${number} is taken by ${files.length} records: ${files.join(", ")}. Rebase on origin/main and renumber yours to the next free number (and fix the references to it)`);
  }
  for (const r of records) {
    if (r.titleNumber === null) problems.push(`${r.file}: the title must read "# ${r.number}. <question>"`);
    else if (r.titleNumber !== r.number) problems.push(`${r.file}: the title says ${r.titleNumber}, the file name says ${r.number}`);
    if (!r.status) problems.push(`${r.file}: no "- **Status:**" line`);
  }
  return problems;
}

/** The next free number: one past the highest taken. */
export const nextNumber = (dir: string): string =>
  String(Math.max(0, ...readDecisions(dir, { template: true }).map((r) => Number(r.number))) + 1).padStart(4, "0");

/** The index as a markdown table, one row per record. */
export function decisionIndex(dir: string): string {
  const cell = (s: string) => s.replace(/\|/g, "\\|");
  const rows = readDecisions(dir).map((r) => {
    const status = r.decided && !r.status.includes(r.decided) ? `${r.status} ${r.decided}` : r.status;
    return `| [${r.number}](${r.file}) | ${cell(r.question)} | ${cell(status)} | ${r.bead || "—"} |`;
  });
  return ["| # | Question | Status | Bead |", "|---|---|---|---|", ...rows].join("\n");
}
