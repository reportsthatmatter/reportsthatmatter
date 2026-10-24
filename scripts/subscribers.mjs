/* The newsletter's signup list in D1 (decision 0033, migration 0006).
 *
 *   pnpm subscribers count [--remote --yes]                     how many, by status and by where they signed up
 *   pnpm subscribers export [--out <file>] [--remote --yes]     CSV for the mailing provider's import
 *                                                               (default build/subscribers-<date>.csv; --out only under build/ or the temp dir)
 *   pnpm subscribers remove <email> [--remote --yes]            delete one address: a removal request, or an unsubscribe
 *                                                               the provider reported
 *
 * Local D1 (wrangler dev) by default; --remote is production, and EVERY --remote command, reads included, needs
 * --yes: without it the script exits before its first remote call. Costs: count and export read every row (one
 * per subscriber); remove reads one row by the email index and writes one.
 *
 * Moving to a provider: export, import the CSV there with the provider's confirmation email ON (that email is
 * the double opt-in the form promises), then delete the exported rows here, so the list lives in one place, and
 * delete at the provider any address still unconfirmed after 30 days (/newsletter promises unconfirmed ones go).
 */
import "./lib/help.mjs";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { exitOnUnknownFlags } from "./lib/args.ts";
import { wranglerRunner } from "./lib/d1.ts";
import { isValidEmail, normaliseEmail, subscribersCsv } from "../src/lib/subscribe.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
exitOnUnknownFlags(args, ["--remote", "--yes"], ["--out"]);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const remote = flag("--remote");
const target = remote ? "--remote" : "--local";
const where = remote ? "production" : "local";
const wrangler = wranglerRunner(root, { confirmed: flag("--yes") });

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** The only way this script reaches D1: a --remote call without --yes never leaves the machine. */
const query = (sql, label) => {
  if (remote && !flag("--yes")) fail("Nothing sent to production. Every --remote command needs --yes (reads too).");
  return wrangler(target, { command: sql, ...(label ? { label } : {}) })[0];
};

const [command, operand] = args.filter((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--out");
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

switch (command) {
  case "count": {
    const byStatus = query("SELECT status, source, COUNT(*) AS n FROM subscribers GROUP BY status, source ORDER BY n DESC").results;
    const total = byStatus.reduce((sum, row) => sum + Number(row.n), 0);
    console.log(`subscribers (${where}): ${total}`);
    for (const row of byStatus) console.log(`  ${row.status} · ${row.source || "(none)"}: ${row.n}`);
    break;
  }
  case "export": {
    const rows = query("SELECT email, source, created_at, status FROM subscribers ORDER BY id").results;
    const out = option("--out") ?? join(root, "build", `subscribers-${new Date().toISOString().slice(0, 10)}.csv`);
    if (!resolve(out).startsWith(join(root, "build") + "/") && !resolve(out).startsWith(tmpdir())) {
      fail("--out must be under build/ (gitignored) or the system temp directory: the file holds personal data.");
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, subscribersCsv(rows), { mode: 0o600 });
    chmodSync(out, 0o600); // mode applies only to a new file
    console.log(`${rows.length} address(es) from ${where} written to ${out}. It holds personal data: do not commit or share it.`);
    break;
  }
  case "remove": {
    const email = operand ? normaliseEmail(operand) : "";
    if (!isValidEmail(email)) fail("pnpm subscribers remove needs an email address. See pnpm subscribers --help.");
    // Labelled, so the address is not kept in the D1 usage ledger (~/.local/state/rtm/d1-usage.jsonl).
    const result = query(`DELETE FROM subscribers WHERE email = ${quote(email)}`, "subscribers remove");
    const changed = result.meta?.changes ?? result.meta?.rows_written ?? 0;
    console.log(changed ? `${where}: removed ${email}.` : `${where}: ${email} was not on the list.`);
    break;
  }
  default:
    fail("Usage: pnpm subscribers count|export|remove <email> [--remote --yes]. See pnpm subscribers --help.");
}
