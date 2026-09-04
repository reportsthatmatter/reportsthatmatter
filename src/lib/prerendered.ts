import type { Section } from "./sections";
import { quotedPassage } from "../templates/report";

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

/**
 * A pre-rendered page, as text.
 *
 * The unit of request-time work is one *page*, never the whole report. There
 * used to be a `body.json` holding every section's html at once (55.5 MB
 * across ten reports, 19.0 MB for Leveson alone); a `?p=` link loaded and
 * parsed all of it to quote a single paragraph. `meta.paragraphToSection`
 * already names the section holding any paragraph, so the section page — at
 * most 0.7 MB — answers the same question. See the content-publishing plan
 * §8 step 1.
 */
export async function loadGeneratedText(
  assets: AssetsBinding | undefined,
  path: string
): Promise<string | null> {
  const response = await openGenerated(assets, path);
  return response ? response.text() : null;
}

/** The pre-rendered page for one section of a report. */
export function loadSectionPage(
  assets: AssetsBinding | undefined,
  reportId: string,
  slug: string
): Promise<string | null> {
  return loadGeneratedText(assets, `reports/${reportId}/sections/${slug}.html`);
}

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

/**
 * The words a shared link names, read back off the same pre-rendered page the
 * reader will see.
 *
 * Reading it off the render rather than recomputing it is the invariant
 * `extractParagraph` is built on — one source of ids, so a preview can never
 * disagree with the page. That is also why this does not come from D1's
 * `passages` table, which holds the same text: `paragraph_id` is an FTS5
 * `UNINDEXED` column, so a point lookup there is a table scan, and a second
 * copy of the text is a second thing that can drift.
 */
export async function loadQuotedPassage(
  assets: AssetsBinding | undefined,
  reportId: string,
  meta: PrerenderMeta,
  paragraphId: string,
  anchor?: string
): Promise<string | null> {
  const slug = meta.paragraphToSection[paragraphId];
  if (!slug) return null;

  const page = await loadSectionPage(assets, reportId, slug);
  return page ? quotedPassage(page, paragraphId, anchor) : null;
}
