/**
 * Publishing a report's rendered content
 * (docs/plans/2026-09-04-content-publishing.md §4, §5).
 *
 * Publishing is two phases, and only the second one is visible:
 *
 *   1. **Write objects** under `reports/<id>/<hash>/…`. Idempotent, and
 *      nothing points at them, so a half-finished upload is invisible rather
 *      than broken.
 *   2. **Flip the pointer** — one `UPDATE` of `report_versions`. That is the
 *      only non-idempotent step, which is what makes a publish atomic per
 *      report and a rollback the same statement with the previous hash.
 *
 * It goes through this endpoint rather than handing every report repo an R2
 * key and a D1 binding, for two reasons §4 sets out: a store that eleven
 * repos write to directly is a store nothing can refuse a bad publish from,
 * and a credential that can rewrite the whole corpus is a bad thing to keep
 * in eleven places.
 */

/** One file of a report's rendered content, keyed by its path under the version prefix. */
export type PublishFile = { path: string; body: string };

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The digest of one file's bytes. */
export async function fileHash(body: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(body)));
}

/** What a publisher declares it has written: every path, and what is in it. */
export type Manifest = Array<{ path: string; hash: string }>;

export async function manifestFor(files: PublishFile[]): Promise<Manifest> {
  return Promise.all(files.map(async (f) => ({ path: f.path, hash: await fileHash(f.body) })));
}

/**
 * The version a set of files *is*.
 *
 * Derived from the content, never assigned: two builds of the same text
 * publish to the same key and cannot disagree about which is newer, and a
 * hash that has been served can always be served again, which is what lets a
 * citation pin the text it quoted.
 *
 * Computed over the *manifest* — path and per-file digest — rather than over
 * the bodies, so that `commit` can re-derive it from something small and then
 * check each object one at a time. Verifying a 19 MB report never means
 * holding 19 MB.
 *
 * Sorted by path, and each field length-delimited, so no rearrangement of
 * files and no shifting of a boundary between them can collide.
 */
export async function contentHash(manifest: Manifest): Promise<string> {
  const lines = [...manifest]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((entry) => `${entry.path.length}:${entry.path}:${entry.hash}`);
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(lines.join("\n")));
  return hex(digest).slice(0, 16);
}

/**
 * Everything a version must contain to be worth pointing at.
 *
 * The reader asks for exactly these; a version missing one of them is a
 * version that 404s in production, which is precisely what `commit` exists to
 * refuse.
 */
export function manifestProblems(manifest: Manifest): string[] {
  const problems: string[] = [];
  const paths = new Set(manifest.map((entry) => entry.path));

  for (const entry of manifest) {
    if (!isPublishablePath(entry.path)) problems.push(`not a publishable path: ${entry.path}`);
    if (!/^[0-9a-f]{64}$/.test(entry.hash)) problems.push(`not a sha-256 digest: ${entry.path}`);
  }
  if (paths.size !== manifest.length) problems.push("the manifest names a path twice");
  if (!paths.has("meta.json")) problems.push("no meta.json");
  if (!paths.has("full-body.html")) problems.push("no full-body.html");
  if (![...paths].some((path) => path.startsWith("fragments/"))) problems.push("no fragments");

  return problems;
}

/**
 * The token that publishes one report, and only that report.
 *
 * Derived rather than stored: the Worker holds one secret, each report repo
 * holds `tokenFor(secret, its own id)`, and a leaked token can rewrite
 * exactly one report. Nothing has to keep a list of eleven credentials in
 * step, and adding a report issues a token rather than provisioning one.
 */
export async function tokenFor(secret: string, reportId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(reportId)));
}

/** Constant-time compare, so a token cannot be guessed a byte at a time. */
function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i++) differences |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return differences === 0;
}

export async function authorises(
  secret: string | undefined,
  reportId: string,
  presented: string | undefined
): Promise<boolean> {
  if (!secret || !presented) return false;
  return sameToken(await tokenFor(secret, reportId), presented);
}

/** A report id that cannot escape its own prefix in an object key. */
export function isReportId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

/**
 * A path a report is allowed to publish.
 *
 * Only the shapes the reader actually asks for, so a publish cannot fill the
 * bucket with anything the site would never serve — and no `..`, no leading
 * slash, nothing that could climb out of the version prefix.
 */
export function isPublishablePath(path: string): boolean {
  if (path === "meta.json" || path === "full-body.html") return true;
  return /^fragments\/[A-Za-z0-9_-]{1,120}\.html$/.test(path);
}
