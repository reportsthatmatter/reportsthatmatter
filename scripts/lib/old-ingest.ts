/**
 * The ingest library as pinned at an older git ref (reportsthatmatter-hxo4).
 *
 * `pnpm aliases generate` compares the published text with the new one. Section slugs and paragraph
 * ids come from the renderer, so the published text must be rendered by the ingest that rendered it
 * (the pin in package.json at the old ref), not the one installed now: rendering both sides with the
 * new ingest hides every slug move the ingest change itself caused (v0.20.0 moved 16 section slugs in
 * us-911-commission alone and the generator recorded none of them).
 *
 * The tarball of the pinned tag/sha is fetched once from GitHub and unpacked under
 * node_modules/.cache/rtm-ingest/<ref>/ (inside the site's node_modules, so its `yaml` and
 * `markdown-it` resolve; gitignored). Offline, a sibling `../ingest` checkout is read with `git archive`
 * (read-only; nothing is written into it).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Ingest } from "../../src/lib/alias-gen";

/** `github:org/repo#ref` (or an https git URL ending `#ref`) -> {repo, ref}; null for link:, file: and ranges. */
export function parsePin(spec: string | undefined): { repo: string; ref: string } | null {
  const m = spec?.match(/^(?:github:|git\+https:\/\/github\.com\/|https:\/\/github\.com\/)([^/#]+\/[^#]+?)(?:\.git)?#(.+)$/);
  return m ? { repo: m[1], ref: m[2] } : null;
}

export const pinOf = (packageJson: string): string | undefined => JSON.parse(packageJson).dependencies?.["@rtm/ingest"];

const safe = (s: string) => s.replace(/[^\w.-]+/g, "_");

/** Loads the ingest at `spec`, or returns `fallback` (with a reason on stderr) when it cannot be fetched. */
export async function loadIngest(root: string, spec: string | undefined, fallback: Ingest): Promise<{ ingest: Ingest; ref: string; fetched: boolean }> {
  const pin = parsePin(spec);
  if (!pin) {
    console.error(`  warning: cannot resolve the old ingest pin ${JSON.stringify(spec)}; rendering the old text with the installed ingest (section moves caused by an ingest change will be missed)`);
    return { ingest: fallback, ref: "installed", fetched: false };
  }
  const dir = join(root, "node_modules/.cache/rtm-ingest", safe(`${pin.repo}@${pin.ref}`));
  if (!existsSync(join(dir, "dist/index.js"))) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const tgz = join(dir, "..", safe(`${pin.repo}@${pin.ref}`) + ".tgz");
    try {
      execFileSync("curl", ["-fsSL", "-o", tgz, `https://codeload.github.com/${pin.repo}/tar.gz/${pin.ref}`], { stdio: "pipe" });
      execFileSync("tar", ["-xzf", tgz, "-C", dir, "--strip-components=1"]);
    } catch (e) {
      const sibling = join(root, "..", "ingest");
      try {
        const archive = execFileSync("git", ["-C", sibling, "archive", pin.ref], { maxBuffer: 1 << 29 });
        execFileSync("tar", ["-xf", "-", "-C", dir], { input: archive });
      } catch {
        rmSync(dir, { recursive: true, force: true });
        throw new Error(`cannot fetch @rtm/ingest ${pin.ref} (codeload failed: ${(e as Error).message.split("\n")[0]}; no ${sibling} to archive from)`);
      }
    }
    if (!existsSync(join(dir, "dist/index.js"))) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`@rtm/ingest ${pin.ref} has no dist/index.js`);
    }
  }
  const ingest = (await import(pathToFileURL(join(dir, "dist/index.js")).href)) as Ingest;
  return { ingest, ref: pin.ref, fetched: true };
}

export const versionOf = (dir: string): string => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
