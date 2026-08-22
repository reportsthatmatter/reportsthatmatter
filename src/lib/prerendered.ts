import type { Section } from "./sections";

/** Cloudflare's static-assets binding; absent under local Node/vitest. */
export type AssetsBinding = { fetch: (request: Request) => Promise<Response> };

/** A section's contents-listing metadata, without the html that makes a report multi-megabyte. */
export type LightSection = Omit<Section, "html">;

/**
 * The cheap, always-loaded half of a pre-rendered report (#115): a word
 * count computed once at build time rather than derived from html on every
 * request, the section list for the contents page, and a paragraph → section
 * lookup so a `?p=` link can be routed without fetching the report body.
 */
export type PrerenderMeta = {
  words: number;
  pages?: number;
  sections: LightSection[];
  paragraphToSection: Record<string, string>;
};

/** The expensive half: the whole rendered report body, with sections split. Fetched only when actually needed. */
export type ReportBody = {
  html: string;
  sections: Section[];
};

/**
 * Reads a file under `assets/generated/`, the same way `/assets/*` already
 * reads the rest of that directory: via the Cloudflare static-assets binding
 * where it exists, or straight off disk under Node (dev without `--local`,
 * and the vitest suite, which calls `app.request()` directly with no
 * binding). Returns null rather than throwing — every caller treats a
 * missing pre-rendered artifact as "fall back to what request-time can
 * still do", not as a reason to fail the page.
 */
export async function openGenerated(
  assets: AssetsBinding | undefined,
  path: string
): Promise<Response | null> {
  if (assets) {
    const response = await assets.fetch(new Request(`https://assets.internal/generated/${path}`));
    return response.ok ? response : null;
  }

  const { readFile } = await import("node:fs/promises");
  const nodePath = await import("node:path");
  try {
    const contents = await readFile(nodePath.join(process.cwd(), "assets/generated", path));
    return new Response(contents, {
      headers: { "content-type": path.endsWith(".json") ? "application/json" : "text/html" },
    });
  } catch {
    return null;
  }
}

export async function loadReportMeta(
  assets: AssetsBinding | undefined,
  reportId: string
): Promise<PrerenderMeta | null> {
  const response = await openGenerated(assets, `reports/${reportId}/meta.json`);
  if (!response) return null;
  return response.json();
}

export async function loadReportBody(
  assets: AssetsBinding | undefined,
  reportId: string
): Promise<ReportBody | null> {
  const response = await openGenerated(assets, `reports/${reportId}/body.json`);
  if (!response) return null;
  return response.json();
}
