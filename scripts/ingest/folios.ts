/**
 * `pnpm ingest folios <id> [--pages all|N|N-M] [--limit N] [--json <file>]` (reportsthatmatter-vwqr): what the ingest read as
 * each PDF page's printed number, and why a page marker says what it says. Re-ingests the report in memory (nothing is
 * written), then prints the offset runs (printed minus PDF page), the stray reads, the pages with none, and the source of
 * each page (pipeline, vision, HTML). `--pages` adds one row per page. `--json` is what `pnpm ingest try` reads for its
 * "pages that changed source" view, once per side.
 *
 * The rule that decides what is a run and what is stray is `strayFolios` in @rtm/ingest (the one `foliosInStep` applies),
 * through `folioReport`: this file only runs the report and formats the result. Needs an ingest that has `folioReport`.
 */
import { writeFileSync } from "node:fs";
import { formatFolios, parsePagesArg, type FolioReport, type FolioRowsFilter } from "../lib/folios.ts";

type Ctx = {
  ids: string[];
  /** Re-ingests the report in memory: the result `folioReport` reads. */
  run(id: string): Promise<unknown>;
  folioReport: ((result: unknown) => FolioReport) | undefined;
};

export async function runFolios(argv: string[], ctx: Ctx): Promise<number> {
  const opt = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const valued = new Set(["--pages", "--limit", "--json"]);
  const ids = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));
  if (!ids.length) {
    console.error("usage: pnpm ingest folios <id>... [--pages all|N|N-M] [--limit N] [--json <file>]");
    return 1;
  }
  let pages: FolioRowsFilter | undefined;
  if (argv.includes("--pages")) {
    pages = parsePagesArg(opt("pages") ?? "");
    if (!pages) {
      console.error("--pages takes all, a PDF page (12) or a range (12-40)");
      return 1;
    }
  }
  if (!ctx.folioReport) {
    console.error("The installed @rtm/ingest has no folioReport (added after v0.22.0): link an ingest that has it (pnpm ingest link <dir>) or bump the pin.");
    return 1;
  }
  const limit = Number(opt("limit") ?? 20);
  const out: Record<string, FolioReport> = {};
  for (const id of ids) {
    if (!ctx.ids.includes(id)) {
      console.error(`${id} is not in reports/manifest.yaml`);
      return 1;
    }
    out[id] = ctx.folioReport(await ctx.run(id));
    console.log(formatFolios(id, out[id], { pages, limit }));
  }
  const json = opt("json");
  if (json) writeFileSync(json, JSON.stringify(out));
  return 0;
}
