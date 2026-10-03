import { SITE_ORIGIN } from "../templates/card";

export type ReportLike = {
  id?: string;
  title: string;
  authors?: string;
  published_at?: string;
  source_url?: string;
  common_name?: string;
  also_known_as?: string[];
  issued_by?: string;
  date_published?: string;
  repo?: string;
  license?: { name: string; url: string };
};

export const SITE_NAME = "Reports that Matter";

/** The edition's publisher: this project, as opposed to the body that issued the report. */
const PUBLISHER = { "@type": "Organization", name: SITE_NAME, url: SITE_ORIGIN } as const;

/**
 * Serialise for a `<script type="application/ld+json">` block. `<` is escaped so that no
 * string (a title, a quoted passage) can close the script element or open a comment.
 */
export function serialiseJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** The body that issued the report. Falls back to the byline for a report with none recorded. */
function issuer(report: ReportLike): { "@type": "Organization"; name: string } | undefined {
  const name = report.issued_by ?? report.authors;
  return name ? { "@type": "Organization", name } : undefined;
}

/** The official document this edition is made from: the provenance claim the project rests on. */
function original(report: ReportLike): Record<string, unknown> | undefined {
  if (!report.source_url) return undefined;
  const body = issuer(report);
  return {
    "@type": "CreativeWork",
    name: report.title,
    url: report.source_url,
    ...(body ? { author: body, publisher: body } : {}),
    ...(report.date_published ? { datePublished: report.date_published } : {}),
  };
}

/** What every page of a report says about the report itself (the Report page, and each section of it). */
function reportFacts(report: ReportLike): Record<string, unknown> {
  const body = issuer(report);
  const based = original(report);
  return {
    inLanguage: "en",
    isAccessibleForFree: true,
    ...(body ? { author: body, sourceOrganization: body } : {}),
    publisher: PUBLISHER,
    // ISO 8601 or nothing: the free-text `published_at` ("22 July 2004") is not a valid date.
    ...(report.date_published ? { datePublished: report.date_published } : {}),
    ...(based ? { isBasedOn: based } : {}),
    ...(report.license ? { license: report.license.url } : {}),
    ...(report.repo ? { archivedAt: `https://github.com/reportsthatmatter/${report.repo}` } : {}),
  };
}

/**
 * JSON-LD for a report.
 *
 * `Report` is the vocabulary's own type for exactly this — a formal document
 * issued by an organisation — and using it rather than a generic `Article`
 * costs nothing and says what the thing actually is. The author is the issuing
 * body (the commission, the inquiry, the court), the publisher of this edition
 * is us, and `isBasedOn` is the original document.
 */
export function reportJsonLd(report: ReportLike, description: string): string {
  const alternateName = [report.common_name, ...(report.also_known_as ?? [])].filter(
    (name): name is string => Boolean(name) && name !== report.title
  );
  const url = `${SITE_ORIGIN}/reports/${report.id ?? ""}`;

  return serialiseJsonLd({
    "@context": "https://schema.org",
    "@type": "Report",
    name: report.title,
    headline: report.title,
    ...(alternateName.length ? { alternateName } : {}),
    description,
    url,
    ...reportFacts(report),
  });
}

/**
 * JSON-LD for one section of a report: a `Report` part (so it carries the same author, date
 * and provenance as the whole) that says which report it belongs to, plus the breadcrumbs.
 */
export function sectionJsonLd(
  report: ReportLike,
  section: { title: string; slug: string },
  description: string
): string {
  const reportUrl = `${SITE_ORIGIN}/reports/${report.id ?? ""}`;
  return serialiseJsonLd([
    {
      "@context": "https://schema.org",
      "@type": "Report",
      name: section.title,
      headline: section.title,
      description,
      url: `${reportUrl}/${section.slug}`,
      isPartOf: { "@type": "Report", name: report.title, url: reportUrl },
      ...reportFacts(report),
    },
    JSON.parse(
      breadcrumbJsonLd([
        { name: "Reports", path: "/reports" },
        { name: report.title, path: `/reports/${report.id ?? ""}` },
        { name: section.title, path: `/reports/${report.id ?? ""}/${section.slug}` },
      ])
    ),
  ]);
}

/** The home page: the site, and the organisation behind it. (No `SearchAction`: Google retired the sitelinks search box in 2024.) */
export function siteJsonLd(): string {
  return serialiseJsonLd([
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_ORIGIN,
      inLanguage: "en",
      publisher: PUBLISHER,
    },
    { "@context": "https://schema.org", ...PUBLISHER },
  ]);
}

/** Breadcrumbs so a section reads as part of its report in search results. */
export function breadcrumbJsonLd(
  trail: Array<{ name: string; path: string }>
): string {
  return serialiseJsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: `${SITE_ORIGIN}${entry.path}`,
    })),
  });
}

/**
 * Highwire Press `citation_*` tags, which Google Scholar and reference managers (Zotero, Mendeley)
 * read. Report-level pages only. Google Scholar will probably not index a government report split
 * over many pages, so this is for citation managers rather than for ranking (seo.md §Scholar).
 *
 * `citation_pdf_url` is deliberately absent: the only PDF is the official one, on someone else's
 * site, and the tag means "the PDF served here". `citation_fulltext_html_url` is the whole report
 * on one page, which we do serve.
 */
export function citationMeta(report: ReportLike): Array<{ name: string; content: string }> {
  const author = report.issued_by ?? report.authors;
  const reportUrl = `${SITE_ORIGIN}/reports/${report.id ?? ""}`;
  const tags: Array<[string, string | undefined]> = [
    ["citation_title", report.title],
    ["citation_author", author],
    // Scholar's format is yyyy/mm/dd (month and day optional).
    ["citation_publication_date", report.date_published?.replace(/-/g, "/")],
    ["citation_technical_report_institution", author],
    ["citation_publisher", SITE_NAME],
    ["citation_language", "en"],
    ["citation_abstract_html_url", reportUrl],
    ["citation_fulltext_html_url", `${reportUrl}/full`],
  ];
  return tags.flatMap(([name, content]) => (content ? [{ name, content }] : []));
}
