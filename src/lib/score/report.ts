/**
 * Markdown output of the scorer: a one-line summary per report, a table across
 * reports, and a per-report error report listing the worst examples per
 * metric, clustered by shape, each with its printed page and paragraph id so
 * an agent can open the passage at once.
 */
import type { Manifest } from "./reference";
import { prf, type Example, type ScoreResult } from "./score";
import type { SignalEval } from "./signals";

export type SummaryRow = {
  id: string;
  set: string;
  versionDiffers: boolean;
  boundaryP: number;
  boundaryR: number;
  boundaryF1: number;
  spurious: number;
  missed: number;
  headingP: number;
  headingR: number;
  headingLevel: number;
  markerP: number;
  markerR: number;
  refMarkers: number;
  wer: number;
  oov: number;
  missingWords: number;
  extraWords: number;
  excludedRefWords: number;
  refCoverage: number;
  topClusters: { metric: string; cluster: string; count: number }[];
};

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const n = (x: number) => x.toLocaleString("en-US");

export function clusters(examples: Example[]) {
  const by = new Map<string, Example[]>();
  for (const e of examples) {
    const k = `${e.metric}\u0000${e.cluster}`;
    by.set(k, [...(by.get(k) ?? []), e]);
  }
  return [...by.entries()]
    .map(([k, xs]) => ({ metric: k.split("\u0000")[0], cluster: k.split("\u0000")[1], count: xs.length, examples: xs }))
    .sort((a, b) => b.count - a.count);
}

export function summaryRow(id: string, manifest: Manifest, r: ScoreResult): SummaryRow {
  const b = prf(r.boundaries);
  const h = prf(r.headings);
  const m = prf(r.markers);
  const excluded = r.text.stretches.filter((s) => s.side === "ref").reduce((a, s) => a + s.words, 0);
  const structural = clusters(r.examples.filter((e) => e.metric !== "oov"));
  return {
    id,
    set: manifest.set,
    versionDiffers: !!manifest.version?.differs,
    boundaryP: b.precision,
    boundaryR: b.recall,
    boundaryF1: b.f1,
    spurious: r.boundaries.fp,
    missed: r.boundaries.fn,
    headingP: h.precision,
    headingR: h.recall,
    headingLevel: r.headingLevels.accuracy,
    markerP: m.precision,
    markerR: m.recall,
    refMarkers: r.markers.refTotal,
    wer: r.text.wordErrorRate,
    oov: r.text.oovRate,
    missingWords: r.text.missing,
    extraWords: r.text.extra,
    excludedRefWords: excluded,
    refCoverage: r.text.refWords ? r.text.refWordsIncluded / r.text.refWords : 0,
    topClusters: structural.slice(0, 8).map(({ metric, cluster, count }) => ({ metric, cluster, count })),
  };
}

export function summaryTable(rows: SummaryRow[], signals: SignalEval[][] = []): string {
  const out = [
    "# Alignment scores",
    "",
    "Scored against each report's reference edition (`pnpm score`, reportsthatmatter-38s.2). Boundaries, headings and markers are precision / recall / F1 over the text both editions share; WER is unaligned words over reference words in aligned blocks; OOV is our words the reference never uses. Reference coverage is the share of the reference's words in blocks that aligned (the rest is excluded, not counted as error).",
    "",
    "| report | set | boundary P | R | F1 | spurious splits | missed splits | heading P | R | level acc. | marker P | R | WER | OOV | ref coverage |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows.map(
      (r) =>
        `| ${r.id}${r.versionDiffers ? " (version differs)" : ""} | ${r.set} | ${pct(r.boundaryP)} | ${pct(r.boundaryR)} | ${pct(r.boundaryF1)} | ${n(r.spurious)} | ${n(r.missed)} | ${pct(r.headingP)} | ${pct(r.headingR)} | ${pct(r.headingLevel)} | ${pct(r.markerP)} | ${pct(r.markerR)} | ${pct(r.wer, 2)} | ${pct(r.oov, 2)} | ${pct(r.refCoverage)} |`,
    ),
    "",
    "## Top error clusters",
    "",
    "| report | metric | cluster | count |",
    "|---|---|---|---:|",
    ...rows.flatMap((r) => r.topClusters.map((c) => `| ${r.id} | ${c.metric} | ${c.cluster} | ${n(c.count)} |`)),
    "",
  ];
  if (signals.length) {
    // pooled across reports
    const pooled = new Map<string, SignalEval>();
    for (const evals of signals) {
      for (const e of evals) {
        const p = pooled.get(e.signal) ?? { ...e, findings: 0, located: 0, tp: 0, errors: 0, caught: 0, precision: null, recall: null };
        p.findings += e.findings;
        p.located += e.located;
        p.tp += e.tp;
        p.errors += e.errors;
        p.caught += e.caught;
        pooled.set(e.signal, p);
      }
    }
    const q = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "–");
    out.push(
      "## b78.2 signals against the scorer (pooled over these reports)",
      "",
      "| signal | predicts | findings | located | precision | scorer errors | caught | recall |",
      "|---|---|---:|---:|---:|---:|---:|---:|",
      ...[...pooled.values()].map((e) => `| ${e.signal} | ${e.predicts} | ${e.findings} | ${e.located} | ${q(e.tp, e.located)} | ${e.errors} | ${e.caught} | ${q(e.caught, e.errors)} |`),
      "",
    );
  }
  return out.join("\n");
}

export function sectionTable(r: ScoreResult): string {
  const rows = r.sections
    .filter((s) => s.refWords >= 50)
    .map((s) => {
      const b = prf(s.boundaries);
      const h = prf(s.headings);
      const m = prf(s.markers);
      return `| ${s.section.slice(0, 60)} | ${n(s.refWords)} | ${pct(b.precision)} | ${pct(b.recall)} | ${s.boundaries.fp} | ${s.boundaries.fn} | ${s.headings.tp + s.headings.fn ? pct(h.recall) : "–"} | ${s.headings.tp + s.headings.fp ? pct(h.precision) : "–"} | ${s.markers.tp + s.markers.fn ? pct(m.recall) : "–"} | ${s.refWords ? pct(s.wordErrors / s.refWords, 2) : "–"} | ${s.ourWords ? pct(s.oov / s.ourWords, 2) : "–"} |`;
    });
  return [
    "| section (reference) | ref words | boundary P | R | spurious | missed | heading R | P | marker R | WER | OOV |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows,
  ].join("\n");
}

const where = (e: Example) => [e.page != null ? `p.${e.page}` : "p.?", e.pid ? `?p=${e.pid}` : null, e.line ? `full.md:${e.line}` : null].filter(Boolean).join(" · ");
const esc = (s: string) => s.replace(/\|/g, "\\|");

const METRIC_ORDER = ["spurious-split", "missed-split", "missed-heading", "spurious-heading", "heading-level", "block-type", "note-in-body", "marker", "missing-text", "extra-text", "oov"];
const METRIC_TITLE: Record<string, string> = {
  "spurious-split": "Spurious splits (our block starts inside a reference block)",
  "missed-split": "Missed splits (a reference block start we do not reproduce)",
  "missed-heading": "Missed headings",
  "spurious-heading": "Spurious headings",
  "heading-level": "Heading levels",
  "block-type": "Block type confusions",
  "note-in-body": "Note text in the body",
  marker: "Footnote markers",
  "missing-text": "Missing text (short runs; long runs are excluded stretches)",
  "extra-text": "Extra text in aligned blocks",
  oov: "Out-of-vocabulary words",
};

export function errorReport(id: string, manifest: Manifest, r: ScoreResult, signals: SignalEval[], perCluster = 6): string {
  const row = summaryRow(id, manifest, r);
  const types = Object.keys(r.confusion);
  const cols = [...new Set(types.flatMap((t) => Object.keys(r.confusion[t])))].sort();
  const out: string[] = [
    `# Score: ${id}`,
    "",
    `Reference: ${manifest.edition} (${manifest.set} set). ${manifest.licence}`,
    "",
  ];
  if (manifest.version?.differs) {
    out.push(`**Version differs.** Reference: ${manifest.version.reference}. Ours: ${manifest.version.ours}. ${manifest.version.policy}`, "");
  }
  for (const c of manifest.caveats ?? []) out.push(`- ${c}`);
  out.push(
    "",
    "## Summary",
    "",
    "| metric | value |",
    "|---|---|",
    `| paragraph boundaries | P ${pct(row.boundaryP)} · R ${pct(row.boundaryR)} · F1 ${pct(row.boundaryF1)} (${n(r.boundaries.tp)} right, ${n(r.boundaries.fp)} spurious splits, ${n(r.boundaries.fn)} missed splits) |`,
    `| headings | P ${pct(row.headingP)} · R ${pct(row.headingR)} · level accuracy ${pct(row.headingLevel)} over ${r.headingLevels.pairs} (reference level → our level: ${Object.entries(r.headingLevels.mapping).map(([a, b]) => `${a}→${b}`).join(", ")}) |`,
    `| footnote markers | linking P ${pct(row.markerP)} · R ${pct(row.markerR)}; of ${n(r.markers.refTotal)} reference markers: ${Object.entries(r.markers.outcomes).map(([k, v]) => `${n(v)} ${k}`).join(", ")}; ${n(r.markers.fp)} spurious of ours |`,
    `| text | WER ${pct(r.text.wordErrorRate, 2)}; ${n(r.text.missing)} words missing and ${n(r.text.extra)} extra in short runs; OOV ${pct(r.text.oovRate, 2)} (${n(r.text.oov)} of ${n(r.text.alphaWords)}) |`,
    `| coverage | ${n(r.coverage.refIncluded)} of ${n(r.coverage.refBlocks)} reference blocks aligned (${pct(row.refCoverage)} of its words); ${n(r.coverage.ourAligned)} of ${n(r.coverage.ourBlocks)} of our blocks; ${n(r.coverage.anchors)} anchors |`,
    "",
    "## Excluded stretches (unaligned, 200+ words: not counted as errors)",
    "",
    manifest.version?.differs ? "The editions differ, so these are treated as version differences until shown otherwise." : "Text one edition has and the other does not (front matter, a separately published part, our notes run into the body).",
    "",
    "| side | words | section | starts | page |",
    "|---|---:|---|---|---|",
    ...r.text.stretches.slice(0, 20).map((s) => `| ${s.side} | ${n(s.words)} | ${esc(s.section.slice(0, 50))} | ${esc(s.excerpt)} | ${s.page ?? ""} |`),
    "",
    "## Block types (rows: reference; columns: ours)",
    "",
    `| reference \\ ours | ${cols.join(" | ")} |`,
    `|---|${cols.map(() => "---:").join("|")}|`,
    ...types.sort().map((t) => `| ${t} | ${cols.map((c) => n(r.confusion[t][c] ?? 0)).join(" | ")} |`),
    "",
    "## Per section",
    "",
    sectionTable(r),
    "",
    "## Signals (b78.2) against these errors",
    "",
    "| signal | predicts | findings | located | precision | scorer errors | caught | recall |",
    "|---|---|---:|---:|---:|---:|---:|---:|",
    ...signals.map((e) => `| ${e.signal} | ${e.predicts} | ${e.findings} | ${e.located} | ${e.precision === null ? "–" : pct(e.precision, 0)} | ${e.errors} | ${e.caught} | ${e.recall === null ? "–" : pct(e.recall, 0)} |`),
    "",
    "## Worst examples, by metric and cluster",
    "",
    "Each cluster lists up to six examples spread across the report. `?p=` is the paragraph id of our block (for a quotation, of the paragraph before it); `full.md:N` is the line in reports/<id>/full.md.",
    "",
  );
  const all = clusters(r.examples);
  for (const metric of METRIC_ORDER) {
    const cs = all.filter((c) => c.metric === metric);
    if (!cs.length) continue;
    const total = cs.reduce((a, c) => a + c.count, 0);
    out.push(`### ${METRIC_TITLE[metric]} (${n(total)})`, "");
    for (const c of cs.slice(0, 10)) {
      out.push(`#### ${c.cluster} — ${n(c.count)}`, "");
      let xs = c.examples;
      if (metric === "missing-text" || metric === "extra-text") xs = [...xs].sort((a, b) => b.ref.length + b.ours.length - a.ref.length - a.ours.length);
      const step = metric === "missing-text" || metric === "extra-text" || metric === "oov" ? 1 : Math.max(1, Math.floor(xs.length / perCluster));
      for (let i = 0, k = 0; i < xs.length && k < perCluster; i += step, k++) {
        const e = xs[i];
        out.push(`- ${where(e)}${e.section ? ` · ${e.section.slice(0, 40)}` : ""}`);
        if (e.ours) out.push(`  - ours: ${e.ours}`);
        if (e.ref) out.push(`  - ref: ${e.ref}`);
      }
      out.push("");
    }
  }
  return out.join("\n");
}
