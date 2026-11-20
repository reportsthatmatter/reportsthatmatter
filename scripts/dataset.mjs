/* The per-paragraph dataset (reportsthatmatter-9uog, decision 0029).
 *
 *   pnpm dataset            # after pnpm prerender: write the download files and the Hugging Face folder
 *
 * One row per citable paragraph across every live report (the registry minus `ingested: false`), from the
 * pre-rendered fragments. Writes, all build output (not committed):
 *
 *   assets/generated/data/   what /data serves: reportsthatmatter-paragraphs.csv.gz and .jsonl.gz, licences.json,
 *                            manifest.json (rows and bytes per file). Run it after `pnpm prerender` and before a deploy
 *                            (scripts/deploy-cloudflare.sh does). The files are gzipped because a Workers static asset
 *                            may not exceed 25 MiB.
 *   build/dataset/hf/        the folder to upload to Hugging Face: README.md (the dataset card), data/train.jsonl,
 *                            licences.json. Nothing is uploaded here; see docs/dataset.md for the command.
 *
 * Parquet is not written (no Parquet writer in this repo's dependencies); Hugging Face converts the JSONL itself.
 */
import "./lib/help.mjs";
import { mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { assertFresh } from "./prerender-stamp.mjs";
import { csvHeader, csvLine, jsonlLine, liveReports, reportRows } from "./lib/dataset.ts";
import { datasetCard } from "./lib/dataset-card.ts";
import { LICENCE_LABELS } from "../src/lib/dataset-licences.ts";

const root = join(import.meta.dirname, "..");
assertFresh("dataset");

const reports = liveReports(root);
let csv = csvHeader();
let jsonl = "";
const summaries = [];
for (const report of reports) {
  const rows = reportRows(root, report);
  for (const row of rows) {
    csv += csvLine(row);
    jsonl += jsonlLine(row);
  }
  summaries.push({
    id: report.id,
    title: report.title,
    rows: rows.length,
    kind: report.text_status.kind,
    statement: report.text_status.statement,
    sourceUrl: report.source_url ?? "",
  });
}

const licences = summaries.map((s) => ({
  report: s.id,
  title: s.title,
  rows: s.rows,
  licence: LICENCE_LABELS[s.kind],
  licence_status: s.kind,
  statement: s.statement,
  official_source: s.sourceUrl,
}));
const licencesJson = JSON.stringify(licences, null, 2) + "\n";

const dataDir = join(root, "assets/generated/data");
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
const files = {
  "reportsthatmatter-paragraphs.csv.gz": gzipSync(csv, { level: 9 }),
  "reportsthatmatter-paragraphs.jsonl.gz": gzipSync(jsonl, { level: 9 }),
  "licences.json": Buffer.from(licencesJson),
};
const total = summaries.reduce((n, s) => n + s.rows, 0);
const manifest = {
  rows: total,
  reports: summaries.map((s) => ({ id: s.id, rows: s.rows })),
  files: {},
};
// Workers refuses a static asset over 25 MiB, which would fail the whole deploy at `wrangler deploy`. Say so here,
// before the upload, and warn while there is still room to split the files (by report) first.
const ASSET_LIMIT = 25 * 1024 * 1024;
for (const [name, buf] of Object.entries(files)) {
  if (buf.length > ASSET_LIMIT) {
    console.error(`dataset: ${name} is ${(buf.length / 2 ** 20).toFixed(1)} MiB, over the 25 MiB Workers asset limit; split the files before deploying`);
    process.exit(1);
  }
  if (buf.length > 0.8 * ASSET_LIMIT) console.warn(`dataset: warning: ${name} is ${(buf.length / 2 ** 20).toFixed(1)} MiB, near the 25 MiB Workers asset limit`);
}
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(join(dataDir, name), buf);
  manifest.files[name] = { bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}
manifest.files["reportsthatmatter-paragraphs.csv.gz"].uncompressed_bytes = Buffer.byteLength(csv);
manifest.files["reportsthatmatter-paragraphs.jsonl.gz"].uncompressed_bytes = Buffer.byteLength(jsonl);
writeFileSync(join(dataDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const hfDir = join(root, "build/dataset/hf");
rmSync(hfDir, { recursive: true, force: true });
mkdirSync(join(hfDir, "data"), { recursive: true });
writeFileSync(join(hfDir, "data/train.jsonl"), jsonl);
writeFileSync(join(hfDir, "licences.json"), licencesJson);
const date = new Date().toISOString().slice(0, 10);
writeFileSync(join(hfDir, "README.md"), datasetCard(summaries, date));

console.log(`${total.toLocaleString()} rows from ${summaries.length} reports`);
for (const s of summaries) console.log(`  ${s.rows.toString().padStart(7)}  ${s.id}`);
for (const [name, m] of Object.entries(manifest.files)) console.log(`${(m.bytes / 1e6).toFixed(1).padStart(7)} MB  assets/generated/data/${name}`);
console.log(`${(statSync(join(hfDir, "data/train.jsonl")).size / 1e6).toFixed(1).padStart(7)} MB  build/dataset/hf/data/train.jsonl`);
