/**
 * Word tokens for alignment: runs of letters and digits, lower-cased, with
 * diacritics folded, offsets into the original string. In @rtm/ingest
 * (src/tokens.ts) with the aligner (reportsthatmatter-ivg.1).
 */
export { tokens, words, fold, tokensBefore, hasLetter } from "@rtm/ingest";
export type { Token } from "@rtm/ingest";
