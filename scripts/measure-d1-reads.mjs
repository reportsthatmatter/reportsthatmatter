/* Measures what a release's D1 steps and the Worker's search read, in D1 rows read (reportsthatmatter-t4al).
 *
 *   pnpm exec tsx scripts/measure-d1-reads.mjs [--keep <dir>]
 *
 * Loads this checkout's prerendered corpus into a scratch local D1 (a throwaway persist dir; nothing of yours and
 * nothing remote is touched) the way production was loaded (`pnpm index-search`: no layouts), then, per report,
 * runs the release's D1 reads twice: once as the scripts did before t4al (the queries copied verbatim) and once
 * through the real scripts/lib code as it is now, first run (no layout yet: one scan, which records it) and steady
 * state (through the layout). Then the Worker's search query, old and new, for a set of queries. The numbers are
 * D1's own `meta.rows_read` from miniflare's binding, which counts the way production D1 does.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { extractPassages } from "@rtm/ingest";
import { localD1 } from "./lib/local-d1-sync.mjs";
import { probeWrite } from "./lib/d1-probe.ts";
import { readVersionRow, scanAllLayouts } from "./lib/d1.ts";
import { incrementalStatements } from "./lib/reindex.ts";
import { estimatedReindexReads, placement, planReport } from "./lib/reindex-run.ts";
import { queryPassages, buildMatchQuery } from "../src/lib/search.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const keep = args.includes("--keep") ? args[args.indexOf("--keep") + 1] : null;
const persist = keep ?? mkdtempSync(join(tmpdir(), "rtm-measure-d1-reads-"));
const sh = (cmd, a) => execFileSync(cmd, a, { cwd: root, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 256 << 20 });

if (!keep || !args.includes("--reuse")) {
  console.error(`loading the corpus into ${persist} ...`);
  sh("pnpm", ["index-search"]);
  sh("pnpm", ["wrangler", "d1", "migrations", "apply", "reportsthatmatter-marks", "--local", "--persist-to", persist]);
  sh("pnpm", ["wrangler", "d1", "execute", "reportsthatmatter-marks", "--local", "--persist-to", persist, "--file=build/search-index.sql"]);
}
const d1 = localD1({ config: join(root, "wrangler.toml"), persist: join(persist, "v3") });
const run = d1.run;
const reads = (fn) => {
  const before = d1.rowsRead;
  const value = fn();
  return { value, n: d1.rowsRead - before };
};
const T = "--local";

// ---- before t4al: the queries as they were (copied from the scripts at d72327fb) --------------------------------
const oldStoredRead = (report, pageSize = 400) => {
  let after = 0;
  for (;;) {
    const [r] = run(T, { command: `SELECT rowid AS rid, section, paragraph_id, page, body FROM passages WHERE report = '${report}' AND rowid > ${after} ORDER BY rowid LIMIT ${pageSize}` });
    if (r.results.length < pageSize) return;
    after = r.results[r.results.length - 1].rid;
  }
};
const oldProbeSelect = () => run(T, { command: "SELECT rowid AS rid FROM passages WHERE report = '__rtm_probe__' LIMIT 1" });
const oldCount = (report) => run(T, { command: `SELECT count(*) AS n FROM passages WHERE report = '${report}'` });
const oldVersion = (report) => run(T, { command: `SELECT content_version FROM search_index_versions WHERE report = '${report}'` });

const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
const ids = registry.reports.map((r) => r.id);
// Every report "changed": the version row no longer matches, so each run diffs (the read is the same whatever changed).
run(T, { command: "UPDATE search_index_versions SET content_version = 'before-release'" });

const total = Number(run(T, { command: "SELECT count(*) AS n FROM passages" })[0].results[0].n);
// What `reindex-search.mjs --record-layouts` reads to record every report's layout at once (measured, not written here).
const recordLayouts = reads(() => scanAllLayouts(run, T)).n;
const rows = [];
for (const id of ids) {
  // before: dry-run (version + paged read), publish probe (insert, select-by-report, delete), reindex (version + paged read + apply + count)
  const before = {
    dry: reads(() => (oldVersion(id), oldStoredRead(id))).n,
    probe: reads(() => oldProbeSelect()).n,
    reindex: reads(() => (oldVersion(id), oldStoredRead(id))).n,
    count: reads(() => oldCount(id)).n,
  };
  // now, first run: dry-run plan, probe, reindex plan + apply + version check
  const plan = (n) => planReport({ root, report: id, target: T, run, extract: extractPassages });
  const dry = reads(() => plan());
  const probe = reads(() => probeWrite(run, T)).n;
  const reindex = reads(() => {
    const p = plan();
    const at = Date.now();
    const statements = incrementalStatements(id, p.plan, "after-release-1", at, placement(p, run, T, at));
    for (const s of statements) run(T, { command: s.replace(/;$/, "") });
    return readVersionRow(run, T, id);
  });
  // the next release: through the layout the first run recorded
  run(T, { command: `UPDATE search_index_versions SET content_version = 'before-release-2', layout = json_set(layout, '$.at', 0) WHERE report = '${id}'` });
  const steady = reads(() => plan());
  rows.push({
    id,
    n: dry.value.passages.length,
    before: before.dry + before.probe + before.reindex + before.count,
    beforeParts: before,
    first: dry.n + probe + reindex.n,
    steady: steady.n * 2 + 2 + 3, // dry-run + reindex reads, the version check, the probe
    via: steady.value.read?.via,
    runs: steady.value.read?.runs.length,
    estimate: estimatedReindexReads(steady.value),
    layoutOk: reindex.value.layout?.n === dry.value.passages.length,
  });
}

const pad = (v, n) => String(v).padStart(n);
const fmt = (n) => n.toLocaleString("en-US");
console.log(`\nD1 rows read per report for one release (dry-run estimate + publish probe + reindex + its check), corpus ${fmt(total)} rows`);
console.log(`scratch local D1 (miniflare), loaded as production was (no layouts); every report diffed\n`);
console.log(`${"report".padEnd(26)}${pad("rows", 7)}${pad("before", 10)}${pad("first run", 11)}${pad("then", 8)}  read via`);
let tb = 0, tf = 0, ts = 0;
for (const r of rows) {
  tb += r.before; tf += r.first; ts += r.steady;
  console.log(`${r.id.padEnd(26)}${pad(fmt(r.n), 7)}${pad(fmt(r.before), 10)}${pad(fmt(r.first), 11)}${pad(fmt(r.steady), 8)}  ${r.via} (${r.runs} run(s))${r.layoutOk ? "" : "  ✗ layout count differs"}`);
}
console.log(`${"all".padEnd(26)}${pad("", 7)}${pad(fmt(tb), 10)}${pad(fmt(tf), 11)}${pad(fmt(ts), 8)}`);
console.log(`\n"first run" is a release right after migration 0004 with no layouts recorded: its dry run and its reindex each scan the table.`);
console.log(`\`reindex-search.mjs --record-layouts\` records all ${rows.length} at once instead: ${fmt(recordLayouts)} rows read, then every release costs the "then" column.`);
const b = rows[0].beforeParts;
console.log(`\nbefore, per report: dry-run read ~${fmt(b.dry)}, probe ~${fmt(b.probe)}, reindex read ~${fmt(b.reindex)}, count(*) ~${fmt(b.count)} (${rows[0].id}).`);
console.log("Locally the rows of a report are contiguous; in production repeated incremental reindexes had scattered them, and the paged");
console.log("`WHERE report = ? AND rowid > ?` re-scanned to the end of the table for every page (2.24M rows on 2026-10-03, ~57k a read).");

// ---- the Worker's search ----------------------------------------------------------------------------------------
const WEIGHTS = "0, 3, 0, 0, 1";
const oldSearch = (q, scope) =>
  run(T, { command: `SELECT report, section, paragraph_id, page, body, highlight(passages, 4, '[', ']') as marked FROM passages WHERE passages MATCH '${buildMatchQuery(q)}' ${scope ? `AND report = '${scope}'` : ""} ORDER BY bm25(passages, ${WEIGHTS}) LIMIT 20` });
// The new query, through the real src/lib/search.ts with a binding that inlines its parameters.
const searchDb = {
  prepare(sql) {
    return {
      bind(...params) {
        return {
          async all() {
            let i = 0;
            const inlined = sql.replace(/\?/g, () => {
              const v = params[i++];
              return typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
            });
            return { results: run(T, { command: inlined })[0].results };
          },
        };
      },
    };
  },
};
console.log(`\nWorker search: rows read per query (top 20)\n`);
console.log(`${"query".padEnd(40)}${pad("before", 9)}${pad("now", 7)}  same results`);
for (const [q, scope] of [["the", null], ["a", null], ["safety", null], ["o-ring", null], ["commission found", null], ["bloody sunday", null], ["intelligence", null], ["iraq intelligence", "uk-chilcot-inquiry"], ["the", "jack-smith-vol1"], ["credit rating", "us-psi-financial-crisis"]]) {
  const before = reads(() => oldSearch(q, scope));
  const start = d1.rowsRead;
  const now = await queryPassages(searchDb, q, scope, 20);
  const n = d1.rowsRead - start;
  const same = JSON.stringify(before.value[0].results.map((r) => r.paragraph_id)) === JSON.stringify(now.map((r) => r.paragraph_id));
  console.log(`${(q + (scope ? ` @${scope}` : "")).padEnd(40)}${pad(fmt(before.n), 9)}${pad(fmt(n), 7)}  ${same ? "yes" : "NO"}`);
}
d1.close();
