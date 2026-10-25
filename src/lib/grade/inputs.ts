/**
 * Reading the committed records into `GradeInput`s (38s.16, 38s.19). Nothing here runs a check: it reads
 * reports/registry.yaml, reports/<id>/full.md and aliases.yaml, reports/verify-last.json, reports/anchor-budget.yaml,
 * reports/referee-last.json and docs/scores.json, and each report repo's ingest.ts (for cleanEdition).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { MIN_RANDOM_BREAKS, type GradeInput, type PageBreaks } from "./grade";

export type RefereeRecord = { ingest: string | null; recorded: string; reports: Record<string, { random: { judged: number; wrong: number }; all: { judged: number; wrong: number } }> };

/** Summarise `pnpm ingest referee eval --labels-out` rows (one per adjudicated break) into reports/referee-last.json's shape. `after` is the served call (rules plus the report's committed cache). */
export function summariseReferee(jsonl: string, ingest: string | null, recorded: string): RefereeRecord {
  const reports: RefereeRecord["reports"] = {};
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as { report: string; stratum?: string; truth: string; after: string | null };
    if (r.after === null) continue;
    const e = (reports[r.report] ??= { random: { judged: 0, wrong: 0 }, all: { judged: 0, wrong: 0 } });
    const wrong = r.after !== r.truth ? 1 : 0;
    e.all.judged++;
    e.all.wrong += wrong;
    if (r.stratum === "random") {
      e.random.judged++;
      e.random.wrong += wrong;
    }
  }
  return { ingest, recorded, reports };
}

const readJson = (p: string) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

export function pageBreaksFor(id: string, referee: RefereeRecord | null, scores: any): PageBreaks | null {
  const r = referee?.reports?.[id];
  if (r && r.all.judged) {
    const useRandom = r.random.judged >= MIN_RANDOM_BREAKS;
    const s = useRandom ? r.random : r.all;
    return { source: "mini-reference", wrong: s.wrong, judged: s.judged, stratum: useRandom ? "random" : "all" };
  }
  const m = scores?.reports?.[id]?.metrics;
  if (m && m.join_adj_judged) return { source: "reference", wrong: m.join_adj_ours_wrong ?? 0, judged: m.join_adj_judged, stratum: "all" };
  return null;
}

export function readInputs(root: string, opts: { verify?: any; reportDir?: (id: string) => string } = {}): { inputs: GradeInput[]; verify: any; ingest: string | null } {
  const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8")) as { reports: Array<{ id: string }> };
  const verify = opts.verify ?? readJson(join(root, "reports/verify-last.json")) ?? { reports: {}, oracleVsGolden: {} };
  const anchors = (parse(readFileSync(join(root, "reports/anchor-budget.yaml"), "utf8")) ?? {}).reports ?? {};
  const scores = readJson(join(root, "docs/scores.json"));
  const referee = readJson(join(root, "reports/referee-last.json")) as RefereeRecord | null;
  const quality = readJson(join(root, "reports/quality-last.json"));
  const dirOf = opts.reportDir ?? ((id: string) => join(root, "reports", id));
  const inputs: GradeInput[] = registry.reports.map(({ id }) => {
    const fullPath = join(root, "reports", id, "full.md");
    const full = existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
    const pages = (full.match(/^%%page /gm) ?? []).length;
    const words = full.split(/\s+/).filter(Boolean).length;
    const aliasPath = join(root, "reports", id, "aliases.yaml");
    const al = existsSync(aliasPath) ? ((parse(readFileSync(aliasPath, "utf8")) ?? {}) as any) : null;
    const ingestTs = join(dirOf(id), "ingest.ts");
    const cleanEdition = existsSync(ingestTs) && /\bcleanEdition\s*\(/.test(readFileSync(ingestTs, "utf8"));
    const m = scores?.reports?.[id]?.metrics;
    const v = verify.reports?.[id];
    return {
      id,
      pages,
      words,
      cleanEdition,
      oracle: v?.oracle ?? null,
      ...(v?.goldenOracle ? { goldenOracle: v.goldenOracle } : {}),
      pooled: verify.oracleVsGolden ?? {},
      anchors: anchors[id] ?? null,
      aliases: al ? { unmatched: (al.unmatched ?? []).length, reused: Object.keys(al.reused ?? {}).length } : null,
      pageBreaks: pageBreaksFor(id, referee, scores),
      werPages: m && typeof m.wer_pages === "number" ? { wer: m.wer_pages, pages: m.wer_pages_n ?? 0 } : null,
    };
  });
  return { inputs, verify, ingest: quality?.ingest ?? scores?.ingest ?? null };
}
