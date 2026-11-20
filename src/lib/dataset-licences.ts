/**
 * The one-line licence label for each kind of text status in the registry (`text_status.kind`), used as the `licence`
 * column of the per-paragraph dataset and on /data (decision 0024, reportsthatmatter-9uog).
 *
 * The labels are deliberately plain and hedged where the evidence is: a kind that is not an established licence never
 * contains "public domain" or "Open Government Licence" unqualified (tests/dataset.test.ts checks it).
 */
export const LICENCE_LABELS: Record<string, string> = {
  "us-government": "Public domain (US federal government work)",
  "us-government-assumed": "Treated as a US federal government work (public domain); not confirmed",
  "public-domain-notice": "Public domain by the report's own notice, except as noted",
  ogl: "Open Government Licence v3.0 (UK Crown copyright)",
  "ogl-unversioned": "Open Government Licence, version not stated (UK Crown copyright)",
  "ogl-via-govuk": "UK Crown copyright; Open Government Licence v3.0 as published on GOV.UK, imprint gives HMSO reuse terms",
  "not-established": "Copyright not established",
  "not-open": "Not under an open licence we can find",
};

/** Kinds whose text is not under a licence we can name: the page and the dataset card say so first. */
export const UNCONFIRMED_KINDS = ["not-established", "not-open"];

/** The licence of what we add (markup, ids, editorial text), the same for every report (decision 0024). */
export const OUR_ADDITIONS_LICENCE = { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" };
