import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

export type ReportRegistry = {
  reports: Array<{
    id: string;
    title: string;
    authors?: string;
    published_at?: string;
    source_path: string;
    overview_path?: string;
  }>;
};

export async function loadRegistry(): Promise<ReportRegistry> {
  const filePath = path.join(process.cwd(), "reports/registry.yaml");
  const content = await fs.readFile(filePath, "utf8");
  return parse(content) as ReportRegistry;
}
