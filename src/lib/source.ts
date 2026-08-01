export async function loadReportMarkdown(
  sourcePath: string,
  sourceMode?: string
): Promise<string> {
  if (sourceMode === "bundled") {
    const { bundledReports } = await import("./bundled");
    const bundled = bundledReports[sourcePath];
    if (!bundled) {
      throw new Error(`Bundled report not found: ${sourcePath}`);
    }
    return bundled;
  }

  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const resolvedPath = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(process.cwd(), sourcePath);
  return readFile(resolvedPath, "utf8");
}

/** The hand-written changelog, rendered at /changelog. */
export async function loadChangelog(sourceMode?: string): Promise<string> {
  if (sourceMode === "bundled") {
    const { changelogText } = await import("./bundled");
    return changelogText;
  }

  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  return readFile(path.join(process.cwd(), "docs/CHANGELOG.md"), "utf8");
}
