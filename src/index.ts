import { Hono } from "hono";
import { loadRegistry } from "./lib/registry";
import { renderMarkdown } from "./lib/markdown";
import { loadReportMarkdown, loadChangelog } from "./lib/source";
import { renderIndex, renderReportsIndex } from "./templates/index";
import { renderReport } from "./templates/report";
import { renderAbout } from "./templates/about";
import { renderNotFound } from "./templates/not-found";
import { renderChangelog } from "./templates/changelog";
import { renderHighlights } from "./templates/highlights";
import { renderReportOverview, renderSection, type TopPassage } from "./templates/section";
import { splitSections, sectionFor, type Section } from "./lib/sections";
import { memo } from "./lib/prepared";
import { encodeAnchor } from "../assets/anchor.js";
import { extractParagraph, quotedPassage } from "./templates/report";
import {
  actorHash,
  markCounts,
  parseMarkPayload,
  recordMark,
  todayUTC,
  type MarksDB,
} from "./lib/marks";

export type Bindings = {
  /** Cloudflare static-assets binding; absent under local Node/vitest. */
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  /** "bundled" reads reports from the worker bundle, otherwise from disk. */
  REPORTS_SOURCE?: string;
  /**
   * Where the pre-V2 site now lives — a full base URL, which may carry a path
   * prefix (GitHub Pages serves project sites under /<repo>/).
   */
  LEGACY_BASE?: string;
  /** Social proof (#96): who marked what. Absent under Node/vitest unless a test supplies a fake. */
  DB?: MarksDB;
  /** Secret folded into the daily actor hash. A dev fallback is fine locally — nothing is at stake below account-scale abuse. */
  MARK_SALT?: string;
  /** Readers a passage needs before it is shown back. Defaults to 1 — see #96. */
  MARK_THRESHOLD?: string;
};

/**
 * Sections of the previous site. The domain has real traffic and years of
 * inbound links, so these must not become dead ends just because we replaced
 * what sits at the root.
 */
export const LEGACY_PATHS = [
  "/iraq-inquiry",
  "/enron-report",
  "/psi-financial-crisis",
  "/climate-action-us-senate-2014",
  "/new-inquiries",
  "/pages",
  "/search",
  "/feed.xml",
];

/**
 * Report ids that have changed. A citable URL is the product, so a renamed
 * report redirects rather than 404s — including within our own short history.
 */
export const RENAMED_REPORTS: Record<string, string> = {
  "us-senate-wall-street-and-financial-crisis": "us-psi-financial-crisis",
};

/** Joins the legacy base to a path, tolerating a trailing slash on the base. */
export function legacyUrl(base: string, pathAndQuery: string): string {
  return `${base.replace(/\/$/, "")}${pathAndQuery}`;
}

export function isLegacyPath(pathname: string): boolean {
  return LEGACY_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.text("ok"));

// Send the old site's URLs to wherever the old site now lives, before any
// route can claim them.
/**
 * Serves the archived pre-V2 site on old.reportsthatmatter.org.
 *
 * The record is proxied through Cloudflare, so GitHub cannot issue a
 * certificate for the host and its own custom-domain support is unusable.
 * A Workers route can claim a proxied hostname, though, so the Worker fetches
 * the archive from GitHub Pages and serves it under our own certificate. The
 * archive lives under /<repo>/ there, which the path prefix supplies.
 */
async function serveArchive(url: URL, request: Request, base: string): Promise<Response> {
  const upstream = new URL(legacyUrl(base, url.pathname + url.search));
  const response = await fetch(upstream, {
    method: "GET",
    headers: { accept: request.headers.get("accept") ?? "*/*" },
    redirect: "follow",
  });

  const headers = new Headers(response.headers);
  headers.delete("content-security-policy");
  // It is an archive; let it cache, but not so long that a fix cannot land.
  headers.set("cache-control", "public, max-age=3600");
  headers.set("x-rtm-archive", "pre-v2");

  return new Response(response.body, { status: response.status, headers });
}

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);

  if (url.hostname.startsWith("old.")) {
    const base = c.env?.LEGACY_BASE;
    if (!base) return c.text("Archive not configured", 503);
    return serveArchive(url, c.req.raw, base);
  }

  // One canonical host, so links and analytics do not split in two.
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
    return c.redirect(url.toString(), 301);
  }

  // The old site's URLs now live on their own subdomain.
  if (isLegacyPath(url.pathname)) {
    url.hostname = `old.${url.hostname}`;
    return c.redirect(url.toString(), 301);
  }

  await next();
});

app.get("/assets/*", async (c) => {
  if (c.env?.ASSETS) {
    const url = new URL(c.req.url);
    url.pathname = url.pathname.replace(/^\/assets/, "");
    return c.env.ASSETS.fetch(new Request(url, c.req.raw));
  }

  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const assetPath = c.req.path.replace(/^\/assets\//, "");
  const filePath = path.join(process.cwd(), "assets", assetPath);
  const contents = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const contentType = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  }[extension];

  return c.body(contents, 200, {
    "content-type": contentType ?? "application/octet-stream",
  });
});

app.get("/", async (c) => {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  const registry = await loadRegistry(sourceMode);
  return c.html(renderIndex(registry));
});

app.get("/reports", async (c) => {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  const registry = await loadRegistry(sourceMode);
  return c.html(renderReportsIndex(registry));
});

app.get("/about", (c) => c.html(renderAbout()));

// The reader's own highlights. The server holds none of them — this is the
// shell, and the browser fills it from local storage.
app.get("/highlights", (c) => c.html(renderHighlights()));

/**
 * A sitemap listing every section of every report.
 *
 * These documents should be *the* search result for phrases they contain, and
 * a crawler will not find 80 section pages from a homepage that links two
 * reports. Sections rather than /full: a 300 KB page ranks worse than the
 * section that actually answers the query.
 */
app.get("/sitemap.xml", async (c) =>
  cached(c, async () => {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  const registry = await loadRegistry(sourceMode);
  const origin = new URL(c.req.url).origin;

  const urls: Array<{ loc: string; priority: string }> = [
    { loc: "/", priority: "1.0" },
    { loc: "/reports", priority: "0.9" },
    { loc: "/about", priority: "0.7" },
    { loc: "/changelog", priority: "0.4" },
  ];

  for (const report of registry.reports) {
    urls.push({ loc: `/reports/${report.id}`, priority: "0.9" });
    const markdown = await loadReportMarkdown(report.source_path, sourceMode);
    for (const section of splitSections(renderMarkdown(markdown))) {
      urls.push({ loc: `/reports/${report.id}/${section.slug}`, priority: "0.8" });
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (entry) =>
      `  <url><loc>${origin}${entry.loc}</loc><priority>${entry.priority}</priority></url>`
  )
  .join("\n")}
</urlset>`;

  return c.body(body, 200, {
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, max-age=3600",
  });
  })
);

app.get("/robots.txt", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.text(
    `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
    200,
    { "content-type": "text/plain; charset=utf-8" }
  );
});

app.get("/changelog", async (c) => {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  return c.html(renderChangelog(await loadChangelog(sourceMode)));
});

/** Loads a report and its rendered sections, or null if there is no such report. */
async function loadReport(c: any, reportId: string) {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  const registry = await loadRegistry(sourceMode);
  const report = registry.reports.find((entry: { id: string }) => entry.id === reportId);
  if (!report) return null;

  const markdown = await loadReportMarkdown(report.source_path, sourceMode);
  // Rendering costs more CPU than one request is allowed, so an isolate does
  // it once and every later request on that isolate is nearly free. See
  // src/lib/prepared.ts — a holding measure until #107.
  const prepared = memo(`${sourceMode}:${reportId}`, () => {
    const html = renderMarkdown(markdown);
    return { html, sections: splitSections(html) };
  });

  return { report, html: prepared.html, sections: prepared.sections };
}

/**
 * Serve a page from the edge cache, and put it there when it is built.
 *
 * A cache hit costs almost no CPU, which is the whole point: the expensive
 * render happens once per edge rather than once per reader. Report pages are
 * immutable between deploys, so they can be held for a long time.
 */
async function cached(
  c: any,
  build: () => Promise<Response>,
  maxAge = 86400
): Promise<Response> {
  // `caches` is absent under Node, where the tests run.
  if (typeof caches === "undefined" || c.req.method !== "GET") return build();

  const cache = (caches as any).default;
  const key = new Request(c.req.url, { method: "GET" });

  const hit = await cache.match(key);
  if (hit) return hit;

  const response = await build();
  if (response.status === 200) {
    const store = new Response(response.body, response);
    store.headers.set("cache-control", `public, max-age=${maxAge}`);
    c.executionCtx?.waitUntil?.(cache.put(key, store.clone()));
    return store;
  }

  return response;
}

/**
 * Record one marking event: a reader shared or saved a passage.
 *
 * Recording is a courtesy, not a promise — a slow or unavailable database must
 * never turn into a failed share or a failed save, so every path here answers
 * with a plain status and swallows what it can.
 */
app.post("/api/mark", async (c) => {
  const db = c.env?.DB;
  if (!db) return c.body(null, 204);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.text("Bad request", 400);
  }

  const event = parseMarkPayload(payload);
  if (!event) return c.text("Bad request", 400);

  const secret = c.env?.MARK_SALT ?? "dev-salt";
  const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
  const ua = c.req.header("user-agent") ?? "";
  const now = Date.now();

  try {
    const actor = await actorHash(secret, todayUTC(now), ip, ua);
    const result = await recordMark(db, event, actor, now);
    return c.body(null, result === "ok" ? 204 : 429);
  } catch (err) {
    return c.body(null, 204);
  }
});

/**
 * What other readers marked in this report, above the display threshold.
 *
 * Deliberately uncached, unlike the report pages: Rufus wants a passage to
 * show up the moment one reader has marked it, and edge-caching this even
 * briefly means the *first* reader's own page load — which fetches this
 * before they have marked anything — could freeze an empty result in place
 * for everyone behind it. A D1 read here is cheap; staleness is not worth it.
 *
 * A D1 failure must still serve an (empty) list — social proof is an
 * enhancement, never a reason the marks a page already has stop rendering.
 */
app.get("/reports/:id/marks", async (c) => {
  const db = c.env?.DB;
  const threshold = Number(c.env?.MARK_THRESHOLD ?? 1);
  if (!db) return c.json([]);

  try {
    return c.json(await markCounts(db, c.req.param("id"), threshold));
  } catch (err) {
    return c.json([]);
  }
});

app.get("/reports/:id", async (c) => {
  const reportId = c.req.param("id");
  const renamed = RENAMED_REPORTS[reportId];
  if (renamed) {
    const url = new URL(c.req.url);
    url.pathname = `/reports/${renamed}`;
    return c.redirect(url.toString(), 301);
  }

  const loaded = await loadReport(c, reportId);
  if (!loaded) return c.html(renderNotFound(false), 404);

  // A link naming a passage goes straight to the section holding it. This is
  // why share links carry ?p= as well as the fragment: the fragment never
  // reaches us, so without it a shared link could not be routed at all.
  const paragraph = c.req.query("p");
  if (paragraph) {
    const section = sectionFor(loaded.sections, paragraph);
    if (section) {
      // ?h= names the words within that paragraph and has to survive the hop,
      // or a shared quote arrives as a plain paragraph link.
      const quote = c.req.query("h");
      const anchor = quote ? `&h=${encodeURIComponent(quote)}` : "";
      return c.redirect(
        `/reports/${reportId}/${section.slug}?p=${encodeURIComponent(paragraph)}${anchor}#${paragraph}`,
        302
      );
    }
  }

  const words = loaded.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const topMarked = await topMarkedPassages(c.env, reportId, loaded.html, loaded.sections);
  return c.html(
    renderReportOverview(loaded.report, loaded.sections, { words }, topMarked)
  );
});

/**
 * The best-input-to-quote-cards, human-facing version of `markCounts`: the
 * top few passages, with the text and link to show for each. Best-effort —
 * an empty list here costs a reader nothing, so any failure degrades to that
 * rather than to a broken contents page.
 */
async function topMarkedPassages(
  env: Bindings | undefined,
  reportId: string,
  html: string,
  sections: Section[]
): Promise<TopPassage[]> {
  const db = env?.DB;
  if (!db) return [];

  const threshold = Number(env?.MARK_THRESHOLD ?? 1);
  const LIMIT = 5;

  try {
    const counts = await markCounts(db, reportId, threshold);
    const top: TopPassage[] = [];
    for (const row of counts) {
      if (top.length >= LIMIT) break;
      const section = sectionFor(sections, row.paragraph);
      const paragraph = extractParagraph(html, row.paragraph);
      if (!section || !paragraph) continue;

      const anchor = encodeAnchor({ prefix: row.prefix, exact: row.exact, suffix: row.suffix });
      const quote = anchor ? quotedPassage(html, row.paragraph, anchor) : paragraph;
      if (!quote) continue;

      const query = anchor ? `&h=${anchor}` : "";
      top.push({
        quote,
        page: row.page,
        readers: row.readers,
        url: `/reports/${reportId}/${section.slug}?p=${encodeURIComponent(row.paragraph)}${query}#${row.paragraph}`,
      });
    }
    return top;
  } catch (err) {
    return [];
  }
}

app.get("/reports/:id/full", async (c) =>
  cached(c, async () => {
    const loaded = await loadReport(c, c.req.param("id"));
    if (!loaded) return c.html(renderNotFound(false), 404);
    return c.html(
      renderReport(loaded.report, loaded.html, c.req.query("p"), c.req.query("h"))
    );
  })
);

app.get("/reports/:id/:section", async (c) =>
  cached(c, async () => {
    const loaded = await loadReport(c, c.req.param("id"));
    if (!loaded) return c.html(renderNotFound(false), 404);

    const slug = c.req.param("section");
    const index = loaded.sections.findIndex((section) => section.slug === slug);
    if (index === -1) return c.html(renderNotFound(false), 404);

    return c.html(
      renderSection(
        loaded.report,
        loaded.sections,
        index,
        c.req.query("p"),
        c.req.query("h")
      )
    );
  })
);

app.notFound((c) =>
  c.html(renderNotFound(isLegacyPath(new URL(c.req.url).pathname)), 404)
);

export default app;
