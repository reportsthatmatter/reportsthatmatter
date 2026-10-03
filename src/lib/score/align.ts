/**
 * Monotone word alignment of two token streams (ours and a reference edition).
 *
 * The aligner lives in @rtm/ingest now (src/align.ts): the hybrid source mode
 * (`cleanEdition`, reportsthatmatter-ivg.1) stamps printed pages with it, and
 * the scorer measures with the same one rather than a second copy. How it
 * works: unique 7-word anchors, their longest increasing subsequence as the
 * skeleton, gaps filled by an exact LCS plus split and joined words, and a gap
 * whose matches do not form runs left unaligned (docs/scoring.md).
 */
export { align } from "@rtm/ingest";
export type { Alignment, AlignOptions } from "@rtm/ingest";
