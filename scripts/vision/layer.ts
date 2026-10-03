/** The PDF's text layer as the verifier reads it: layout lines per page, footnote lines flagged, line-end hyphens rejoined. */
import { loadLayout, prepareLayout } from "../../src/lib/score/layout";
import { layerVocabulary, noteLines, rejoinLineHyphens } from "../../src/lib/vision/verify";

export function openLayer(repo: string) {
  const layout = loadLayout(repo);
  if (!layout) throw new Error(`no layout for ${repo} (needs a single PDF in archive/)`);
  const byPage = new Map<number, ReturnType<typeof prepareLayout>>();
  const all = prepareLayout(layout);
  for (const l of all) (byPage.get(l.page) ?? byPage.set(l.page, []).get(l.page)!).push(l);
  // the body size is the largest size that carries a real share of the text: in a note-heavy report the notes can be the modal size
  const sizeChars = new Map<number, number>();
  for (const l of all) sizeChars.set(l.size, (sizeChars.get(l.size) ?? 0) + l.text.length);
  const total = [...sizeChars.values()].reduce((a, b) => a + b, 0);
  const bodySize = Math.max(...[...sizeChars.entries()].filter(([, c]) => c >= 0.15 * total).map(([s]) => s));
  const vocab = layerVocabulary(all);
  return {
    bodySize,
    sizes: [...sizeChars.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, c]) => `${s}:${Math.round((100 * c) / total)}%`).join(" "),
    /** a page's lines in reading order, `note` set on footnote lines, words broken at the line end whole again */
    lines: (page: number) => rejoinLineHyphens(noteLines(byPage.get(page) ?? [], bodySize), vocab),
    /** the same without the hyphen rejoin (what pdftotext hands the pipeline) */
    rawLines: (page: number) => noteLines(byPage.get(page) ?? [], bodySize),
  };
}
