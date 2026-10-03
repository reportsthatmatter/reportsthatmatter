/* `pnpm publish-report --all --status [--base <url>] [--fail-on-drift]`: must any report be republished?
 *
 * For every report in reports/registry.yaml, the content hash this checkout's prerender would publish
 * against the hash the site serves (reportsthatmatter-6px). Integrators used to hand-roll a script that
 * hashed the prerenders and compared them with the served versions; this is that script. Read-only:
 * uploads nothing, needs no secret. `pnpm prerender` first (it refuses on a stale prerender).
 *
 *   pnpm publish-report --all --status --base https://reportsthatmatter.org
 *
 * Exits 0 whatever it finds, so deploy-cloudflare.sh can print it; --fail-on-drift exits 1 when any
 * report needs publishing or could not be read.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { assertFresh } from "./prerender-stamp.mjs";
import { localHash } from "./lib/publish-local.mjs";
import { classify, formatTable } from "./lib/status-table.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? true;
};

if (!args.includes("--status")) {
  console.error("Usage: pnpm publish-report --all --status [--base <url>] [--fail-on-drift]");
  process.exit(2);
}

assertFresh("pnpm publish-report --all --status");
const base = String(flag("--base") ?? "http://localhost:8799").replace(/\/$/, "");
const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));

async function served(id) {
  try {
    const response = await fetch(`${base}/reports/${id}`, { method: "HEAD", redirect: "manual" });
    const version = response.headers.get("x-rtm-content-version");
    if (!version) return { error: `${response.status}, no x-rtm-content-version` };
    return { version };
  } catch (error) {
    return { error: `unreachable: ${error.cause?.code ?? error.message}` };
  }
}

const rows = [];
for (const report of registry.reports) {
  rows.push(classify(report.id, await localHash(root, report.id), await served(report.id)));
}
console.log(formatTable(rows, base));
const bad = rows.some((r) => r.state !== "current");
process.exit(args.includes("--fail-on-drift") && bad ? 1 : 0);
