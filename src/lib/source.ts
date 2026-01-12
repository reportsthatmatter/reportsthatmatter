import fs from "node:fs/promises";
import path from "node:path";

export async function loadReportMarkdown(sourcePath: string): Promise<string> {
  const resolvedPath = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(process.cwd(), sourcePath);
  return fs.readFile(resolvedPath, "utf8");
}
