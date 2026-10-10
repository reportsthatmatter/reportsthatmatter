/* Today's D1 usage against the free tier's daily limits, and what spent it (reportsthatmatter-t4al).
 *
 *   pnpm d1-usage                     today (UTC): rows read and written, from Cloudflare analytics and the shared ledger
 *   pnpm d1-usage --day 2026-10-03    another day (analytics keep 31 days; the ledger keeps everything)
 *   pnpm d1-usage --alert 80          exit 2 when either counter is at or over 80% of its limit, 3 when analytics cannot be read (for a cron; docs/d1-usage-alert.md)
 *   pnpm d1-usage --json              machine-readable
 *
 * Costs no D1 rows: analytics is Cloudflare's GraphQL API, not a query against the database, and the ledger is a
 * local file (~/.local/state/rtm/d1-usage.jsonl) every remote `wrangler d1 execute` through scripts/lib/d1.ts appends to.
 * Credentials: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID, else wrangler's own login.
 */
import "./lib/help.mjs";
import { join } from "node:path";
import { analyticsToday, combine, credentials, databaseIdOf, FREE_TIER, ledgerEntries, ledgerPath, topQueries } from "./lib/d1-usage.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const day = opt("--day") ?? new Date().toISOString().slice(0, 10);
const at = new Date(`${day}T12:00:00Z`);
const alert = args.includes("--alert") ? Number(opt("--alert")) : null;
if (alert !== null && !(alert > 0 && alert <= 100)) {
  console.error("--alert needs a percentage, e.g. --alert 80");
  process.exit(2);
}

const creds = credentials(root, databaseIdOf(root));
const analytics = await analyticsToday(fetch, creds, at);
const entries = ledgerEntries(at);
const ledger = { rowsRead: entries.reduce((t, e) => t + e.rowsRead, 0), rowsWritten: entries.reduce((t, e) => t + e.rowsWritten, 0), entries: entries.length };
const today = combine(ledger, analytics);
const top = analytics ? await topQueries(fetch, creds, day, 12) : null;

const pct = (n, of) => `${((100 * n) / of).toFixed(1)}%`;
const fmt = (n) => n.toLocaleString("en-US");
const used = today.used;
const over = used && alert !== null && (100 * used.rowsRead >= alert * FREE_TIER.rowsRead || 100 * used.rowsWritten >= alert * FREE_TIER.rowsWritten);

if (args.includes("--json")) {
  console.log(JSON.stringify({ day, limits: FREE_TIER, ...today, top }, null, 1));
} else {
  console.log(`D1 usage on ${day} (UTC; the free tier resets at 00:00 UTC)`);
  if (used) {
    console.log(`  rows read     ${fmt(used.rowsRead).padStart(11)} of ${fmt(FREE_TIER.rowsRead)}  (${pct(used.rowsRead, FREE_TIER.rowsRead)})`);
    console.log(`  rows written  ${fmt(used.rowsWritten).padStart(11)} of ${fmt(FREE_TIER.rowsWritten)}  (${pct(used.rowsWritten, FREE_TIER.rowsWritten)})`);
  }
  console.log(`  source: ${today.source}`);
  console.log(`  analytics: ${analytics ? `${fmt(analytics.rowsRead)} read, ${fmt(analytics.rowsWritten)} written` : "not available (no credentials, or wrangler not logged in)"}`);
  console.log(`  ledger (${ledgerPath()}): ${fmt(ledger.rowsRead)} read, ${fmt(ledger.rowsWritten)} written in ${ledger.entries} call(s)`);
  const byTool = new Map();
  for (const e of entries) byTool.set(e.tool, (byTool.get(e.tool) ?? 0) + e.rowsRead);
  for (const [tool, n] of [...byTool].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${fmt(n).padStart(11)} rows read  ${tool}`);
  if (top?.length) {
    console.log("  most rows read, by query (analytics):");
    for (const q of top) console.log(`    ${fmt(q.rowsRead).padStart(11)}  ×${String(q.count).padEnd(5)} ${q.query.replace(/\s+/g, " ").trim().slice(0, 110)}`);
  }
  if (over) console.log(`\n⚠ at or over ${alert}% of a daily limit: hold releases and reindexes until 00:00 UTC (reportsthatmatter-t4al)`);
}
// A scheduled --alert must not pass silently when it could not read usage: exit 3 (2 is "over the threshold").
// The ledger alone is not enough: it holds this machine's wrangler calls, not the Worker's traffic (search, marks),
// which is what spent the reads on 2026-10-03 (t4al). So no analytics is "could not check", not "fine".
if (alert !== null && !over && !analytics) {
  console.error(`\n✗ usage unknown (${used ? "analytics unreachable; the ledger cannot see the Worker's traffic" : "no analytics credentials and nothing in the ledger"}): the alert could not be checked`);
  process.exit(3);
}
process.exit(over ? 2 : 0);
