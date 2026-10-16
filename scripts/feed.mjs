/* Moderate the public highlights feed on /highlights (reportsthatmatter-bght.10.5, decision 0023).
 *
 *   pnpm feed status [--remote --yes]              counts by status and reason, and the newest visible rows
 *   pnpm feed list [--held|--hidden|--visible] [--limit N] [--remote --yes]
 *   pnpm feed hide <id | link> [--remote --yes]    hide one row, or every row of the passage a link names
 *   pnpm feed show <id | link> [--remote --yes]    undo a hide (held rows stay held)
 *   pnpm feed hide --report <id> [--remote --yes]  hide every visible row of one report
 *   pnpm feed hide --all [--remote --yes]          THE KILL SWITCH: hide every visible row, no deploy needed
 *   pnpm feed rebuild [--dry-run] [--remote --yes] replay marks through today's policy and text, rewrite public_marks
 *                                                  (--remote --dry-run still reads production: it needs --yes too)
 *
 * A link is what /highlights prints under "Read in place": /reports/<id>?p=<paragraph>&h=<anchor> (with or
 * without the origin or a section slug). Local D1 (wrangler dev) by default; --remote is production, and EVERY
 * --remote command, reads included, needs --yes: without it the script exits before its first remote call (the
 * runner below refuses, so no path can forget). A write without --yes prints the SQL it would run first. Every remote statement goes through scripts/lib/d1.ts,
 * so it lands in today's D1 ledger (pnpm d1-usage).
 *
 * hide --all hides what is there now; marks made afterwards still appear (after the 30-minute delay) until
 * FEED_ENABLED = "false" is deployed (wrangler.toml [vars]), which also stops new rows being written. Costs:
 * public_marks has no secondary index, so each hide/show/status reads the whole table (a few thousand rows a
 * month at launch traffic) and writes one row per row changed. rebuild reads every row of marks.
 */
import "./lib/help.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { exitOnUnknownFlags } from "./lib/args.ts";
import { wranglerRunner } from "./lib/d1.ts";
import { parseTarget, planRebuild, rebuildSql, statusSql } from "../src/lib/feed-admin.ts";
import { contentFor } from "../src/lib/content.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
exitOnUnknownFlags(args, ["--remote", "--yes", "--held", "--hidden", "--visible", "--all", "--dry-run"], ["--limit", "--report"]);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const remote = flag("--remote");
const target = remote ? "--remote" : "--local";
const where = remote ? "production" : "local";
const wrangler = wranglerRunner(root, { confirmed: flag("--yes") });
/** The only way this script reaches D1: a --remote call without --yes never leaves the machine. */
const run = (t, sql) => {
  if (t === "--remote" && !flag("--yes")) fail("Nothing sent to production. Every --remote command needs --yes (reads too).");
  return wrangler(t, sql);
};
const query = (sql) => run(target, { command: sql })[0];

const [command, operand] = args.filter((arg, i) => !arg.startsWith("--") && !["--report", "--limit"].includes(args[i - 1]));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function tableSize() {
  return Number(query("SELECT COUNT(*) AS n FROM public_marks").results[0]?.n ?? 0);
}

/**
 * A write: print what it costs, then run it locally, or remotely only with --yes. Nothing touches production
 * before --yes, not even the row count.
 */
function write(sql, label) {
  if (remote && !flag("--yes")) {
    console.log(`${label} in production would run:\n  ${sql}\nIt reads every public_marks row (no secondary index) and writes one row per row it changes.`);
    fail("Nothing sent to production. Add --yes to run it.");
  }
  const result = query(sql);
  const changed = result.meta?.changes ?? result.meta?.rows_written;
  console.log(`${where}: ${changed ?? "?"} row(s) changed (${result.meta?.rows_read ?? "?"} read, ${result.meta?.rows_written ?? "?"} written).`);
}

const show = (row) =>
  `  #${row.id} ${row.status}${row.reason ? `/${row.reason}` : ""} ${new Date(row.created_at).toISOString().slice(0, 16)} ${row.report} ${row.paragraph}\n      "${String(row.words).slice(0, 110)}${String(row.words).length > 110 ? "…" : ""}"`;

switch (command) {
  case "status": {
    const counts = query("SELECT status, reason, COUNT(*) AS n FROM public_marks GROUP BY status, reason ORDER BY status, reason").results;
    console.log(`public_marks (${where}):`);
    if (!counts.length) console.log("  empty");
    for (const row of counts) console.log(`  ${row.status}${row.reason ? `/${row.reason}` : ""}: ${row.n}`);
    const byReport = query("SELECT report, COUNT(*) AS n FROM public_marks WHERE status = 'visible' GROUP BY report ORDER BY n DESC").results;
    if (byReport.length) console.log(`visible by report: ${byReport.map((r) => `${r.report} ${r.n}`).join(", ")}`);
    const newest = query("SELECT id, report, paragraph, words, status, reason, created_at FROM public_marks WHERE status = 'visible' ORDER BY id DESC LIMIT 10").results;
    if (newest.length) console.log(`newest visible:\n${newest.map(show).join("\n")}`);
    break;
  }
  case "list": {
    const status = flag("--held") ? "held" : flag("--hidden") ? "hidden" : flag("--visible") ? "visible" : null;
    const limit = Math.max(1, Math.min(500, Number(option("--limit") ?? 50)));
    const rows = query(
      `SELECT id, report, paragraph, words, status, reason, created_at FROM public_marks${status ? ` WHERE status = '${status}'` : ""} ORDER BY id DESC LIMIT ${limit}`
    ).results;
    console.log(rows.length ? rows.map(show).join("\n") : "  none");
    break;
  }
  case "hide":
  case "show": {
    const report = option("--report");
    const t = flag("--all")
      ? { kind: "all" }
      : report
        ? /^[a-z0-9-]+$/.test(report) ? { kind: "report", report } : null
        : operand ? parseTarget(operand) : null;
    if (!t) fail(`pnpm feed ${command} needs a row id, a link from /highlights, --report <id>${command === "hide" ? " or --all" : ""}. See pnpm feed --help.`);
    if (command === "show" && t.kind === "all") fail("show --all is not offered: show rows one passage or one report at a time.");
    write(statusSql(t, command), `${command} ${t.kind === "all" ? "--all" : JSON.stringify(t)}`);
    break;
  }
  case "rebuild": {
    if (remote && !flag("--yes")) fail("rebuild --remote reads every row of production's marks (and, without --dry-run, rewrites public_marks): add --yes, with --dry-run to plan only.");
    const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
    const env = { FEED_ENABLED: process.env.FEED_ENABLED, FEED_EXCLUDE: process.env.FEED_EXCLUDE };
    const marks = query("SELECT id, report, section, paragraph, exact, prefix, suffix, page, kind, actor, created_at FROM marks ORDER BY id").results;
    const hidden = query("SELECT report, paragraph, words FROM public_marks WHERE status = 'hidden' AND reason = 'manual'").results;
    const { rows, skipped } = await planRebuild(marks, {
      env,
      knownReports: new Set(registry.reports.map((r) => r.id)),
      // Verified against this checkout's pre-rendered text (assets/generated): run pnpm prerender first.
      contentOf: (id) => contentFor(undefined, id),
      hidden,
    });
    mkdirSync(join(root, "build"), { recursive: true });
    const file = join(root, "build/feed-rebuild.sql");
    writeFileSync(file, rebuildSql(rows));
    const writes = tableSize() + rows.length;
    console.log(`${marks.length} mark(s) read from ${where} D1; ${rows.length} public row(s) planned (${rows.filter((r) => r.status === "visible").length} visible); skipped ${JSON.stringify(skipped)}.`);
    console.log(`Plan: delete every public_marks row, insert ${rows.length}: about ${writes} row write(s). SQL in ${file}.`);
    if (flag("--dry-run")) break;
    const written = run(target, { file }).reduce((sum, r) => sum + (Number(r.meta?.rows_written) || 0), 0);
    console.log(`${where}: rebuilt (${written} rows written).`);
    break;
  }
  default:
    fail("Usage: pnpm feed status | list | hide | show | rebuild (see pnpm feed --help)");
}
