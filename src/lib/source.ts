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
