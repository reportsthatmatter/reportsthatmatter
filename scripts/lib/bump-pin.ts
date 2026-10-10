/**
 * `pnpm bump-pin <version>` (reportsthatmatter-jsk3): the pin bump an integrator did by hand.
 *
 * The pin is `"@rtm/ingest": "github:reportsthatmatter/ingest#vX.Y.Z"` in the site's package.json and in every
 * report repo's. A frozen install (`CI=true pnpm install`) refuses a changed pin, so each repo needs
 * `pnpm install --no-frozen-lockfile` to refresh its lockfile. Pure parts here; the runner is scripts/bump-pin.ts.
 */

/** "0.25.0" or "v0.25.0" to "v0.25.0"; null when it is not a release version. */
export function normaliseVersion(arg: string): string | null {
  const m = /^v?(\d+\.\d+\.\d+)$/.exec(arg.trim());
  return m ? `v${m[1]}` : null;
}

/** The pin spec with its tag replaced: `github:org/ingest#v0.24.0` + `v0.25.0`. Null when the spec has no `#tag`. */
export function pinWith(spec: string, tag: string): string | null {
  return /#[^#]+$/.test(spec) ? spec.replace(/#[^#]+$/, `#${tag}`) : null;
}

/** package.json text with the `@rtm/ingest` spec rewritten; throws when there is no entry. */
export function rewritePin(text: string, to: string): string {
  const next = text.replace(/("@rtm\/ingest"\s*:\s*")[^"]*(")/, `$1${to}$2`);
  if (next === text && !text.includes(`"${to}"`)) throw new Error('no "@rtm/ingest" entry to rewrite');
  return next;
}

export type BumpStep = { dir: string; label: string; from: string | null; to: string; argv: string[] };

/** Install is always `--no-frozen-lockfile`: that is the point. */
export const installArgv = (dir: string): string[] => ["pnpm", "-C", dir, "install", "--no-frozen-lockfile"];
