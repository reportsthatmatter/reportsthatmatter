import type { Section } from "./sections";
import type { ContentSource } from "./content";
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
 * One section's pre-rendered body, with no layout around it.
 *
 * Fragments rather than finished pages, so that the layout belongs to the app
 * and the content belongs to the report: a template change dirties no report
 * artifact, and a report can be republished without an app deploy. See the
 * content-publishing plan §2.
 *
 * The unit of request-time work is one *page*, never the whole report. There
 * used to be a `body.json` holding every section's html at once (55.5 MB
 * across ten reports, 19.0 MB for Leveson alone); a `?p=` link loaded and
 * parsed all of it to quote a single paragraph.
 */
export function loadFragment(content: ContentSource, slug: string): Promise<string | null> {
  return content.text(`fragments/${slug}.html`);
}

/**
 * The whole report's body, likewise layout-free.
 *
 * Stored rather than concatenated per request: /full for us-v-philip-morris
 * would otherwise be 129 fragment reads, and 129 R2 GETs.
 */
export function loadFullBody(content: ContentSource): Promise<string | null> {
  return content.text("full-body.html");
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

export async function loadReportMeta(content: ContentSource): Promise<PrerenderMeta | null> {
  const raw = await content.text("meta.json");
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  content: ContentSource,
  meta: PrerenderMeta,
  paragraphId: string,
  anchor?: string
): Promise<string | null> {
  const slug = meta.paragraphToSection[paragraphId];
  if (!slug) return null;

  const fragment = await loadFragment(content, slug);
  return fragment ? quotedPassage(fragment, paragraphId, anchor) : null;
}
