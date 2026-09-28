/**
 * A report's citable-paragraph density: paragraph ids per 1,000 words of its
 * rendered text (`pnpm corpus check`'s own fingerprint numbers).
 *
 * Nothing else catches a report that ships with almost no citable text at
 * all. `pnpm ingest check` compares a report's markdown against its own
 * baseline, `pnpm corpus check` compares its rendered ids against
 * `corpus-baseline.json` — both pass a report that was broken from the day
 * it was first accepted, because a baseline records whatever shipped, not
 * whether it was right. That is exactly how uk-chilcot-inquiry's 892
 * numbered paragraphs, written to Markdown as a bare ordered list with no
 * paragraph id, sailed through both gates from ingest v0.14.0 onward:
 * `full-body.html` carried 60 `<p id>` against 1,800-12,000 on comparable
 * reports, and nothing failed (reportsthatmatter-4qw).
 *
 * Calibrated against the corpus itself, the way ingest's own
 * `digitDensityCheck` is calibrated against digit density: measured across
 * the 13 reports registered as of 2026-09-28, the legitimate floor is Jack
 * Smith's docket at 6.73/1,000 words (a short, contents-heavy filing with
 * comparatively few citable findings) and the pre-fix Chilcot measured at
 * 1.07/1,000 — an order of magnitude below every legitimate report, and
 * post-fix at 15.5, squarely inside the corpus's normal range. The threshold
 * sits well below the legitimate floor and well above the broken value, with
 * room in both directions to be wrong.
 */
export const MIN_PARAGRAPH_IDS_PER_1000_WORDS = 4;

export type DensityCheck = { ok: boolean; perThousandWords: number };

export function paragraphDensityCheck(words: number, paragraphs: number): DensityCheck {
  const perThousandWords = words ? (paragraphs / words) * 1000 : 0;
  return { ok: perThousandWords >= MIN_PARAGRAPH_IDS_PER_1000_WORDS, perThousandWords };
}
