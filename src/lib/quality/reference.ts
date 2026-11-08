/** The headings of a report's tagged-PDF reference (reference/blocks.jsonl), for `heading-census-shortfall` (0iof). */

export type ReferenceHeadings = { headings: { level: number; text: string; page: number | null }[] };

/**
 * Null unless the manifest says the reference came from the `tagged` adapter, version 2 or later (the tag tree is the PDF's own
 * structure; the other adapters' heading levels are not comparable). Contents heads (`TOC_*` tags) are left out.
 */
export function taggedHeadings(blocksJsonl: string, manifestJson: string): ReferenceHeadings | null {
  let normaliser = "";
  try {
    normaliser = String(JSON.parse(manifestJson)?.blocks?.normaliser ?? "");
  } catch {
    return null;
  }
  // Version 1 (Columbia) predates the heading levels the comparison reads.
  if (!/adapter tagged, version [2-9]/.test(normaliser)) return null;
  const headings: ReferenceHeadings["headings"] = [];
  for (const line of blocksJsonl.split("\n")) {
    if (!line.trim()) continue;
    const b = JSON.parse(line) as { type: string; level: number | null; text: string; page: number | null; tag?: string };
    if (b.type !== "heading" || b.level === null || /^TOC/i.test(b.tag ?? "")) continue;
    headings.push({ level: b.level, text: b.text, page: b.page });
  }
  return { headings };
}
