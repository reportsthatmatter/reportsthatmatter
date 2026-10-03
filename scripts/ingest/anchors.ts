/**
 * `pnpm ingest anchors [<id>...]`: the independent page-anchor check
 * (reportsthatmatter-s24x). The method is in src/lib/anchors.ts.
 *
 *   pnpm ingest anchors us-911-commission          one report: counts, then the markers that disagree
 *   pnpm ingest anchors                            every report in reports/manifest.yaml, one row each
 *   --md <full.md>                                 check this markdown instead of the site's reports/<id>/full.md
 *   --limit N                                      disagreements listed per report (default 20)
 *   --json <file>                                  every verdict, machine-readable
 *   --check                                        fail when a count is over its budget in reports/anchor-budget.yaml (verify.sh)
 *   --ratchet                                      lower the budgets of the reports run to their counts (never raises one)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { checkAnchors, type AnchorReport, type PageText } from "../../src/lib/anchors.ts";
import { checkOracleBudget, loadOracleBudget, ratchetOracleBudgetFile } from "./oracle-budget.ts";

/** The counts reports/anchor-budget.yaml holds each report to. */
export function budgetCounts(r: AnchorReport): Record<string, number> {
  return { "markers-wrong": r.wrong, "markers-stacked": r.stacked, "pages-unmarked": r.unmarked.length, "blocks-wrong": r.blocks.wrong };
}

type Ctx = {
  root: string;
  ids: string[];
  reportDir(id: string): string;
  volumes(id: string): Promise<string[]>;
};

function pdfPages(path: string, layout: boolean): string[] {
  const out = execFileSync("pdftotext", [...(layout ? ["-layout"] : []), "-enc", "UTF-8", path, "-"], {
    encoding: "utf8",
    maxBuffer: 1 << 30,
  });
  const pages = out.split("\f");
  if (pages.length && !pages[pages.length - 1].trim()) pages.pop();
  return pages;
}

export async function pagesOf(paths: string[]): Promise<PageText[]> {
  const pages: PageText[] = [];
  paths.forEach((path, v) => {
    const layout = pdfPages(path, true);
    const words = pdfPages(path, false);
    const n = Math.max(layout.length, words.length);
    for (let i = 0; i < n; i++) pages.push({ volume: v + 1, pdfIndex: i + 1, layout: layout[i] ?? "", words: words[i] ?? "" });
  });
  return pages;
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "-");

export function summaryRow(id: string, r: AnchorReport): string {
  const ok = r.exact + r.block;
  return `| ${id} | ${r.scheme} | ${r.markers} | ${r.exact} | ${r.block} | ${r.wrong} | ${r.stacked} | ${r.unlocated} | ${pct(ok, r.markers - r.unlocated)} | ${r.unmarked.length} | ${r.pagesRead}+${r.pagesInferred}/${r.pages} | ${r.pagesLocated} | ${r.blocks.wrong}/${r.blocks.checked} (${r.blocks.onUnmarked} on unmarked pages) |`;
}

export const SUMMARY_HEAD =
  "| report | labels | markers | exact | block | wrong | stacked | unlocated | right of located | unmarked pages | pages numbered (read+inferred/all) | pages located | blocks under another page's marker |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|";

export function details(id: string, r: AnchorReport, limit: number): string {
  const lines = [`${id}: ${r.markers} markers, labels read as ${r.scheme} (markers right under each scheme: ${Object.entries(r.schemes).map(([k, v]) => `${k} ${v}`).join(", ")})`];
  lines.push(`  exact ${r.exact}, at a block boundary ${r.block} (${r.stacked} stacked after a block that runs over several pages), wrong ${r.wrong}, unlocated ${r.unlocated}; unmarked pages ${r.unmarked.length}`);
  lines.push(`  blocks of 8+ words: ${r.blocks.checked}, under the marker of the page they are printed on ${r.blocks.right}, under another ${r.blocks.wrong} (${r.blocks.onUnmarked} of them on a page no marker names), not located ${r.blocks.unlocated}`);
  for (const b of r.blocks.wrongBlocks.filter((b) => !b.unmarkedPage).slice(0, limit)) lines.push(`  ✗ block at line ${b.line} sits under %%page ${b.marker}%%, printed on ${b.printedOn}: "${b.text}"`);
  const listed = r.blocks.wrongBlocks.filter((b) => !b.unmarkedPage).length;
  if (listed > limit) lines.push(`  … ${listed - limit} more`);
  const wrong = r.verdicts.filter((v) => v.verdict === "wrong");
  for (const v of wrong.slice(0, limit)) {
    lines.push(`  ✗ %%page ${v.label}%% (line ${v.line}): ${v.delta! > 0 ? `${v.delta} words after` : `${-v.delta!} words before`} the start of PDF vol ${v.page!.volume} p.${v.page!.pdfIndex}; nearest page start is labelled ${v.nearest ?? "?"}; "${v.context}"`);
  }
  if (wrong.length > limit) lines.push(`  … ${wrong.length - limit} more`);
  const unlocated = r.verdicts.filter((v) => v.verdict === "unlocated");
  if (unlocated.length) lines.push(`  unlocated: ${unlocated.slice(0, limit).map((v) => `${v.label} (line ${v.line})`).join(", ")}${unlocated.length > limit ? ", …" : ""}`);
  if (r.unmarked.length) lines.push(`  unmarked: ${r.unmarked.slice(0, limit).map((u) => `${u.label} (vol ${u.volume} p.${u.pdfIndex})`).join(", ")}${r.unmarked.length > limit ? ", …" : ""}`);
  return lines.join("\n");
}

export async function runAnchors(argv: string[], ctx: Ctx): Promise<number> {
  const opt = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const valued = new Set(["--md", "--limit", "--json"]);
  if (argv.includes("--md") && (argv.includes("--check") || argv.includes("--ratchet"))) {
    console.error("--md checks another text: it cannot be held to, or lower, the served text's budgets");
    return 1;
  }
  const ids = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));
  const limit = Number(opt("limit") ?? 20);
  const md = opt("md");
  const targets = ids.length ? ids : ctx.ids;
  const results: Record<string, AnchorReport> = {};
  for (const id of targets) {
    const path = md ?? join(ctx.root, "reports", id, "full.md");
    if (!existsSync(path)) {
      console.error(`${id}: no ${path}`);
      return 1;
    }
    const pages = await pagesOf(await ctx.volumes(id));
    const report = checkAnchors(readFileSync(path, "utf8"), pages);
    results[id] = report;
    console.log(details(id, report, targets.length > 1 ? Math.min(limit, 5) : limit));
  }
  console.log(`\n${SUMMARY_HEAD}`);
  for (const [id, r] of Object.entries(results)) console.log(summaryRow(id, r));
  const json = opt("json");
  if (json) writeFileSync(json, JSON.stringify(results, null, 1));
  const budgetPath = join(ctx.root, "reports/anchor-budget.yaml");
  if (argv.includes("--ratchet")) {
    for (const [id, r] of Object.entries(results))
      if (ratchetOracleBudgetFile(budgetPath, id, budgetCounts(r))) console.log(`  ratcheted ${id} in reports/anchor-budget.yaml`);
  }
  if (!argv.includes("--check")) return 0;
  const budget = loadOracleBudget(budgetPath);
  let ok = true;
  console.log("\nBudgets (reports/anchor-budget.yaml)");
  for (const [id, r] of Object.entries(results)) {
    if (!budget[id]) {
      console.log(`  · ${id}: no budget`);
      continue;
    }
    const { over, slack } = checkOracleBudget(budget, id, budgetCounts(r));
    for (const o of over) console.log(`  \x1b[31m✗\x1b[0m ${id}: ${o.signal} ${o.count} > budget ${o.budget}`);
    if (over.length) ok = false;
    else console.log(`  \x1b[32m✓\x1b[0m ${id}${slack.length ? ` (under budget: ${slack.map((x) => `${x.signal} ${x.count} < ${x.budget}`).join(", ")}; pnpm ingest anchors ${id} --ratchet)` : ""}`);
  }
  return ok ? 0 : 1;
}
