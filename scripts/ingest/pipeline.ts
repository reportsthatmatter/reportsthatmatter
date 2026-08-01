import { extractPages, type Page } from "./extract";
import { splitPage, collapseDoubleSpacing } from "./clean";
import {
  toBlocks,
  blocksToMarkdown,
  isContentsPage,
  parseContentsPage,
  mergeAcrossPages,
  type Block,
} from "./paragraphs";
import { parseFootnotes, linkInlineMarkers, renderEndnotes, type Footnote } from "./footnotes";
import { autoFix, findSuspects, rankSuspects, type Suspect } from "./ocr";

export type IngestResult = {
  markdown: string;
  sourceText: string;
  footnotes: Footnote[];
  suspects: Suspect[];
  autoFixes: number;
  pages: number;
};

export type Metadata = {
  title: string;
  authors?: string;
  published_at?: string;
  source_url?: string;
};

/**
 * PDF → Markdown, deterministically. The same input always produces the same
 * output, so fixes belong in this pipeline rather than in hand-edits of the
 * result — that way every correction compounds across future reports.
 */
export function ingest(pdfPath: string, meta: Metadata): IngestResult {
  const pages = extractPages(pdfPath);
  return ingestPages(pages, meta);
}

export function ingestPages(pages: Page[], meta: Metadata): IngestResult {
  const sourceText = pages.map((page) => page.lines.join("\n")).join("\n");

  const footnotes: Footnote[] = [];
  const bodyChunks: Block[] = [];
  let expectedNote = 1;

  for (const page of pages) {
    const split = splitPage(page, expectedNote);

    if (split.footnotes.length) {
      const parsed = parseFootnotes(split.footnotes, page.index);
      footnotes.push(...parsed);
      if (parsed.length) expectedNote = Math.max(...parsed.map((n) => n.number)) + 1;
    }


    const pageLines = collapseDoubleSpacing(split.body);
    const blocks = isContentsPage(pageLines)
      ? parseContentsPage(pageLines)
      : toBlocks(pageLines);
    bodyChunks.push(...blocks);
  }

  let body = blocksToMarkdown(mergeAcrossPages(bodyChunks));

  const fixed = autoFix(body);
  body = fixed.text;

  const known = new Set(footnotes.map((note) => note.number));
  body = linkInlineMarkers(body, known);

  const suspects = rankSuspects(
    pages.flatMap((page) => findSuspects(page.lines.join(" "), page.index))
  );

  // Footnote and citation text is where the scan degrades worst, so the same
  // certain-substitution pass matters more here than it does in the body.
  let noteFixes = 0;
  for (const note of footnotes) {
    const result = autoFix(note.text);
    note.text = result.text;
    noteFixes += result.applied;
  }

  const endnotes = renderEndnotes(footnotes);
  const markdown = [
    frontMatter({ ...meta, pages: pages.length, footnotes: footnotes.length }),
    body,
    endnotes ? `## Notes\n\n${endnotes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimEnd()
    .concat("\n");

  return {
    markdown,
    sourceText,
    footnotes,
    suspects,
    autoFixes: fixed.applied + noteFixes,
    pages: pages.length,
  };
}

function frontMatter(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) =>
      typeof value === "number" ? `${key}: ${value}` : `${key}: ${JSON.stringify(String(value))}`
    );
  return `---\n${lines.join("\n")}\n---`;
}
