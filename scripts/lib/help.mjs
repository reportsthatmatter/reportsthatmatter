/* `--help` for every script that is a pnpm entry point (reportsthatmatter-hxo4).
 *
 * Import this FIRST in a script (`import "./lib/help.mjs";`). ES imports evaluate in order, so when the
 * arguments ask for help this prints the script's own header comment and exits 0 before any later import
 * or the script body can run, write, or touch the network. Before this, `pnpm aliases generate --help`
 * and `pnpm quality ratchet --help` ran the commands (and ratchet writes budgets).
 *
 * The help text is the first block comment of the entry file (or its leading `//` lines), so the usage
 * block that documents a script is also what `--help` prints; there is no second copy to keep in step.
 * tests/help.test.ts fails if a pnpm entry point in package.json does not import this first.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

export const wantsHelp = (argv) => argv.some((a) => a === "--help" || a === "-h");

export function headerOf(source) {
  const text = source.replace(/^#!.*\n/, "");
  const block = text.match(/^\s*\/\*\*?([\s\S]*?)\*\//);
  if (block) return block[1].replace(/^[ \t]+/, "").split("\n").map((l) => l.replace(/^\s*\* ?/, "")).join("\n").replace(/^\n+|\s+$/g, "");
  const lines = [];
  for (const l of text.split("\n")) {
    if (/^\s*(#|\/\/)/.test(l)) lines.push(l.replace(/^\s*(#|\/\/) ?/, ""));
    else if (lines.length || l.trim()) break;
  }
  return lines.join("\n").trim();
}

const argv = process.argv.slice(2);
if (wantsHelp(argv) && process.argv[1]) {
  let text = "";
  try {
    text = headerOf(readFileSync(process.argv[1], "utf8"));
  } catch {}
  console.log(text || `${basename(process.argv[1])}: no usage text; read the script's header.`);
  process.exit(0);
}
