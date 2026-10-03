/* Publishes one report's rendered content to R2 + D1, through the endpoint.
 *
 *   RTM_PUBLISH_SECRET=… pnpm publish-report <id> [--base https://…]
 *   RTM_PUBLISH_SECRET=… pnpm publish-report <id> --status
 *   RTM_PUBLISH_SECRET=… pnpm publish-report <id> --rollback <hash>
 *   pnpm publish-report --all --status [--base https://…]   (no secret: local vs served hash per report)
 *   pnpm publish-report <id> --preflight [--base https://…]   (no secret: can D1 take writes, and does this fit?)
 *   pnpm publish-report <id> --dry-run [--base https://…]     (no secret: what would be uploaded, and the row writes)
 *
 * Reads what `pnpm prerender` produced, uploads it under a content hash, then
 * asks the endpoint to point at it. The endpoint re-derives the hash and
 * checks every object before it writes the pointer, so this script cannot
 * publish a version that would 404 in production — see @rtm/ingest's
 * src/publish.ts, which this and the Worker's route handlers both import, so
 * client-side and server-side hashing can't drift apart.
 *
 * A report repo can now publish itself directly — `rtm-publish` in
 * @rtm/ingest is the same two-phase protocol against its own `full.md`,
 * rather than this repo's `assets/generated/`. This script still exists for
 * the reports that haven't moved to publishing themselves yet, and it, not
 * yet `rtm-publish`, is what triggers the search reindex below.
 *
 * The search reindex writes only the paragraphs that changed (reportsthatmatter-h6b, -ewm0): D1's free
 * tier is 100,000 row writes a day and rewriting every paragraph of every published report spent it. A real
 * publish probes D1 first (`--preflight`, skipped with --no-preflight) so a spent quota stops it before
 * anything is uploaded, and `--dry-run` prints the object count, the served version and the estimated
 * writes without writing anything. `--full-reindex` is the old whole-report rewrite.
 *
 * A publish against a real deploy also reindexes this report for search
 * (`./scripts/reindex-search.sh`, reportsthatmatter-7np) — search content
 * and R2 content used to drift independently, with no gate that would
 * notice. Pass --no-reindex to skip it (e.g. re-publishing an unchanged
 * version), or run `./scripts/reindex-search.sh <id>` yourself later.
 * Skipped automatically against localhost, where there is no meaningful
 * "remote" D1 to reindex. **This does not cover `--rollback`**: rolling back
 * repoints at an *older* hash, but this only knows how to build a search
 * index from what is *currently* prerendered on disk, which is the new text
 * — reindexing there would make search describe content nobody is being
 * served. Reindex by hand after a rollback once the matching text is
 * prerendered again.
 */
import "./lib/help.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { contentHash, extractPassages, manifestFor, tokenFor } from "@rtm/ingest";
import { readLocalFiles } from "./lib/publish-local.mjs";
import { wranglerRunner } from "./lib/d1.ts";
import { FREE_TIER_DAILY_WRITES, probeWrite, rowsWrittenToday, verdict } from "./lib/d1-probe.ts";
import { describePlan, planReport } from "./lib/reindex-run.ts";
import { DEFAULT_COST } from "./lib/reindex.ts";

const args = process.argv.slice(2);
// `--all --status`: which reports must be republished? A read-only table, no secret (scripts/publish-status.mjs).
if (args.includes("--all")) await import("./publish-status.mjs");
const reportId = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? true;
};

if (!reportId || reportId.startsWith("--")) {
  console.error(
    "Usage: pnpm publish-report <id> [--base <url>] [--status] [--rollback <hash>] [--no-reindex] [--no-preflight] [--full-reindex]\n       pnpm publish-report <id> --preflight | --dry-run [--base <url>] [--limit <daily row writes>]\n       pnpm publish-report --all --status [--base <url>]   # which reports need publishing"
  );
  process.exit(2);
}

const base = flag("--base") ?? "http://localhost:8799";
const isLocal = base.includes("localhost") || base.includes("127.0.0.1");
const d1Target = isLocal ? "--local" : "--remote";
const root = join(import.meta.dirname, "..");
const run = wranglerRunner(root);
const limit = Number(flag("--limit") ?? FREE_TIER_DAILY_WRITES);

/**
 * Can D1 take writes, what does a search row cost, and does this publish fit today's headroom? Prints the answer
 * and returns `{ ok }`: false only when D1 refused the probe (quota spent) or the estimate is known not to fit. A
 * probe that fails for another reason (wrangler not logged in) warns and goes on: the publish itself is HTTP and
 * does not need wrangler.
 */
async function checkD1({ reindex }) {
  console.log(`D1 preflight (${isLocal ? "local" : "remote"} reportsthatmatter-marks)`);
  const probe = probeWrite(run, d1Target);
  const cost = probe.ok ? probe.cost : DEFAULT_COST;
  const planned = reindex && probe.ok ? reindexPlan(cost) : null;
  // + 1: the commit's own report_versions row.
  const needed = (planned?.writes ?? 0) + 1;
  const dbId = (readFileSync(join(root, "wrangler.toml"), "utf8").match(/database_id\s*=\s*"([^"]+)"/) ?? [])[1];
  const used = probe.ok && !isLocal
    ? await rowsWrittenToday(fetch, { token: process.env.CLOUDFLARE_API_TOKEN, account: process.env.CLOUDFLARE_ACCOUNT_ID, databaseId: dbId })
    : null;
  const result = verdict(probe, needed, used, limit, new Date());
  console.log(result.lines.join("\n"));
  return { ok: !result.blocked, planned, cost };
}

/** The reindex's row writes, from reading what is indexed now (reads only). Null when it cannot be read. */
function reindexPlan(cost) {
  try {
    const planned = planReport({ root, report: reportId, target: d1Target, run, extract: extractPassages, cost });
    console.log(describePlan(planned).replace(/^/gm, "  "));
    return planned;
  } catch (error) {
    console.log(`  (could not read the search index to estimate its writes: ${String(error.message).trim().split("\n").pop()})`);
    return null;
  }
}

if (flag("--preflight") && !flag("--dry-run")) {
  const check = await checkD1({ reindex: !flag("--no-reindex") });
  process.exit(check.ok ? 0 : 1);
}

if (flag("--dry-run")) {
  const files = readLocalFiles(process.cwd(), reportId);
  const manifest = await manifestFor(files);
  const hash = await contentHash(manifest);
  const bytes = files.reduce((total, file) => total + Buffer.byteLength(file.body), 0);
  let served = "unknown";
  try {
    const response = await fetch(`${base}/reports/${reportId}`, { method: "HEAD", redirect: "manual" });
    served = response.headers.get("x-rtm-content-version") ?? `${response.status}`;
  } catch (error) {
    served = `unreachable (${error.cause?.code ?? error.message})`;
  }
  console.log(`${reportId}: dry run, nothing is uploaded or written`);
  console.log(`  ${files.length} object(s), ${(bytes / 1048576).toFixed(1)} MB → ${hash}; the site serves ${served}${served === hash ? " (unchanged: nothing to publish)" : ""}`);
  const planned = flag("--offline") ? null : reindexPlan(DEFAULT_COST);
  const total = (planned?.writes ?? 0) + 1;
  console.log(`  estimated D1 row writes: ${total.toLocaleString()}${planned ? ` (${planned.writes.toLocaleString()} search reindex + 1 version row; ${DEFAULT_COST.insert} per row inserted or deleted, measured locally; --preflight reads D1's own figure)` : " (offline: the reindex diff needs D1 reads; pass no --offline)"}`);
  process.exit(0);
}

const secret = process.env.RTM_PUBLISH_SECRET;
if (!secret) {
  console.error("RTM_PUBLISH_SECRET is not set. It is the Worker's PUBLISH_SECRET.");
  process.exit(2);
}

const token = await tokenFor(secret, reportId);

async function call(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { error: text.slice(0, 300) };
  }
  if (!response.ok) {
    console.error(`${response.status} ${path}`);
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }
  return parsed;
}

if (flag("--status")) {
  console.log(JSON.stringify(await call(`/internal/publish/${reportId}`), null, 2));
  process.exit(0);
}

const rollbackTo = flag("--rollback");

// Ask D1 before uploading anything: a spent daily quota fails the commit after the objects are in R2
// (reportsthatmatter-h6b). Skipped against localhost and with --no-preflight.
if (!isLocal && !flag("--no-preflight")) {
  const check = await checkD1({ reindex: !flag("--no-reindex") && typeof rollbackTo !== "string" });
  if (!check.ok) {
    console.error(`\nNot publishing ${reportId}: nothing was uploaded. (--no-preflight to go ahead anyway.)`);
    process.exit(1);
  }
}

const files = readLocalFiles(process.cwd(), reportId);

// The report's own quality row (counts, budgets, last release) goes in the publish log; never blocks.
try {
  process.stdout.write(
    execFileSync("pnpm", ["--silent", "quality", "row", reportId], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  );
} catch {
  console.log(`(no quality row for ${reportId}: run pnpm quality row ${reportId})`);
}

const manifest = await manifestFor(files);
const hash = typeof rollbackTo === "string" ? rollbackTo : await contentHash(manifest);
const bytes = files.reduce((total, file) => total + Buffer.byteLength(file.body), 0);

console.log(
  `${reportId}: ${files.length} object(s), ${(bytes / 1048576).toFixed(1)} MB → ${hash}` +
    (typeof rollbackTo === "string" ? " (rollback)" : "")
);

if (typeof rollbackTo !== "string") {
  // Batched by bytes, not by count: a fragment ranges from a few hundred
  // bytes to most of a megabyte, so a fixed batch size is either wasteful or
  // over the request limit depending on which report it meets.
  const MAX_BATCH = 4 * 1024 * 1024;
  let batch = [];
  let size = 0;
  let written = 0;

  const flush = async () => {
    if (!batch.length) return;
    const result = await call(`/internal/publish/${reportId}/objects`, { hash, files: batch });
    written += result.written;
    process.stdout.write(`\r  uploaded ${written}/${files.length}`);
    batch = [];
    size = 0;
  };

  for (const file of files) {
    const length = Buffer.byteLength(file.body);
    if (batch.length && size + length > MAX_BATCH) await flush();
    batch.push(file);
    size += length;
  }
  await flush();
  process.stdout.write("\n");
}

const result = await call(`/internal/publish/${reportId}/commit`, { hash, manifest });
console.log(`  ✓ serving ${result.version} (${result.objects} objects)`);

// See the file header: only for a normal (non-rollback) publish, and only
// against a real deploy — reindexing localhost's D1 from here would be
// meaningless, and a rollback's text isn't what's on disk right now.
const isRollback = typeof rollbackTo === "string";
if (!isRollback && !isLocal && !flag("--no-reindex")) {
  console.log(`  reindexing ${reportId} for search...`);
  try {
    execFileSync("./scripts/reindex-search.sh", [reportId, ...(flag("--full-reindex") ? ["--full"] : [])], { stdio: "inherit" });
  } catch (error) {
    // A failed reindex must not read as a failed publish — the content is
    // already live and correct. Say so loudly and leave the fix to a rerun
    // of the one command named here, not a re-publish.
    console.error(
      `  ⚠ search reindex failed (content is still published correctly): ${error.message}\n` +
        `    retry with: ./scripts/reindex-search.sh ${reportId}`
    );
  }
} else if (isRollback) {
  console.log(`  (search not reindexed — rolled back; see file header)`);
}
