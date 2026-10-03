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

/**
 * The blog's post files, keyed by slug (file name without `.md`): from the
 * Worker bundle, or from `content/posts/` on disk. See `src/lib/blog.ts`.
 */
export async function loadPostFiles(sourceMode?: string): Promise<Record<string, string>> {
  if (sourceMode === "bundled") {
    const { POST_FILES } = await import("../generated/posts-bundle");
    return POST_FILES;
  }

  const { readFile, readdir } = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "content/posts");
  const files: Record<string, string> = {};
  for (const name of (await readdir(dir)).sort()) {
    if (name.endsWith(".md")) files[name.slice(0, -3)] = await readFile(path.join(dir, name), "utf8");
  }
  return files;
}
