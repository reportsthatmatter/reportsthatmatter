/* Publishes one report's rendered content to R2 + D1, through the endpoint.
 *
 *   RTM_PUBLISH_SECRET=… pnpm publish-report <id> [--base https://…]
 *   RTM_PUBLISH_SECRET=… pnpm publish-report <id> --status
 *   RTM_PUBLISH_SECRET=… pnpm publish-report <id> --rollback <hash>
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
 * the reports that haven't moved to publishing themselves yet.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { contentHash, manifestFor, tokenFor } from "@rtm/ingest";

const args = process.argv.slice(2);
const reportId = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? true;
};

if (!reportId || reportId.startsWith("--")) {
  console.error("Usage: pnpm publish-report <id> [--base <url>] [--status] [--rollback <hash>]");
  process.exit(2);
}

const secret = process.env.RTM_PUBLISH_SECRET;
if (!secret) {
  console.error("RTM_PUBLISH_SECRET is not set. It is the Worker's PUBLISH_SECRET.");
  process.exit(2);
}

const base = flag("--base") ?? "http://localhost:8799";
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

const dir = join(process.cwd(), "assets/generated/reports", reportId);
const files = [
  { path: "meta.json", body: readFileSync(join(dir, "meta.json"), "utf8") },
  { path: "full-body.html", body: readFileSync(join(dir, "full-body.html"), "utf8") },
  ...readdirSync(join(dir, "fragments")).map((name) => ({
    path: `fragments/${name}`,
    body: readFileSync(join(dir, "fragments", name), "utf8"),
  })),
];

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
