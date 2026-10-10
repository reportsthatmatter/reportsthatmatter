/**
 * The corpus baseline: one file per report, `reports/corpus-baseline/<id>.json`, holding that report's
 * fingerprint (words, paragraphs, per-section ids hash; see scripts/corpus.mjs).
 *
 * It used to be one `reports/corpus-baseline.json` for the whole corpus. Every PR that moved a report
 * rewrote a block of that file, so concurrent PRs conflicted on it at every integration and the integrator
 * took main's version and re-accepted (reportsthatmatter-v95z). One file per report means two PRs conflict
 * only if they move the same report, and a merge keeps both sides' accepts.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const baselineDir = (root: string) => join(root, "reports/corpus-baseline");
const fileOf = (root: string, id: string) => join(baselineDir(root), `${id}.json`);

/** Every accepted report's fingerprint, by id (empty when nothing has been accepted). */
export function readCorpusBaseline(root: string): Record<string, any> {
  const dir = baselineDir(root);
  if (!existsSync(dir)) return {};
  const out: Record<string, any> = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    out[f.slice(0, -".json".length)] = JSON.parse(readFileSync(join(dir, f), "utf8"));
  }
  return out;
}

export const hasCorpusBaseline = (root: string) => existsSync(baselineDir(root));

/** Write one report's accepted fingerprint. */
export function acceptReport(root: string, id: string, fingerprint: unknown): void {
  mkdirSync(baselineDir(root), { recursive: true });
  writeFileSync(fileOf(root, id), JSON.stringify(fingerprint, null, 2) + "\n");
}

/** Replace the whole baseline: write every report, delete files for reports no longer in the corpus. */
export function acceptAll(root: string, corpus: Record<string, unknown>): void {
  for (const id of Object.keys(readCorpusBaseline(root))) if (!(id in corpus)) rmSync(fileOf(root, id));
  for (const [id, fingerprint] of Object.entries(corpus)) acceptReport(root, id, fingerprint);
}
