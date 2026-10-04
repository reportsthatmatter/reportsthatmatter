/**
 * Page titles that lead with what people search for (y2y8.4, marketing research/seo.md §3).
 *
 * A report is known by its common name ("Chilcot Report"), which is not its official title
 * ("The Report of the Iraq Inquiry — Executive Summary"). The registry records both; the
 * `<title>` leads with the common name and says what the page is. The official title stays in
 * the `<h1>`, the byline and the JSON-LD `name`.
 */
import { SITE_NAME } from "./structured-data";

type Named = { title: string; common_name?: string };

/** What people call the report, falling back to its official title. */
export function commonName(report: Named): string {
  return report.common_name ?? report.title;
}

/** The report's landing page: its name, then what is here. */
export function reportTitle(report: Named): string {
  return `${commonName(report)}: full text, searchable — ${SITE_NAME}`;
}

/** The whole report on one page: a distinct title from the landing page, because "full text" is itself a query. */
export function fullTextTitle(report: Named): string {
  return `${commonName(report)}: full text on one page — ${SITE_NAME}`;
}

/** A section: heading first, then the report's name. Deep pages drop the site name to save width. */
export function sectionTitle(report: Named, section: { title: string }): string {
  return `${displayHeading(section.title)} — ${commonName(report)}`;
}

/** Words that stay lower-case inside a title-cased heading. */
const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "v", "with"]);
/** Acronyms and numerals that an all-caps heading must not turn into "Cia" or "Ii". */
const KEEP = new Set([
  "US", "USA", "UK", "UN", "EU", "CIA", "FBI", "FAA", "FEMA", "NASA", "NORAD", "NSA", "DOJ", "DOD", "SEC", "BP", "IRA", "RUC", "MI5", "MI6",
  "AIG", "LBO", "TARP", "GAO", "OCS", "NEADS", "FDNY", "NYPD", "PATH", "TSA", "NTSB", "NSC", "DCI", "WTC", "AQ", "TIRC", "CTR",
  "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII",
]);

/**
 * A heading as it should read in a title or snippet. The ingest keeps headings as the source
 * sets them, and several reports set them in capitals ("COMMISSION STAFF"), which reads as
 * shouting in a result. A heading with any lower-case letter is left exactly as it is; an
 * all-caps one is title-cased, for the `<title>` only: the text on the page stays verbatim.
 */
export function displayHeading(heading: string): string {
  if (!/[A-Z]/.test(heading) || /[a-z]/.test(heading)) return heading;

  let first = true;
  return heading.replace(/[A-Za-z0-9’']+/g, (word) => {
    const lead = first;
    first = false;
    const bare = word.replace(/[^A-Za-z0-9]/g, "");
    // No vowel at all ("CTR", "NSC") means an initialism, not a word.
    if (KEEP.has(bare) || /\d/.test(word) || !/[AEIOUY]/i.test(bare)) return word;
    const lower = word.toLowerCase();
    if (!lead && SMALL.has(lower)) return lower;
    // "SHUTTLE'S" -> "Shuttle's": capitalise only the first letter.
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}
