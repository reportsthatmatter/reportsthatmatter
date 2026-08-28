import { extractPages, type Page } from "./extract";
import { splitPage, collapseDoubleSpacing } from "./clean";
import type { ResolvedPasses } from "./define";
import { applyCorrections, type Correction } from "./corrections";
import {
  toBlocks,
  blocksToMarkdown,
  isContentsPage,
  parseContentsPage,
  mergeAcrossPages,
  bodyIndent,
  type Block,
} from "./paragraphs";
import { parseFootnotes, linkInlineMarkers, renderEndnotes, type Footnote } from "./footnotes";
import { autoFix, findSuspects, rankSuspects, type Suspect } from "./ocr";

export type IngestResult = {
  markdown: string;
  corrections: number;
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
  return ingestPageGroups([extractPages(pdfPath)], meta);
}

export function ingestPages(pages: Page[], meta: Metadata): IngestResult {
  return ingestPageGroups([pages], meta);
}

/**
 * Ingests one continuous report from one or more PDFs. Multi-volume reports
 * keep a margin per source volume: each PDF's page furniture and typesetting
 * may differ, so one global margin is not meaningful across all of them.
 */
export function ingestPageGroups(
  pageGroups: Page[][],
  meta: Metadata,
  resolved: ResolvedPasses = { geometry: "document", volumePasses: [] },
  corrections: Correction[] = []
): IngestResult {
  // Volume is assigned here because this is the only place that knows the
  // order the volumes were given in — and that order is semantic: footnote
  // numbering and page indices run continuously across them.
  const pages = pageGroups.flatMap((group, groupIndex) =>
    group.map((page) => ({ ...page, volume: groupIndex + 1 }))
  ).map((page, i) => ({ ...page, index: i + 1 }));
  const sourceText = pages.map((page) => page.lines.join("\n")).join("\n");

  const footnotes: Footnote[] = [];
  const bodyChunks: Block[] = [];
  let expectedNote = 1;

  let pageOffset = 0;
  const splitGroups = pageGroups.map((group) =>
    group.map(() => {
      const split = splitPage(pages[pageOffset++], expectedNote);

      if (split.footnotes.length) {
        const parsed = parseFootnotes(split.footnotes, split.index).map((note) => ({
          ...note,
          volume: split.volume,
          pdfIndex: split.pdfIndex,
        }));
        footnotes.push(...parsed);
        if (parsed.length) expectedNote = Math.max(...parsed.map((n) => n.number)) + 1;
      }
      return split;
    })
  );

  // Which passes run is a declared property of the document, not something
  // inferred from how many arguments were typed on the command line.
  const cleanedGroups = splitGroups.map((group) =>
    resolved.volumePasses.reduce((pages, pass) => pass.run(pages), group)
  );
  const margins =
    resolved.geometry === "per-volume"
      ? cleanedGroups.map((group) => bodyIndent(group.flatMap((page) => page.body)))
      : [bodyIndent(pages.flatMap((page) => page.lines))];

  for (const [groupIndex, group] of cleanedGroups.entries()) {
    for (const split of group) {
      const pageLines = collapseDoubleSpacing(split.body);
      const at = { volume: split.volume, pdfIndex: split.pdfIndex, printed: split.printed };
      const blocks = (
        isContentsPage(pageLines)
          ? parseContentsPage(pageLines)
          : toBlocks(pageLines, margins[resolved.geometry === "per-volume" ? groupIndex : 0])
      ).map((block) => ({ ...block, at }));

      // Record where each printed page begins. These documents are cited by page
      // ("Report at 62"), so the printed number is the citation unit readers
      // already use — and it can be checked against the original PDF.
      if (split.printed !== null && blocks.length) {
        bodyChunks.push({ kind: "page", number: split.printed, at });
      }
      bodyChunks.push(...blocks);
    }
  }

  // Corrections are the last word on the text: applied after the structure is
  // settled, before it is serialised, so re-running reproduces the same output.
  const corrected = applyCorrections(
    mergeAcrossPages(bodyChunks),
    corrections,
    meta.title
  );
  let body = blocksToMarkdown(corrected.blocks);

  const fixed = autoFix(body);
  body = fixed.text;

  const known = new Set(footnotes.map((note) => note.number));
  body = linkInlineMarkers(body, known);

  const suspects = rankSuspects(
    pages.flatMap((page) =>
      findSuspects(page.lines.join(" "), page.index).map((suspect) => ({
        ...suspect,
        volume: page.volume,
        pdfIndex: page.pdfIndex,
      }))
    )
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
    frontMatter({
      ...meta,
      pages: pages.length,
      footnotes: footnotes.length,
      // Omitted at zero so a report with no corrections is unchanged, and
      // visible the moment there is a human judgement on the record.
      ...(corrected.applied ? { corrections: corrected.applied } : {}),
    }),
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
    corrections: corrected.applied,
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
