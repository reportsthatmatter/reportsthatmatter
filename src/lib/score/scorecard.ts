/**
 * The release scorecard (38s.6): parsing `pnpm ingest verify` into the oracle counts and golden-page tables,
 * and diffing them against the copy recorded at the last release (reports/verify-last.json).
 */
export type VerifyReport = { oracle: Record<string, number> | null; golden: { match: number; total: number; known: number } | null };
export type VerifyRecord = { reports: Record<string, VerifyReport>; oracleVsGolden: Record<string, { tp: number; fp: number; fn: number }> };

const ANSI = /\x1b\[[0-9;]*m/g;

export function parseVerify(output: string): VerifyRecord {
  const reports: Record<string, VerifyReport> = {};
  const oracleVsGolden: VerifyRecord["oracleVsGolden"] = {};
  let current: string | null = null;
  let inTable = false;
  for (const line of output.replace(ANSI, "").split("\n")) {
    if (/^[a-z0-9][a-z0-9-]*$/.test(line)) {
      current = line;
      reports[current] = { oracle: null, golden: null };
      inTable = false;
      continue;
    }
    if (line.startsWith("oracle against golden pages")) {
      current = null;
      inTable = true;
      continue;
    }
    if (inTable) {
      const m = line.match(/^\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+/);
      if (m && m[1] !== "signal") oracleVsGolden[m[1]] = { tp: +m[2], fp: +m[3], fn: +m[4] };
      continue;
    }
    if (!current) continue;
    const o = line.match(/layout oracle \([\d.]+s\) — (.+)$/);
    if (o) reports[current].oracle = Object.fromEntries([...o[1].matchAll(/([a-z-]+) (\d+)/g)].map((m) => [m[1], +m[2]]));
    const g = line.match(/golden pages — (\d+)\/(\d+) match the PDF(?:, (\d+) known failure)?/);
    if (g) reports[current].golden = { match: +g[1], total: +g[2], known: +(g[3] ?? 0) };
  }
  return { reports, oracleVsGolden };
}

const d = (now: number, was: number | undefined) => (was === undefined || was === now ? "" : ` (${now - was > 0 ? "+" : ""}${now - was})`);

/** The oracle's counts per report, with the change since `base`. Lower is better, so a rise is marked. */
export function oracleTable(now: VerifyRecord, base: VerifyRecord | null): string {
  const signals = [...new Set(Object.values(now.reports).flatMap((r) => Object.keys(r.oracle ?? {})))];
  const lines = [`| report | ${signals.join(" | ")} |`, `|---|${signals.map(() => "---:").join("|")}|`];
  for (const [id, r] of Object.entries(now.reports)) {
    if (!r.oracle) continue;
    const was = base?.reports[id]?.oracle;
    lines.push(`| ${id} | ${signals.map((s) => `${r.oracle![s] ?? 0}${d(r.oracle![s] ?? 0, was?.[s])}${was && (r.oracle![s] ?? 0) > (was[s] ?? 0) ? " ▲" : ""}`).join(" | ")} |`);
  }
  return lines.join("\n");
}

/** Golden pages per report: matching in full, known failures, and the change since `base`. A match lost is marked. */
export function goldenTable(now: VerifyRecord, base: VerifyRecord | null): string {
  const lines = ["| report | golden pages | match in full | known failures |", "|---|---:|---:|---:|"];
  let t = { total: 0, match: 0, known: 0 };
  for (const [id, r] of Object.entries(now.reports)) {
    if (!r.golden) continue;
    const was = base?.reports[id]?.golden;
    t = { total: t.total + r.golden.total, match: t.match + r.golden.match, known: t.known + r.golden.known };
    lines.push(`| ${id} | ${r.golden.total}${d(r.golden.total, was?.total)} | ${r.golden.match}${d(r.golden.match, was?.match)}${was && r.golden.match < was.match ? " ▼" : ""} | ${r.golden.known}${d(r.golden.known, was?.known)} |`);
  }
  lines.push(`| **all** | ${t.total} | ${t.match} | ${t.known} |`);
  return lines.join("\n");
}

/** The oracle's tp/fp/fn against golden pages, all reports, with precision and recall. */
export function precisionTable(now: VerifyRecord, base: VerifyRecord | null): string {
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "n/a");
  const lines = ["| signal | tp | fp | fn | precision | recall |", "|---|---:|---:|---:|---:|---:|"];
  for (const [s, v] of Object.entries(now.oracleVsGolden)) {
    const w = base?.oracleVsGolden[s];
    lines.push(`| ${s} | ${v.tp}${d(v.tp, w?.tp)} | ${v.fp}${d(v.fp, w?.fp)} | ${v.fn}${d(v.fn, w?.fn)} | ${pct(v.tp, v.tp + v.fp)} | ${pct(v.tp, v.tp + v.fn)} |`);
  }
  return lines.join("\n");
}
