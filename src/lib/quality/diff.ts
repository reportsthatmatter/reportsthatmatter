/**
 * reports/quality-last.json: the counts at the last accepted release, written by
 * `pnpm quality ratchet --record`. `pnpm quality report --diff <ref>` compares the current
 * counts with the copy of this file at a git ref and marks regressions, so every ingest
 * release or pin-bump PR carries its before/after table (reportsthatmatter-b78.3).
 */
import { SIGNALS } from "./signals";

export type Recorded = {
  /** What was recorded, for the reader of the diff: the ingest pin and date. */
  ingest: string;
  recorded: string;
  /** report id -> signal id -> count (all signals, advisory included). */
  reports: Record<string, Record<string, number>>;
};

export type Cell = { now: number; before: number | null; delta: number | null; regression: boolean };

const GATED_IDS = new Set(SIGNALS.filter((s) => !s.advisory).map((s) => s.id));

export function cell(signal: string, now: number, before: number | undefined): Cell {
  if (before === undefined) return { now, before: null, delta: null, regression: false };
  const delta = Math.round((now - before) * 10) / 10;
  return { now, before, delta, regression: delta > 0 && GATED_IDS.has(signal) };
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** Markdown for a PR body: signals down, reports across, `now (+delta)` where a count moved, ▲ on a gated regression. */
export function diffTable(last: Recorded | null, current: Record<string, Record<string, number>>, ref: string): string {
  const ids = Object.keys(current);
  const lines: string[] = [];
  const regressions: string[] = [];
  const improvements: string[] = [];
  lines.push(
    last
      ? `Counts now against \`reports/quality-last.json\` at \`${ref}\` (recorded ${last.recorded}, ingest ${last.ingest}). \`▲\` is a regression of a gated signal.`
      : `No \`reports/quality-last.json\` at \`${ref}\`: nothing to compare with, showing current counts only.`,
    "",
    `| signal | ${ids.join(" | ")} |`,
    `|---|${ids.map(() => "---:").join("|")}|`,
  );
  for (const s of SIGNALS) {
    const cells = ids.map((id) => {
      const c = cell(s.id, current[id][s.id], last?.reports[id]?.[s.id]);
      const shown = s.kind === "metric" && c.now ? `${c.now}%` : fmt(c.now);
      if (last && c.before === null) return `${shown} (new)`;
      if (!c.delta) return shown;
      const d = `${c.delta > 0 ? "+" : "−"}${fmt(Math.abs(c.delta))}`;
      if (c.regression) regressions.push(`${id} ${s.id} ${fmt(c.before!)} → ${fmt(c.now)}`);
      else if (c.delta < 0) improvements.push(`${id} ${s.id} ${fmt(c.before!)} → ${fmt(c.now)}`);
      return `${shown} (${d}${c.regression ? " ▲" : ""})`;
    });
    lines.push(`| ${s.id}${s.advisory ? " (advisory)" : ""} | ${cells.join(" | ")} |`);
  }
  if (last) {
    lines.push("", regressions.length ? `**Regressions (${regressions.length}), each needs a bead:**` : "**No regressions.**");
    for (const r of regressions) lines.push(`- ${r}`);
    if (improvements.length) lines.push("", `Improvements (${improvements.length}): run \`pnpm quality ratchet --record\` after merging.`);
    const gone = Object.keys(last.reports).filter((id) => !current[id]);
    if (gone.length) lines.push("", `Reports in the record but not the registry: ${gone.join(", ")}.`);
  }
  return lines.join("\n");
}

export function parseRecorded(text: string): Recorded {
  const doc = JSON.parse(text) as Recorded;
  if (!doc || typeof doc.reports !== "object") throw new Error("quality-last.json has no `reports`");
  return doc;
}

export function serializeRecorded(rec: Recorded): string {
  const reports: Recorded["reports"] = {};
  for (const id of Object.keys(rec.reports).sort()) reports[id] = rec.reports[id];
  return JSON.stringify({ ingest: rec.ingest, recorded: rec.recorded, reports }, null, 2) + "\n";
}
