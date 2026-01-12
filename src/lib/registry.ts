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
