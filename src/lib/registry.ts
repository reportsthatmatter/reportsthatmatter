import { parse } from "yaml";

export type ReportRegistry = {
  reports: Array<{
    id: string;
    title: string;
    authors?: string;
    published_at?: string;
    source_path: string;
    overview_path?: string;
    /** Canonical location of the original document. */
    source_url?: string;
    /** What people call it ("Chilcot Report"): leads every page title (y2y8.4). */
    common_name?: string;
    /** Other names people search by; `alternateName` in the JSON-LD. */
    also_known_as?: string[];
    /** The issuing body: the `author` of the JSON-LD and of `citation_author`. `authors` stays the display byline. */
    issued_by?: string;
    /** Machine date for `published_at`: ISO 8601, `YYYY-MM-DD` or `YYYY-MM` where only the month is known. */
    date_published?: string;
    /** About events with affected communities (strategy section 8, decision 63cd): the feed leaves it out, and `pnpm editorial` / `pnpm posts` hold its highlights to the tier rule. */
    affected_community?: boolean;
    /** Quoted only on the report's own news days (strategy section 8, 80qf): the queue never schedules its items on an ordinary day. */
    news_day_only?: boolean;
    /** A factual line appended to every automated post from the report (strategy section 8, 63cd). */
    context_line?: string;
    /** The report repository on GitHub (`github.com/reportsthatmatter/<repo>`). */
    repo?: string;
    /** The report's own licence, only where a repository or processing note records one. */
    license?: { name: string; url: string };
    /**
     * The status of the report's text at source, for the per-paragraph dataset and its download page (decision 0024,
     * reportsthatmatter-9uog). Required of every report (tests/dataset.test.ts). `kind` picks the one-line label in
     * `src/lib/dataset-licences.ts`; `statement` is the honest sentence. It never says more than the report repo's LICENSE:
     * Lehman is `not-established` and Hillsborough `not-open`, and neither is called public domain or openly licensed.
     */
    text_status?: { kind: string; statement: string };
    /**
     * A report in several volumes whose printed folios restart in each (Grenfell "p. 28" is in all seven): how many, and
     * the numerals the report prints them in ("Volume I" roman, "Volume 1" arabic). Post attributions then name the volume
     * ("Vol. I, p. 91"); `volumeOf` (src/lib/editorial.ts) reads a paragraph's volume from the restarts (reportsthatmatter-s5jm).
     */
    volumes?: { count: number; numerals: "roman" | "arabic" };
  }>;
};

export async function loadRegistry(sourceMode?: string): Promise<ReportRegistry> {
  if (sourceMode === "bundled") {
    const { registryText } = await import("./bundled");
    return parse(registryText) as ReportRegistry;
  }

  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const filePath = path.join(process.cwd(), "reports/registry.yaml");
  const content = await readFile(filePath, "utf8");
  return parse(content) as ReportRegistry;
}
