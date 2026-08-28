import { stripRepeatedPageFurniture, takePrintedNumber, splitFootnoteBlock, type SplitPage } from "./clean";
import { bodyIndent } from "./paragraphs";

/**
 * A pass is one named decision about how to read a source.
 *
 * Passes select among implemented, tested behaviours. **A pass never takes a
 * regex or a pattern**: the moment a report's definition can express a
 * pattern it has become a second parser with no tests of its own. A report
 * that genuinely needs something bespoke writes its own pass inline — and
 * when a third report needs the same one, it moves in here.
 */

/** Runs once per page, before the document is assembled. */
export type PagePass = {
  readonly name: string;
  readonly stage: "page";
};

/** Runs over one volume's pages together. */
export type VolumePass = {
  readonly name: string;
  readonly stage: "volume";
  run(pages: SplitPage[]): SplitPage[];
};

/** Decides the document geometry the block parser measures against. */
export type GeometryPass = {
  readonly name: string;
  readonly stage: "geometry";
  readonly scope: "per-volume" | "document";
};

export type Pass = PagePass | VolumePass | GeometryPass;

/**
 * Takes the printed page number off each page. These documents are cited by
 * page ("Report at 62"), so the printed number is the citation unit readers
 * already use, and it can be checked against the original PDF.
 */
export const printedPageNumber = (): PagePass => ({
  name: "printedPageNumber",
  stage: "page",
});

/** Separates the footnote block at the foot of each page from the body. */
export const footnoteBlock = (): PagePass => ({ name: "footnoteBlock", stage: "page" });

/**
 * Removes running headers and footers that recur at a page edge.
 *
 * PDF text extraction cannot distinguish these from the body, but their
 * repeated position can: a real line of prose should not appear at the top or
 * bottom of three distinct pages. Opt in — a report whose furniture does not
 * repeat gets nothing from this, and a short report could lose a real
 * repeated line to it.
 */
export const runningFurniture = (): VolumePass => ({
  name: "runningFurniture",
  stage: "volume",
  run: stripRepeatedPageFurniture,
});

/**
 * Where the left margin is measured.
 *
 * `document` treats the whole report as one typesetting run. `per-volume`
 * measures each source volume separately, which is what a multi-volume report
 * needs: each PDF's furniture and typesetting may differ, and one global
 * margin is not meaningful across all of them. Getting this wrong turns
 * ordinary continuation lines into block quotes.
 *
 * This replaced a `pageGroups.length > 1` test — a property of the document
 * inferred from how many arguments were typed on the command line.
 */
export const geometry = (scope: "per-volume" | "document"): GeometryPass => ({
  name: `geometry(${scope})`,
  stage: "geometry",
  scope,
});

/** Re-exported so a report can compose the page-local passes directly. */
export { takePrintedNumber, splitFootnoteBlock, bodyIndent };
