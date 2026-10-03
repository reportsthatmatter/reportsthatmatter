import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

/** The @rtm/ingest a checkout (the site, or a report repo) will import: its version and the real directory, whether pnpm-installed or linked. Lesson mv1t: say which ingest a run used. */
export function installedIngest(dir: string): { version: string; dir: string } {
  const link = join(dir, "node_modules/@rtm/ingest");
  if (!existsSync(link)) return { version: "not installed", dir: link };
  const real = realpathSync(link);
  return { version: JSON.parse(readFileSync(join(real, "package.json"), "utf8")).version as string, dir: real };
}
