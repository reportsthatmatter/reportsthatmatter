/**
 * The ingestion library's public surface.
 *
 * This is what a report's `ingest.ts` imports, and it is the module that
 * becomes `@rtm/ingest` when reports move to their own repos. Everything else
 * in this directory is internal: importing it directly from a report couples
 * that report to an implementation detail that is free to change.
 *
 * See README.md for what a pass is and when one gets promoted into here.
 */
export { pipeline, resolvePasses } from "./define";
export type { PipelineDef, Volume, ResolvedPasses } from "./define";

export {
  printedPageNumber,
  footnoteBlock,
  runningFurniture,
  geometry,
} from "./passes";
export type { Pass, PagePass, VolumePass, GeometryPass } from "./passes";

// For a report that needs a bespoke pass: the building blocks to write one.
export { takePrintedNumber, splitFootnoteBlock, bodyIndent } from "./passes";
export type { SplitPage } from "./clean";
