/* Staleness stamp for assets/generated/ (reportsthatmatter-ue9).
 *
 * `pnpm prerender` writes assets/generated/.prerender-stamp: a hash of
 * everything prerender reads. Anything that reads the generated output
 * (`pnpm corpus check`, `pnpm quality check`, vitest) compares the stamp with a
 * fresh hash of those inputs and refuses to run on a mismatch, instead of
 * passing against output from before the edit. A content hash, not mtimes:
 * git checkouts, rebases and worktrees reset mtimes without changing content.
 *
 * Inputs: reports/registry.yaml, every registered report's source_path
 * (full.md) and PROCESSING.md, the @rtm/ingest pin in package.json plus the
 * installed copy's package.json (a `link:` override changes node_modules, not
 * the pin), and scripts/prerender.mjs itself. src/ is deliberately not an
 * input: prerender.mjs imports nothing from src/ (rendering lives in
 * @rtm/ingest), so no src/ file can change its output. If that ever changes,
 * add the file to inputFiles() below.
 *
 *   node scripts/prerender-stamp.mjs   # exit 1 + "run pnpm prerender" if stale
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const root = join(import.meta.dirname, "..");
export const STAMP_PATH = join(root, "assets/generated/.prerender-stamp");

function ingestPin() {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies?.["@rtm/ingest"] ?? "";
}

function inputFiles() {
  const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
  const files = ["reports/registry.yaml", "scripts/prerender.mjs", "node_modules/@rtm/ingest/package.json"];
  for (const report of registry.reports) {
    files.push(report.source_path, `reports/${report.id}/PROCESSING.md`);
  }
  return files;
}

export function inputsHash() {
  const hash = createHash("sha256");
  hash.update(`pin:${ingestPin()}\n`);
  for (const file of inputFiles()) {
    const path = join(root, file);
    hash.update(`${file}:${existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : "absent"}\n`);
  }
  return hash.digest("hex");
}

export function writeStamp() {
  writeFileSync(STAMP_PATH, inputsHash() + "\n");
}

/** null when assets/generated/ matches its inputs, else the reason it does not. */
export function staleReason() {
  if (!existsSync(join(root, "assets/generated/sitemap-urls.json"))) return "assets/generated/ is missing";
  if (!existsSync(STAMP_PATH)) return "assets/generated/ has no stamp (written before staleness checks existed)";
  if (readFileSync(STAMP_PATH, "utf8").trim() !== inputsHash()) {
    return "assets/generated/ is older than its inputs (a reports/*/full.md, PROCESSING.md, the registry, the @rtm/ingest pin or install, or scripts/prerender.mjs changed since the last prerender)";
  }
  return null;
}

export function assertFresh(who) {
  const reason = staleReason();
  if (!reason) return;
  console.error(`${who}: refusing to run, ${reason}.\nRun: pnpm prerender`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) assertFresh("prerender-stamp");
