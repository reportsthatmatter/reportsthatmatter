/**
 * `tsx scripts/ingest/snapshot.ts <out.json> <id> [<id>...]`: what the site currently renders for each report, as
 * JSON for `scripts/lib/render-diff.ts`. Run as a subprocess by `pnpm ingest try` before and after linking an
 * unreleased ingest, so each snapshot is taken by the ingest build whose output it holds.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { extractPassages } from "@rtm/ingest";
import { measure, SIGNALS } from "../../src/lib/quality/index.ts";
import { parseBudgetFile } from "../../src/lib/quality/budget.ts";
import type { Snapshot } from "../lib/render-diff.ts";

const root = join(import.meta.dirname, "../..");
const [out, ...ids] = process.argv.slice(2);
const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8")) as { reports: Array<{ id: string; source_path: string }> };
const budgets = parseBudgetFile(readFileSync(join(root, "reports/quality-budget.yaml"), "utf8"));

const snapshots: Snapshot[] = ids.map((id) => {
  const report = registry.reports.find((r) => r.id === id);
  if (!report) throw new Error(`${id} is not in reports/registry.yaml`);
  const dir = join(root, `assets/generated/reports/${id}`);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const html = readFileSync(join(dir, "full-body.html"), "utf8");
  const sectionOf: Record<string, string> = meta.paragraphToSection;
  const paragraphs = extractPassages(html).map((p) => ({ id: p.paragraphId, text: p.text, section: sectionOf[p.paragraphId] ?? "" }));
  const perSection = new Map<string, number>();
  for (const p of paragraphs) perSection.set(p.section, (perSection.get(p.section) ?? 0) + 1);
  const markdown = readFileSync(join(root, report.source_path), "utf8");
  const measured = measure({ markdown, html, meta, citationVocabulary: budgets.reports[id]?.citationVocabulary });
  const quality = measured.counts;
  return {
    id,
    words: meta.words,
    sections: meta.sections.map((s: { slug: string; title: string }) => ({ slug: s.slug, title: s.title, paragraphs: perSection.get(s.slug) ?? 0 })),
    paragraphs,
    sidenotes: Object.keys(sectionOf).filter((k) => k.startsWith("sn-")),
    quality,
    // count signals only: a metric's finding is its value, which the counts table already shows moving
    qualityFindings: SIGNALS.filter((s) => s.kind !== "metric").flatMap((s) => measured.findings[s.id] ?? []),
  };
});
writeFileSync(out, JSON.stringify(snapshots));
