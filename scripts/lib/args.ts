/**
 * Argument checks shared by every script that can reach production D1 or a Cloudflare account
 * (reportsthatmatter-cs92, -jp6i): a mistyped flag must not silently turn a run the user meant to keep offline
 * into a production read, and a remote call must not leave the machine before its confirmation flag is checked.
 */

export const CONFIRM_FLAG = "--yes";

/** The `--flags` in `argv` that are not in `known`; the value after a `valued` flag is not looked at. `--help` is always known. */
export function unknownFlags(argv: string[], known: string[], valued: string[] = []): string[] {
  const ok = new Set([...known, ...valued, "--help", "-h"]);
  const values = new Set(valued);
  return argv.filter((arg, i) => arg.startsWith("-") && !values.has(argv[i - 1]) && !ok.has(arg));
}

/** Exits 2 with "unknown flag --x" before the script does anything else. Call it first, after the help import. */
export function exitOnUnknownFlags(argv: string[], known: string[], valued: string[] = []): void {
  const bad = unknownFlags(argv, known, valued);
  if (!bad.length) return;
  console.error(`unknown flag${bad.length > 1 ? "s" : ""} ${bad.join(" ")}; nothing was run (see --help)`);
  process.exit(2);
}

export const refusalFor = (what: string) => `Nothing sent to production. ${what} needs ${CONFIRM_FLAG} (reads count: they spend rows read and land in the d1-usage ledger).`;

/** Exits 1 with the confirmation message when `what` would reach production and `argv` lacks --yes. */
export function exitUnlessConfirmed(argv: string[], what: string, reachesProduction = true): void {
  if (!reachesProduction || argv.includes(CONFIRM_FLAG)) return;
  console.error(refusalFor(what));
  process.exit(1);
}
