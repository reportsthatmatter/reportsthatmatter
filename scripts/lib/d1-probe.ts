/**
 * Does D1 still accept writes, how many row writes does one search row cost, and how many are left today?
 *
 * 2026-10-02: ten publishes after ingest v0.17.0 ran into the free tier's 100,000 row writes a day. The
 * third failed in the middle, after its objects were uploaded to R2 and before its commit, and the only
 * way to learn the quota was gone was that failed publish. This asks first.
 *
 * - `probeWrite`: inserts one row into the real `passages` table under a sentinel report and deletes it.
 *   If D1 refuses (code 7500) the quota is spent. If it accepts, `meta.rows_written` of the insert and of
 *   the delete are what D1 bills for a row of this table (FTS5 shadow tables included): the true cost,
 *   which replaces the estimate's default.
 * - `rowsWrittenToday`: today's usage from Cloudflare's GraphQL analytics, when `CLOUDFLARE_API_TOKEN` and
 *   `CLOUDFLARE_ACCOUNT_ID` are set; otherwise unknown. Not verifiable offline: it degrades to "unknown"
 *   on any surprise rather than guess.
 */
import { D1Error, type Runner, type Target } from "./d1";
import { DEFAULT_COST, type Cost } from "./reindex";

export const PROBE_REPORT = "__rtm_probe__";
export const FREE_TIER_DAILY_WRITES = 100_000;

export type Probe =
  | { ok: true; cost: Cost; measured: boolean }
  | { ok: false; quota: boolean; message: string };

export function probeWrite(run: Runner, target: Target, sampleBody = "The commission found that the agencies failed to share what they knew before the attacks."): Probe {
  try {
    const body = sampleBody.replace(/'/g, "''");
    const [inserted] = run(target, {
      command: `INSERT INTO passages (report, section, paragraph_id, page, body) VALUES ('${PROBE_REPORT}', 'probe', 'probe', '1', '${body}')`,
    });
    const [selected] = run(target, { command: `SELECT rowid AS rid FROM passages WHERE report = '${PROBE_REPORT}' LIMIT 1` });
    const rowid = selected.results[0]?.rid as number | undefined;
    const deleted = rowid === undefined ? undefined : run(target, { command: `DELETE FROM passages WHERE rowid = ${rowid}` })[0];
    // Measured only if the database reports it (D1 does; an old or local one may not).
    const insert = inserted.meta.rows_written;
    const del = deleted?.meta.rows_written;
    const measured = typeof insert === "number" && typeof del === "number" && insert > 0;
    return { ok: true, cost: measured ? { insert, delete: del, version: 1 } : DEFAULT_COST, measured };
  } catch (error) {
    const e = error instanceof D1Error ? error : new D1Error(error instanceof Error ? error.message : String(error));
    return { ok: false, quota: e.quotaExhausted, message: e.message.trim().split("\n").slice(-4).join(" ").slice(0, 300) };
  }
}

/** Milliseconds until the next 00:00 UTC, when D1's daily counters reset. */
export function msUntilReset(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

export const duration = (ms: number) => `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; json(): Promise<any> }>;

/** Rows written to the database so far today (UTC), from Cloudflare analytics, or null if it cannot be read. */
export async function rowsWrittenToday(
  fetchFn: Fetch,
  env: { token?: string; account?: string; databaseId?: string },
  now: Date = new Date()
): Promise<number | null> {
  if (!env.token || !env.account || !env.databaseId) return null;
  const today = now.toISOString().slice(0, 10);
  const query = `query ($account: String!, $db: String!, $day: Date!) {
    viewer { accounts(filter: { accountTag: $account }) {
      d1AnalyticsAdaptiveGroups(limit: 1, filter: { databaseId: $db, date_geq: $day }) { sum { rowsWritten } }
    } }
  }`;
  try {
    const response = await fetchFn("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { account: env.account, db: env.databaseId, day: today } }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    const groups = json?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
    if (!Array.isArray(groups)) return null;
    const written = groups.reduce((total: number, g: any) => total + (Number(g?.sum?.rowsWritten) || 0), 0);
    return Number.isFinite(written) ? written : null;
  } catch {
    return null;
  }
}

export type Verdict = { blocked: boolean; lines: string[] };

/**
 * The preflight's answer. `needed` is the estimated row writes of what is about to be done (0 if unknown),
 * `used` today's writes if known. Blocked when D1 refused the probe, or when the estimate is known not to fit.
 */
export function verdict(probe: Probe, needed: number, used: number | null, limit: number, now: Date): Verdict {
  const lines: string[] = [];
  if (!probe.ok) {
    if (probe.quota) {
      lines.push(`  ✗ D1 refused a write: the daily row-write quota is spent (${probe.message})`);
      lines.push(`    it resets at 00:00 UTC, in ${duration(msUntilReset(now))}; or move to Workers Paid (reportsthatmatter-2oz)`);
    } else {
      lines.push(`  ✗ could not probe D1: ${probe.message}`);
    }
    return { blocked: probe.quota, lines };
  }
  lines.push(
    `  ✓ D1 accepts writes; a search row costs ${probe.cost.insert} to insert, ${probe.cost.delete} to delete` +
      (probe.measured ? " (measured by the probe)" : " (default: the database did not report it)")
  );
  if (used === null) {
    lines.push("  · today's row writes are not known (set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to read them); the probe only shows the quota is not spent");
    if (needed > 0) lines.push(`  · this needs about ${needed.toLocaleString()} row write(s), against ${limit.toLocaleString()} a day on the free tier`);
    return { blocked: false, lines };
  }
  const left = Math.max(0, limit - used);
  lines.push(`  · ${used.toLocaleString()} of ${limit.toLocaleString()} row writes used today, ${left.toLocaleString()} left`);
  if (needed > left) {
    lines.push(`  ✗ this needs about ${needed.toLocaleString()}: it does not fit; after 00:00 UTC (in ${duration(msUntilReset(now))}), or publish fewer reports, or --no-reindex now and reindex later`);
    return { blocked: true, lines };
  }
  if (needed > 0) lines.push(`  ✓ this needs about ${needed.toLocaleString()}: it fits`);
  return { blocked: false, lines };
}
