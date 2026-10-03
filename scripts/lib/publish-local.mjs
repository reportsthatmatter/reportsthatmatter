/* What `pnpm publish-report` would upload for a report, and the content hash it would publish under.
 *
 * One place for it, so the publish and the drift table (`publish-report --all --status`) cannot disagree
 * about what a report's local version is. Reads what `pnpm prerender` wrote; the caller is responsible
 * for the freshness stamp (assertFresh).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { contentHash, manifestFor } from "@rtm/ingest";

export function readLocalFiles(root, reportId) {
  const dir = join(root, "assets/generated/reports", reportId);
  return [
    { path: "meta.json", body: readFileSync(join(dir, "meta.json"), "utf8") },
    { path: "full-body.html", body: readFileSync(join(dir, "full-body.html"), "utf8") },
    ...readdirSync(join(dir, "fragments")).map((name) => ({
      path: `fragments/${name}`,
      body: readFileSync(join(dir, "fragments", name), "utf8"),
    })),
  ];
}

export async function localHash(root, reportId) {
  return contentHash(await manifestFor(readLocalFiles(root, reportId)));
}
