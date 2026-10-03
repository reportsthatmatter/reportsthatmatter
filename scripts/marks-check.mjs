/* Replays what is anchored to a report's text against a candidate text (reportsthatmatter-p4h6).
 *
 *   pnpm marks check <report>                       # one report, against this checkout's assets/generated
 *   pnpm marks check --all                          # every report
 *   pnpm marks check --all --candidate ../rtm-int/assets/generated
 *   pnpm marks check --all --baseline <main build> --candidate <candidate build>
 *
 * Replays three things: stored marks (read-only from production D1, cached under build/marks-check/),
 * the `?p=`/`?h=` links in marketing/queue.yaml, and editorial/<id>.yaml's quotations and citations. Exits 1
 * when any of them stops anchoring. Before any re-ingest or source swap ships, run it for every changed report.
 *
 * --candidate <dir>   the text to test: a build dir holding reports/<id>/{full-body.html,meta.json}, as
 *                     `pnpm prerender` writes (default: this checkout's assets/generated)
 * --baseline <dir>    a second build dir, e.g. `pnpm prerender` run in a worktree of origin/main. With it the
 *                     report separates regressions (anchored on the baseline, not on the candidate) from
 *                     references that were already broken, and exits 1 only for the former
 * --refresh           re-read the marks from D1 instead of the cache (one grouped read of the table)
 * --local             read the local D1 instead of production
 * --marks-file <json> use an export you already have (same shape as the cache); D1 is not touched
 * --no-marks          links and editorial only (offline)
 * --queue <yaml>, --editorial-dir <dir>   read those from elsewhere (default: this checkout's)
 * --json              machine-readable result
 *
 * Reads D1 only through `readOnly`, which refuses anything but a single SELECT. Editorial and queue files are
 * read from this checkout: run it from the branch that carries the ones you mean to ship.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { checkEditorial, checkLink, checkMark, regressions } from "../src/lib/marks-check.ts";
import { wranglerRunner } from "./lib/d1.ts";
import { loadMarks, readCache } from "./lib/marks-export.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? null;
};
const valued = new Set(["--candidate", "--baseline", "--marks-file", "--cache", "--queue", "--editorial-dir"]);
const positional = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));

const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
const known = registry.reports.map((r) => r.id);
const reports = flag("--all") ? known : positional;

if (!reports.length) {
  console.error("Usage: pnpm marks check <report>... | --all  [--candidate <dir>] [--baseline <dir>] [--refresh] [--local] [--marks-file <json>] [--no-marks] [--json]");
  process.exit(2);
}
const unknown = reports.filter((r) => !known.includes(r));
if (unknown.length) {
  console.error(`Not in reports/registry.yaml: ${unknown.join(", ")}`);
  process.exit(2);
}

const candidateDir = resolve(value("--candidate") ?? join(root, "assets/generated"));
const baselineDir = value("--baseline") ? resolve(value("--baseline")) : null;

/** Reads one report's text from a build dir (either `<dir>/reports/<id>` or `<dir>/<id>`). */
function loadText(dir, id) {
  const base = [join(dir, "reports", id), join(dir, id)].find((p) => existsSync(join(p, "full-body.html")));
  if (!base) return null;
  const meta = JSON.parse(readFileSync(join(base, "meta.json"), "utf8"));
  return {
    html: readFileSync(join(base, "full-body.html"), "utf8"),
    paragraphToSection: meta.paragraphToSection,
    paragraphAliases: meta.paragraphAliases,
    sectionAliases: meta.sectionAliases,
    sections: meta.sections,
  };
}

const missing = (dir) => reports.filter((id) => !loadText(dir, id));
for (const [label, dir] of [["candidate", candidateDir], ...(baselineDir ? [["baseline", baselineDir]] : [])]) {
  const gone = missing(dir);
  if (gone.length) {
    console.error(`No ${label} text for ${gone.join(", ")} in ${dir} (run pnpm prerender there first).`);
    process.exit(2);
  }
}

// ---------- the references ----------

let marks = [];
let marksNote = "marks: skipped (--no-marks)";
if (!flag("--no-marks")) {
  if (value("--marks-file")) {
    const data = readCache(resolve(value("--marks-file")));
    if (!data) {
      console.error(`Cannot read ${value("--marks-file")} as a marks export.`);
      process.exit(2);
    }
    marks = data.marks;
    marksNote = `marks: ${marks.length} passage(s) from ${value("--marks-file")} (exported ${data.fetchedAt})`;
  } else {
    const target = flag("--local") ? "--local" : "--remote";
    const cachePath = resolve(value("--cache") ?? join(root, `build/marks-check/marks${target === "--local" ? "-local" : ""}.json`));
    try {
      const { data, fromCache } = loadMarks({ cachePath, target, refresh: flag("--refresh"), run: wranglerRunner(root) });
      marks = data.marks;
      const age = Math.round((Date.now() - Date.parse(data.fetchedAt)) / 3600000);
      marksNote = fromCache
        ? `marks: ${marks.length} passage(s) from the cache (${age}h old; --refresh re-reads D1)`
        : `marks: ${marks.length} passage(s) read from D1 ${target === "--local" ? "locally" : "in production"} (${data.rowsRead} rows read), cached at ${cachePath}`;
    } catch (error) {
      console.error(`Could not read marks from D1: ${String(error.message).split("\n")[0]}`);
      console.error("Run `pnpm wrangler login`, use --marks-file <export>, or --no-marks to skip them (the check then says so).");
      process.exit(2);
    }
  }
}

const queuePath = resolve(value("--queue") ?? join(root, "marketing/queue.yaml"));
const queue = existsSync(queuePath) ? (parse(readFileSync(queuePath, "utf8"))?.items ?? []) : [];

const editorialDir = resolve(value("--editorial-dir") ?? join(root, "editorial"));
const editorial = new Map();
if (existsSync(editorialDir)) {
  for (const name of readdirSync(editorialDir).filter((n) => n.endsWith(".yaml"))) {
    const source = parse(readFileSync(join(editorialDir, name), "utf8"));
    if (source?.report) editorial.set(source.report, source);
  }
}

/** Every verdict for one report against one text. */
function replay(id, text) {
  const out = [];
  for (const m of marks) if (m.report === id) out.push(checkMark(text, m));
  for (const item of queue) {
    if (item.report !== id || !item.link) continue;
    const v = checkLink(text, id, item.id, item.link);
    if (v) out.push(v);
  }
  if (editorial.has(id)) out.push(...checkEditorial(text, editorial.get(id)));
  return out;
}

const result = {};
for (const id of reports) {
  const now = replay(id, loadText(candidateDir, id));
  const before = baselineDir ? replay(id, loadText(baselineDir, id)) : null;
  result[id] = { verdicts: now, regressions: before ? regressions(before, now) : null };
}

const orphans = marks.filter((m) => !known.includes(m.report));

// ---------- report ----------

const verdicts = Object.values(result).flatMap((r) => r.verdicts);
const failing = (r) => (baselineDir ? r.regressions : r.verdicts.filter((v) => v.fail));
const failed = Object.entries(result).flatMap(([, r]) => failing(r));

if (flag("--json")) {
  console.log(JSON.stringify({ candidate: candidateDir, baseline: baselineDir, marksNote, orphans, failed: failed.length, result }, null, 1));
  process.exit(failed.length ? 1 : 0);
}

console.log(`Candidate text: ${candidateDir}`);
if (baselineDir) console.log(`Baseline text:  ${baselineDir}`);
console.log(`${marksNote}\n`);

const count = (vs, kind) => vs.filter((v) => v.kind === kind);
const cell = (vs, kind) => {
  const of = count(vs, kind);
  return of.length ? `${of.length - of.filter((v) => v.fail).length}/${of.length}` : "-";
};
console.log(`${"report".padEnd(26)}${"marks".padStart(8)}${"links".padStart(8)}${"editorial".padStart(11)}${"fail".padStart(6)}${baselineDir ? "  regress" : ""}`);
for (const id of reports) {
  const r = result[id];
  const fails = r.verdicts.filter((v) => v.fail).length;
  console.log(
    `${id.padEnd(26)}${cell(r.verdicts, "mark").padStart(8)}${cell(r.verdicts, "link").padStart(8)}${cell(r.verdicts, "editorial").padStart(11)}${String(fails).padStart(6)}${baselineDir ? String(r.regressions.length).padStart(9) : ""}`
  );
}
console.log("(each cell is anchoring/total)\n");

const loud = (v) => {
  const readers = v.readers ? ` (${v.readers} reader${v.readers === 1 ? "" : "s"})` : "";
  return `  ${v.kind.padEnd(9)} ${v.report} ${v.paragraph}${readers}\n    ${v.origin}\n    "${v.quote}"\n    ${v.status}: ${v.detail}`;
};

const toPrint = baselineDir ? failed : verdicts.filter((v) => v.fail);
if (toPrint.length) {
  console.log(baselineDir ? `REGRESSIONS (anchored on the baseline, not on the candidate): ${toPrint.length}` : `STOP ANCHORING: ${toPrint.length}`);
  for (const v of toPrint) console.log(loud(v));
  console.log("");
}
if (baselineDir) {
  const already = verdicts.filter((v) => v.fail).length - failed.length;
  if (already) console.log(`${already} reference(s) were already broken on the baseline (not regressions; run without --baseline to list them).\n`);
}

const notes = verdicts.filter((v) => !v.fail && v.status !== "ok");
if (notes.length) {
  console.log(`Still anchoring, but changed: ${notes.length}`);
  for (const v of notes.slice(0, 20)) console.log(`  ${v.kind.padEnd(9)} ${v.report} ${v.paragraph}: ${v.status}, ${v.detail}`);
  if (notes.length > 20) console.log(`  … and ${notes.length - 20} more (--json lists them)`);
  console.log("");
}
if (orphans.length) {
  console.log(`${orphans.length} stored mark(s) name a report that is not in the registry (${[...new Set(orphans.map((m) => m.report))].join(", ")}); not checked.\n`);
}

console.log(failed.length ? `FAIL: ${failed.length} reference(s) would stop anchoring.` : `OK: ${verdicts.length} reference(s) replayed, none stops anchoring.`);
process.exit(failed.length ? 1 : 0);
