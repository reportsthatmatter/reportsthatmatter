/* `pnpm pipeline status [--board] [--check] [--network] [--base <url>] [--deep] [--verbose] [--json]`
 *
 * For each unit in reports/pipeline.yaml: the stage its artefacts show it has reached, checked against
 * the stage recorded, and the next action. See scripts/lib/pipeline-status.ts for what is derived and
 * how a claim is judged (reportsthatmatter-ifb5.9).
 *
 *   --board     every row by stage instead: Inbox (open report-idea issues; with --network), Backlog (candidate
 *               rows, next first), In preparation, Live (project 2601)
 *   --check     exit 1 on drift (a claim the artefacts do not support, or a record that is behind them)
 *   --network   also compare the served content hash with this checkout's prerender (publish-report
 *               --all --status's code; needs `pnpm prerender`); --base defaults to production
 *   --deep      recompute the SHA-256 of every pinned archive file
 *   --verbose   print every gate item, not just the problems
 *   --json      machine-readable
 *
 * Without --network, and for a sibling report repo that is not checked out, the items that need them are
 * "unknown", which is never drift.
 */
import "./lib/help.mjs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildBoard, formatBoard, formatStatus, hasDrift, pipelineStatus } from "./lib/pipeline-status.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? true;
};

if (args[0] !== "status") {
  console.error("Usage: pnpm pipeline status [--board] [--check] [--network] [--base <url>] [--deep] [--verbose] [--json]");
  process.exit(2);
}

let publish;
if (args.includes("--network")) {
  const base = String(flag("--base") ?? "https://reportsthatmatter.org").replace(/\/$/, "");
  const { assertFresh } = await import("./prerender-stamp.mjs");
  const { localHash } = await import("./lib/publish-local.mjs");
  let freshness = null;
  try {
    assertFresh("pnpm pipeline status --network");
  } catch (error) {
    freshness = error.message?.split("\n")[0] ?? String(error);
  }
  publish = async (id) => {
    if (freshness) return { error: freshness };
    try {
      const response = await fetch(`${base}/reports/${id}`, { method: "HEAD", redirect: "manual" });
      const served = response.headers.get("x-rtm-content-version");
      if (!served) return { error: `${base}: ${response.status}, no x-rtm-content-version` };
      return { local: await localHash(root, id), served };
    } catch (error) {
      return { error: `unreachable: ${error.cause?.code ?? error.message}` };
    }
  };
}

const result = await pipelineStatus({ root, deep: args.includes("--deep"), publish, env: process.env });
if (args.includes("--board")) {
  let inbox = null;
  if (args.includes("--network")) {
    try {
      const out = execFileSync("gh", ["issue", "list", "--repo", "reportsthatmatter/reportsthatmatter", "--label", "report-idea", "--state", "open", "--limit", "200", "--json", "number,title"], { encoding: "utf8" });
      inbox = JSON.parse(out);
    } catch (error) {
      inbox = { error: String(error.stderr || error.message).split("\n")[0] };
    }
  }
  const board = buildBoard(result, { root, inbox });
  console.log(args.includes("--json") ? JSON.stringify(board, null, 2) : formatBoard(board));
  process.exit(args.includes("--check") && hasDrift(result) ? 1 : 0);
}
if (args.includes("--json")) console.log(JSON.stringify({ drift: hasDrift(result), ...result }, null, 2));
else console.log(formatStatus(result, args.includes("--verbose")));
process.exit(args.includes("--check") && hasDrift(result) ? 1 : 0);
