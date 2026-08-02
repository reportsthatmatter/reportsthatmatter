import { SITE_ORIGIN } from "../templates/card";

type ReportLike = {
  id?: string;
  title: string;
  authors?: string;
  published_at?: string;
  source_url?: string;
};

/**
 * JSON-LD for a report.
 *
 * `Report` is the vocabulary's own type for exactly this — a formal document
 * issued by an organisation — and using it rather than a generic `Article`
 * costs nothing and says what the thing actually is. `isBasedOn` points at the
 * original PDF, which is the provenance claim the whole project rests on.
 */
export function reportJsonLd(report: ReportLike, description: string): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Report",
    name: report.title,
    headline: report.title,
    description,
    url: `${SITE_ORIGIN}/reports/${report.id ?? ""}`,
    inLanguage: "en",
    isAccessibleForFree: true,
    publisher: {
      "@type": "Organization",
      name: "Reports that Matter",
      url: SITE_ORIGIN,
    },
  };

  if (report.authors) data.author = { "@type": "Organization", name: report.authors };
  if (report.published_at) data.datePublished = report.published_at;
  if (report.source_url) data.isBasedOn = report.source_url;

  return JSON.stringify(data);
}

/** Breadcrumbs so a section reads as part of its report in search results. */
export function breadcrumbJsonLd(
  trail: Array<{ name: string; path: string }>
): string {
  return JSON.stringify({
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
