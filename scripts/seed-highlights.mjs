/* Puts Rufus's highlights into the marks table (reportsthatmatter-g0w.11).
 *
 *   pnpm editorial                    # resolves them to build/editorial-highlights.json
 *   pnpm seed-highlights              # local D1
 *   pnpm seed-highlights --remote     # production D1
 *
 * The highlights live in `editorial/<id>.yaml` under `highlights:`, checked
 * verbatim like every other quote there. Here they become ordinary 'save'
 * marks, so they show the way any reader's marks do: highlighted in the text,
 * and in the report's "Most marked passages".
 *
 * Marks are anonymous — there are no accounts, and a reader is a salted daily
 * hash — so these show as one reader, not under Rufus's name
 * (reportsthatmatter-38k is the named version). They all carry one fixed actor,
 * which makes a run idempotent: it deletes that actor's rows for each report
 * it covers and writes the current set, so a highlight removed from the file
 * is removed from the site on the next run.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ACTOR = "editorial:rufus-pollock";

const root = join(import.meta.dirname, "..");
const source = join(root, "build/editorial-highlights.json");
if (!existsSync(source)) {
  console.error("build/editorial-highlights.json is missing — run pnpm editorial first");
  process.exit(1);
}

const highlights = JSON.parse(readFileSync(source, "utf8"));
const sql = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);
const now = Date.now();

const reports = [...new Set(highlights.map((h) => h.report))];
const statements = [
  ...reports.map((report) => `DELETE FROM marks WHERE actor = ${sql(ACTOR)} AND report = ${sql(report)};`),
  ...highlights.map(
    (h) =>
      `INSERT INTO marks (report, section, paragraph, exact, prefix, suffix, page, kind, actor, created_at) VALUES (` +
      [h.report, h.section, h.paragraph, h.exact, h.prefix, h.suffix].map(sql).join(", ") +
      `, ${h.page ?? "NULL"}, 'save', ${sql(ACTOR)}, ${now});`
  ),
];

mkdirSync(join(root, "build"), { recursive: true });
const file = join(root, "build/seed-highlights.sql");
writeFileSync(file, statements.join("\n") + "\n");

const remote = process.argv.includes("--remote");
execFileSync(
  "pnpm",
  ["wrangler", "d1", "execute", "reportsthatmatter-marks", remote ? "--remote" : "--local", `--file=${file}`],
  { stdio: "inherit", cwd: root }
);

console.log(`\nSeeded ${highlights.length} highlight(s) across ${reports.length} report(s) ${remote ? "in production" : "locally"}.`);
