import { slugify } from "./markdown";

export type Section = {
  slug: string;
  title: string;
  html: string;
  /** First printed page the section covers, for the contents listing. */
  page?: string;
  /**
   * The heading level the section split on — 2 for a top-level part, 3 for a
   * subsection. Front matter (no heading) counts as top-level. The contents
   * listing uses this to show which sections nest under which, rather than a
   * flat list a reader has to reverse-engineer from title-casing.
   */
  level: 2 | 3;
};

/**
 * Splits a rendered report into its own top-level sections.
 *
 * The split happens on the *rendered* HTML rather than the markdown so that
 * paragraph ids are identical to the ones on `/full`. Ids are de-duplicated
 * across the whole document, so rendering sections independently would give
 * some of them different addresses depending on which page they were served
 * from — and an address that depends on the route is not an address.
 */
/**
 * Below this much text a "section" is a title-page fragment, not a section.
 * The PSI report's cover names each staff member on its own line, and every
 * one of them parses as a heading.
 */
const MIN_SECTION_CHARS = 2500;

export function splitSections(html: string, minChars = MIN_SECTION_CHARS): Section[] {
  // Split on subsections as well as sections. In a 645-page report a single
  // top-level section can run to a megabyte — larger than the whole document we
  // were trying to break up — and its own subsections are the natural seam.
  const parts = mergeSlivers(html.split(/(?=<h[23]\b)/), minChars);
  const sections: Section[] = [];
  const taken = new Set<string>();

  for (const part of parts) {
    const heading = part.match(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/);

    // Anything before the first heading is front matter for the report.
    const title = heading ? stripTags(heading[2]) : "Front matter";
    if (!part.trim()) continue;

    const base = slugify(title) || "section";
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);

    sections.push({
      slug,
      title,
      html: part,
      page: part.match(/id="page-(\d+)(?:-\d+)?"/)?.[1],
      level: heading ? (Number(heading[1]) as 2 | 3) : 2,
    });
  }

  return sections;
}

/** Which section holds a given paragraph, so a shared link can be routed. */
export function sectionFor(sections: Section[], paragraphId: string): Section | null {
  const needle = `id="${paragraphId}"`;
  return sections.find((section) => section.html.includes(needle)) ?? null;
}

/**
 * Every paragraph id in the document, mapped to the slug of its section.
 *
 * `sectionFor` needs each section's full `html` to answer the same question,
 * which is fine when a request already has it loaded — and too much to fetch
 * just to route a `?p=` link when the pre-rendered path (#115) keeps html out
 * of the small per-report metadata. This is the version of the lookup that
 * only needs ids, computed once at build time from the same sections.
 */
export function paragraphIndex(sections: Section[]): Record<string, string> {
  const index: Record<string, string> = {};
  const idPattern = /\bid="([a-z0-9-]+)"/g;

  for (const section of sections) {
    for (const match of section.html.matchAll(idPattern)) {
      if (!(match[1] in index)) index[match[1]] = section.slug;
    }
  }

  return index;
}

/**
 * Folds a too-short part into the one before it, so the contents lists sections
 * a reader would recognise as sections. The heading survives in the body, so
 * nothing is hidden — it just stops being a page of its own.
 *
 * One exception: a numbered-division heading with no body of its own — an
 * inquiry's "Part 4:" divider, which is followed straight away by its first
 * chapter — must not fold *backwards* into the part before it, or the
 * contents page loses the part entirely and lists its chapters with nothing
 * above them. It folds forwards instead, onto its own chapters, and heads
 * that section.
 */
const DIVISION_HEADING =
  /^<h2\b[^>]*>(?:<[^>]+>)*\s*(?:Part|Appendix|Annex|Volume)\s+(?:\d|[IVXLC])/i;
function mergeSlivers(parts: string[], minChars: number): string[] {
  const merged: string[] = [];
  // A pending top-level divider, accumulating its chapters until it is a
  // section a reader would recognise as one.
  let divider = "";

  for (const part of parts) {
    if (!part.trim()) continue;

    if (divider) {
      divider += part;
      if (textLength(divider) >= minChars) {
        merged.push(divider);
        divider = "";
      }
      continue;
    }

    if (DIVISION_HEADING.test(part) && textLength(part) < minChars) {
      divider = part;
      continue;
    }

    if (merged.length && textLength(part) < minChars) {
      merged[merged.length - 1] += part;
      continue;
    }
    merged.push(part);
  }

  if (divider) {
    if (merged.length) merged[merged.length - 1] += divider;
    else merged.push(divider);
  }

  // A leading sliver has nothing before it to fold into; fold it forward.
  while (merged.length > 1 && textLength(merged[0]) < minChars) {
    merged[1] = merged[0] + merged[1];
    merged.shift();
  }

  return merged;
}

function textLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function stripTags(value: string): string {
  // Decode as well as strip: the title is re-escaped when it is written back
  // out, and without decoding first an ampersand becomes &amp;amp;.
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
