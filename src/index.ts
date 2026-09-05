import { Hono } from "hono";
import { loadRegistry } from "./lib/registry";
import { loadChangelog } from "./lib/source";
import { renderIndex, renderReportsIndex } from "./templates/index";
import { renderReport, extractParagraph, quotedPassage, type ReportMeta } from "./templates/report";
import { renderAbout } from "./templates/about";
import { renderNotFound } from "./templates/not-found";
import { renderChangelog } from "./templates/changelog";
import { renderHighlights } from "./templates/highlights";
import { renderReportOverview, renderSection, type TopPassage } from "./templates/section";
import { renderSearch, renderSnippet, type SearchResultView } from "./templates/search";
import { encodeAnchor, selectorFor } from "../assets/anchor.js";
import {
  openGenerated,
  loadReportMeta,
  loadFragment,
  loadFullBody,
  loadQuotedPassage,
  type AssetsBinding,
  type PrerenderMeta,
} from "./lib/prerendered";
import { contentFor, contentKey, type ContentBucket, type ContentSource } from "./lib/content";
import {
  authorises,
  contentHash,
  fileHash,
  isPublishablePath,
  isReportId,
  manifestProblems,
  type Manifest,
} from "./lib/publish";
import {
  actorHash,
  markCounts,
  parseMarkPayload,
  recordMark,
  todayUTC,
  type MarksDB,
} from "./lib/marks";
import { queryPassages, firstMatchOffsets, type PassageRow } from "./lib/search";

/** The write half of the content bucket, which only publishing touches. */
type PublishBucket = ContentBucket & {
  put(key: string, value: string): Promise<unknown>;
};

export type Bindings = {
  /** Cloudflare static-assets binding; absent under local Node/vitest. */
  ASSETS?: AssetsBinding;
  /** "bundled" reads reports from the worker bundle, otherwise from disk. */
  REPORTS_SOURCE?: string;
  /**
   * Where the pre-V2 site now lives — a full base URL, which may carry a path
   * prefix (GitHub Pages serves project sites under /<repo>/).
   */
  LEGACY_BASE?: string;
  /** Social proof (#96): who marked what. Absent under Node/vitest unless a test supplies a fake. */
  DB?: MarksDB;
  /**
   * Published report content, keyed by content hash (§3 of the
   * content-publishing plan). Absent until a report has been published, and
   * absent under Node/vitest — `contentFor` falls back to the deploy's own
   * copy in assets/generated/ either way.
   */
  CONTENT?: PublishBucket;
  /**
   * Secret a report's publish token is derived from (§4). Absent means
   * publishing is off, which is the right default: the endpoint refuses
   * everything rather than accepting anything.
   */
  PUBLISH_SECRET?: string;
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
  "/feed.xml",
  // "/search" was here too, parked at the archive until the new site had its
  // own search. It does now (#100) — a native /search is a strictly better
  // landing for an old inbound link than a redirect to a static archive's
  // search, which could not have worked anyway.
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

/**
 * Every result is a citable passage — the matched text, marked, with its
 * report, section, and printed page — linking through a real quote anchor
 * (assets/anchor.js) so following it lands on the exact matched words,
 * highlighted, the same as any shared link. Design:
 * docs/plans/2026-08-21-search-decisions.md.
 *
 * D1 down or the query producing nothing is "no results", not an error page
 * — search is how a reader finds a report, not the only way in.
 */
app.get("/search", async (c) => {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  const registry = await loadRegistry(sourceMode);

  const q = c.req.query("q") ?? "";
  const scope = c.req.query("report") || null;
  const scopeTitle = scope ? registry.reports.find((r) => r.id === scope)?.title ?? null : null;
  const searched = q.trim().length > 0;

  let results: SearchResultView[] = [];
  let failed = false;

  if (searched) {
    const db = c.env?.DB;
    if (!db) {
      failed = true;
    } else {
      try {
        const rows = await queryPassages(db, q, scope, 20);
        results = await buildSearchResults(c.env, registry.reports, rows);
      } catch (err) {
        failed = true;
      }
    }
  }

  return c.html(
    renderSearch({
      q,
      scope,
      scopeTitle,
      results,
      reports: registry.reports.map((r) => ({ id: r.id, title: r.title })),
      searched,
      failed,
    })
  );
});

/**
 * A raw FTS5 row into something a template can render: the exact matched
 * span turned into a quote anchor (so the link lands precisely, not just on
 * the paragraph), and the report/section names resolved for display. A row
 * that can no longer be routed — its report's pre-rendered metadata missing,
 * or the paragraph id gone — is dropped rather than shown broken.
 */
async function buildSearchResults(
  env: Bindings | undefined,
  reports: Array<{ id: string; title: string }>,
  rows: PassageRow[]
): Promise<SearchResultView[]> {
  const metaCache = new Map<string, PrerenderMeta | null>();
  const results: SearchResultView[] = [];

  for (const row of rows) {
    if (!metaCache.has(row.report)) {
      metaCache.set(row.report, await loadReportMeta(await contentFor(env, row.report)));
    }
    const meta = metaCache.get(row.report);
    const slug = meta?.paragraphToSection[row.paragraph_id];
    if (!slug) continue;

    const offsets = firstMatchOffsets(row.marked);
    if (!offsets) continue;

    const anchor = encodeAnchor(selectorFor(row.body, offsets.start, offsets.end));
    const query = anchor ? `&h=${anchor}` : "";

    results.push({
      url: `/reports/${row.report}/${slug}?p=${encodeURIComponent(row.paragraph_id)}${query}#${row.paragraph_id}`,
      reportTitle: reports.find((r) => r.id === row.report)?.title ?? row.report,
      sectionTitle: row.section,
      page: row.page,
      snippetHtml: renderSnippet(row.body, offsets.start, offsets.end),
    });
  }

  return results;
}

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
/**
 * The section-level entries, precomputed at build time (#115) — the one
 * thing this route used to need a full markdown render of every report for,
 * which made it the one route caching could not fix: it rendered all four
 * reports in a single request, so no isolate-level memo (one report at a
 * time) and no edge cache (first request always pays full price) helped.
 */
async function sitemapSectionUrls(
  assets: AssetsBinding | undefined
): Promise<Array<{ report: string; slug: string }>> {
  const response = await openGenerated(assets, "sitemap-urls.json");
  return response ? response.json() : [];
}

// Not wrapped in `cached()`: that wrapper stores in `caches.default` for a day
// and does not invalidate on deploy, so a report added today would not appear
// in the sitemap until tomorrow (exactly what happened shipping the 2026-09-03
// batch). Since #115 this route only reads a precomputed JSON asset and the
// registry — cheap enough to build every time. The `max-age=3600` header still
// lets the edge hold it for an hour, and that layer *does* clear on deploy.
app.get("/sitemap.xml", async (c) => {
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
  }
  for (const entry of await sitemapSectionUrls(c.env?.ASSETS)) {
    urls.push({ loc: `/reports/${entry.report}/${entry.slug}`, priority: "0.8" });
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
});

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

/**
 * A report's registry entry plus its pre-rendered metadata (#115) — words,
 * the section list, and a paragraph → section lookup. Cheap: no report body
 * html, which is what made rendering this expensive in the first place. The
 * body itself, when a route actually needs it, is a separate fetch of the
 * one *section* that holds the paragraph — `loadQuotedPassage` from
 * ./lib/prerendered.
 */
async function loadReportEntry(
  c: any,
  reportId: string
): Promise<{ report: ReportMeta; meta: PrerenderMeta; content: ContentSource } | null> {
  const sourceMode = c.env?.REPORTS_SOURCE ?? process.env.REPORTS_SOURCE;
  const registry = await loadRegistry(sourceMode);
  const report = registry.reports.find((entry: { id: string }) => entry.id === reportId);
  if (!report) return null;

  // Resolved once per request: every read for this report then comes from the
  // same version, so a publish landing mid-request cannot serve half of one
  // version and half of another.
  const content = await contentFor(c.env, reportId);
  const meta = await loadReportMeta(content);
  if (!meta) return null;

  return { report, meta, content };
}

/**
 * Serve a page from the edge cache, and put it there when it is built.
 *
 * Only used for the `?p=`/`?h=` path now (#115) — the common case is a
 * literal static file served straight from ASSETS, which Cloudflare already
 * caches correctly and, unlike this Cache API wrapper, actually invalidates
 * on deploy. This wrapper's own staleness is a known, accepted gap: a cached
 * quote-link response can outlive a re-ingest for up to `maxAge`.
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

  const loaded = await loadReportEntry(c, reportId);
  if (!loaded) return c.html(renderNotFound(false), 404);
  const { report, meta, content } = loaded;

  // A link naming a passage goes straight to the section holding it. This is
  // why share links carry ?p= as well as the fragment: the fragment never
  // reaches us, so without it a shared link could not be routed at all.
  // The lookup is the pre-rendered paragraph → section map (#115) — routing
  // a link never needs the report body itself, just which section it's in.
  const paragraph = c.req.query("p");
  if (paragraph) {
    const slug = meta.paragraphToSection[paragraph];
    if (slug) {
      // ?h= names the words within that paragraph and has to survive the hop,
      // or a shared quote arrives as a plain paragraph link.
      const quote = c.req.query("h");
      const anchor = quote ? `&h=${encodeURIComponent(quote)}` : "";
      return c.redirect(
        `/reports/${reportId}/${slug}?p=${encodeURIComponent(paragraph)}${anchor}#${paragraph}`,
        302
      );
    }
  }

  const topMarked = await topMarkedPassages(c.env, reportId, meta, content);
  c.header("x-rtm-content-version", content.version);
  return c.html(
    renderReportOverview(report, meta.sections, { words: meta.words }, topMarked)
  );
});

/**
 * The best-input-to-quote-cards, human-facing version of `markCounts`: the
 * top few passages, with the text and link to show for each. Best-effort —
 * an empty list here costs a reader nothing, so any failure degrades to that
 * rather than to a broken contents page.
 *
 * The report body (#115) is fetched only when D1 actually has a candidate —
 * the common case, before any passage has enough readers, costs nothing more
 * than the D1 read that says so.
 */
async function topMarkedPassages(
  env: Bindings | undefined,
  reportId: string,
  meta: PrerenderMeta,
  content: ContentSource
): Promise<TopPassage[]> {
  const db = env?.DB;
  if (!db) return [];

  const threshold = Number(env?.MARK_THRESHOLD ?? 1);
  const LIMIT = 5;

  try {
    const counts = await markCounts(db, reportId, threshold);
    if (!counts.length) return [];

    // One section page per distinct section, not the whole report: the five
    // passages shown here used to cost a 19 MB `body.json` parse between them.
    // Capped, because a marked paragraph whose id has moved since costs a
    // fetch and yields nothing.
    const MAX_SECTION_FETCHES = 8;
    const pages = new Map<string, string | null>();

    const top: TopPassage[] = [];
    for (const row of counts) {
      if (top.length >= LIMIT) break;
      const slug = meta.paragraphToSection[row.paragraph];
      if (!slug) continue;

      if (!pages.has(slug)) {
        if (pages.size >= MAX_SECTION_FETCHES) break;
        pages.set(slug, await loadFragment(content, slug));
      }
      const page = pages.get(slug);
      if (!page) continue;

      const paragraph = extractParagraph(page, row.paragraph);
      if (!paragraph) continue;

      const anchor = encodeAnchor({ prefix: row.prefix, exact: row.exact, suffix: row.suffix });
      const quote = anchor ? quotedPassage(page, row.paragraph, anchor) : paragraph;
      if (!quote) continue;

      const query = anchor ? `&h=${anchor}` : "";
      top.push({
        quote,
        page: row.page,
        readers: row.readers,
        url: `/reports/${reportId}/${slug}?p=${encodeURIComponent(row.paragraph)}${query}#${row.paragraph}`,
      });
    }
    return top;
  } catch (err) {
    return [];
  }
}

/**
 * Only a shared quote link goes through the day-long edge cache.
 *
 * `cached()` stores in `caches.default` and does not invalidate on deploy —
 * tolerable for a `?p=` link's preview, and not for the canonical page, which
 * would then serve a re-ingested report's old text for up to a day. The
 * canonical page is assembled fresh instead: one fragment read and a string
 * concatenation, against a request `run_worker_first = true` never let skip
 * the Worker anyway.
 */
function maybeCached(
  c: any,
  shared: boolean,
  render: () => Promise<Response>
): Promise<Response> {
  return shared ? cached(c, render) : render();
}

app.get("/reports/:id/full", async (c) => {
  const reportId = c.req.param("id");
  const p = c.req.query("p");
  const h = c.req.query("h");

  return maybeCached(c, Boolean(p || h), async () => {
    const loaded = await loadReportEntry(c, reportId);
    if (!loaded) return c.html(renderNotFound(false), 404);

    const body = await loadFullBody(loaded.content);
    if (body === null) return c.html(renderNotFound(false), 404);

    c.header("x-rtm-content-version", loaded.content.version);
    return c.html(renderReport(loaded.report, body, p, h));
  });
});

app.get("/reports/:id/:section", async (c) => {
  const reportId = c.req.param("id");
  const slug = c.req.param("section");
  const p = c.req.query("p");
  const h = c.req.query("h");

  return maybeCached(c, Boolean(p || h), async () => {
    const loaded = await loadReportEntry(c, reportId);
    if (!loaded) return c.html(renderNotFound(false), 404);

    const index = loaded.meta.sections.findIndex((entry) => entry.slug === slug);
    if (index === -1) return c.html(renderNotFound(false), 404);

    const fragment = await loadFragment(loaded.content, slug);
    if (fragment === null) return c.html(renderNotFound(false), 404);

    c.header("x-rtm-content-version", loaded.content.version);
    return c.html(renderSection(loaded.report, loaded.meta.sections, index, fragment, p, h));
  });
});


/**
 * Publishing a report (§4, §5 of the content-publishing plan).
 *
 * Two phases. `objects` writes into `reports/<id>/<hash>/…`, which nothing
 * points at, so it is idempotent and a half-finished upload is invisible
 * rather than broken. `commit` is the publish: it re-derives the hash from
 * the manifest, checks every object is actually there and holds what the
 * manifest says, and only then writes the pointer row.
 *
 * That check is the reason this is an endpoint and not eleven sets of R2
 * credentials. A store written to directly is a store nothing can refuse a
 * bad publish from, and this project's rule is that a gate which cannot fail
 * on broken input is not evidence.
 */
async function publisherFor(
  c: any,
  reportId: string
): Promise<{ refusal: Response } | { bucket: PublishBucket }> {
  if (!isReportId(reportId)) return { refusal: c.json({ error: "not a report id" }, 400) };

  const presented = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
  if (!(await authorises(c.env?.PUBLISH_SECRET, reportId, presented))) {
    // Same answer whether the secret is unset, the token is wrong, or the
    // report does not exist — none of that is a publisher's business.
    return { refusal: c.json({ error: "not authorised to publish this report" }, 401) };
  }

  const bucket = c.env?.CONTENT as PublishBucket | undefined;
  if (!bucket) return { refusal: c.json({ error: "no content bucket bound" }, 503) };
  return { bucket };
}

app.post("/internal/publish/:id/objects", async (c) => {
  const reportId = c.req.param("id");
  const publisher = await publisherFor(c, reportId);
  if ("refusal" in publisher) return publisher.refusal;

  const { hash, files } = await c.req.json<{ hash?: string; files?: Array<{ path: string; body: string }> }>();
  if (!hash || !/^[0-9a-f]{16}$/.test(hash)) return c.json({ error: "bad hash" }, 400);
  if (!Array.isArray(files) || !files.length) return c.json({ error: "no files" }, 400);

  for (const file of files) {
    if (!isPublishablePath(file.path)) return c.json({ error: `not a publishable path: ${file.path}` }, 400);
    if (typeof file.body !== "string") return c.json({ error: `not text: ${file.path}` }, 400);
  }
  for (const file of files) {
    await publisher.bucket.put(contentKey(reportId, hash, file.path), file.body);
  }

  return c.json({ written: files.length });
});

app.post("/internal/publish/:id/commit", async (c) => {
  const reportId = c.req.param("id");
  const publisher = await publisherFor(c, reportId);
  if ("refusal" in publisher) return publisher.refusal;

  const { hash, manifest } = await c.req.json<{ hash?: string; manifest?: Manifest }>();
  if (!hash || !Array.isArray(manifest)) return c.json({ error: "hash and manifest required" }, 400);

  const problems = manifestProblems(manifest);
  if (problems.length) return c.json({ error: "manifest rejected", problems }, 400);

  // The hash is not taken on trust: it *is* the manifest, so a publisher
  // cannot point at one version and describe another.
  if ((await contentHash(manifest)) !== hash) {
    return c.json({ error: "hash does not match the manifest" }, 400);
  }

  // One object at a time, so verifying a 19 MB report never holds 19 MB.
  const missing: string[] = [];
  for (const entry of manifest) {
    const object = await publisher.bucket.get(contentKey(reportId, hash, entry.path));
    if (!object) missing.push(entry.path);
    else if ((await fileHash(await object.text())) !== entry.hash) missing.push(`${entry.path} (contents differ)`);
    if (missing.length > 10) break;
  }
  if (missing.length) return c.json({ error: "version incomplete", missing }, 409);

  if (!c.env?.DB) return c.json({ error: "no database bound" }, 503);
  await c.env.DB.prepare(
    `INSERT INTO report_versions (report, content_hash, published_at) VALUES (?, ?, ?)
     ON CONFLICT(report) DO UPDATE SET content_hash = excluded.content_hash, published_at = excluded.published_at`
  )
    .bind(reportId, hash, Date.now())
    .run();

  return c.json({ published: reportId, version: hash, objects: manifest.length });
});

/** What is being served for a report, so a publisher can see and roll back. */
app.get("/internal/publish/:id", async (c) => {
  const reportId = c.req.param("id");
  const publisher = await publisherFor(c, reportId);
  if ("refusal" in publisher) return publisher.refusal;

  const row = await c.env.DB?.prepare("SELECT content_hash, published_at FROM report_versions WHERE report = ?")
    .bind(reportId)
    .first<{ content_hash: string; published_at: number }>();

  return c.json({ report: reportId, version: row?.content_hash ?? null, published_at: row?.published_at ?? null });
});

app.notFound((c) =>
  c.html(renderNotFound(isLegacyPath(new URL(c.req.url).pathname)), 404)
);

export default app;
