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
    /** The report repository on GitHub (`github.com/reportsthatmatter/<repo>`). */
    repo?: string;
    /** The report's own licence, only where a repository or processing note records one. */
    license?: { name: string; url: string };
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
