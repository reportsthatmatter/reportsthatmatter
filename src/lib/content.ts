/**
 * Where a report's rendered content is read from
 * (docs/plans/2026-09-04-content-publishing.md §3, §5).
 *
 * Two stores, and the choice is per report, not global:
 *
 *   - **R2**, at a content hash pinned by `report_versions`, once the report
 *     has been published. Blobs read whole by a key we already know — no size
 *     ceiling, and publishing does not need a deploy.
 *   - **The deploy's own `assets/generated/`**, for any report with no pointer
 *     row. Every report is served this way until it is first published, which
 *     is what makes the whole mechanism safe to ship before anything writes
 *     to it.
 *
 * The Aug-1 architecture doc asked for exactly this: keep the storage lookup
 * behind one small module so swapping it is a one-file change. This is that
 * file, and it is the only place that knows there are two stores.
 */
import { openGenerated, type AssetsBinding } from "./prerendered";

/** The minimal R2 surface this module uses, so it can be faked in tests. */
export type ContentBucket = {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
};

/** The minimal D1 surface needed to resolve a pointer. */
export type VersionsDB = {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
    };
  };
};

export type ContentEnv = {
  ASSETS?: AssetsBinding;
  CONTENT?: ContentBucket;
  DB?: VersionsDB;
};

/**
 * One report's content, for the length of one request.
 *
 * `version` is the hash being served, or `"assets"` when it came from the
 * deploy. It is reported back in the `x-rtm-content-version` header: a
 * published report that quietly falls back to the deploy's copy is serving
 * *a* correct version rather than corrupt text, but it is still a defect, and
 * a defect nothing can observe is one nobody fixes.
 */
export type ContentSource = {
  version: string;
  /** Reads a path under the report's directory, e.g. `fragments/<slug>.html`. */
  text(path: string): Promise<string | null>;
};

const ASSETS_VERSION = "assets";

async function currentHash(db: VersionsDB | undefined, reportId: string): Promise<string | null> {
  if (!db) return null;
  try {
    const row = await db
      .prepare("SELECT content_hash FROM report_versions WHERE report = ?")
      .bind(reportId)
      .first<{ content_hash: string }>();
    return row?.content_hash ?? null;
  } catch {
    // A missing table (before the migration runs) or an unreachable D1 must
    // not take the site down: every report still has the deploy's copy.
    return null;
  }
}

/** The key an object lives at, once a report is published. */
export function contentKey(reportId: string, hash: string, path: string): string {
  return `reports/${reportId}/${hash}/${path}`;
}

export async function contentFor(env: ContentEnv | undefined, reportId: string): Promise<ContentSource> {
  const fromAssets = (path: string) =>
    openGenerated(env?.ASSETS, `reports/${reportId}/${path}`).then((r) => (r ? r.text() : null));

  const hash = env?.CONTENT ? await currentHash(env.DB, reportId) : null;
  if (!hash) return { version: ASSETS_VERSION, text: fromAssets };

  return {
    version: hash,
    async text(path: string) {
      const object = await env!.CONTENT!.get(contentKey(reportId, hash, path));
      // Objects are written before the pointer is flipped, so a miss here
      // should be impossible. Serving the deploy's copy rather than a 404
      // keeps a reader reading; the version header is what makes it visible.
      return object ? object.text() : fromAssets(path);
    },
  };
}
