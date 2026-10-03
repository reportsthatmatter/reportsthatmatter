/**
 * How much of today's D1 quota is spent, and by what (reportsthatmatter-t4al).
 *
 * The free tier allows 5,000,000 rows read and 100,000 rows written a day, reset at 00:00 UTC. On 2026-10-03
 * the reads ran out at ~18:00 UTC (5.48M) and search, marks and publishing stopped until midnight. Everyone had
 * budgeted writes; nothing counted reads. Two sources, used together:
 *
 * - **The ledger**: every remote `wrangler d1 execute` this machine's scripts run (through `wranglerRunner`)
 *   appends what D1 reported it cost (`meta.rows_read`, `meta.rows_written`) to one JSONL file shared by every
 *   worktree, `~/.local/state/rtm/d1-usage.jsonl` (`RTM_D1_LEDGER` overrides). Immediate and exact for our own
 *   scripts; blind to the Worker's traffic and to other machines.
 * - **Cloudflare's analytics** (GraphQL `d1AnalyticsAdaptiveGroups`): everything, the Worker included, a few
 *   minutes behind. Reading it is not a query against the database, so it costs no rows. Credentials:
 *   `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` if set, else wrangler's own login (`wrangler auth token`,
 *   `wrangler whoami`), which can read D1 analytics: it is what `wrangler d1 info` uses.
 *
 * Today's usage is the larger of the two, so a burst the analytics have not caught up with still counts.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export const FREE_TIER = { rowsRead: 5_000_000, rowsWritten: 100_000 } as const;

export type Usage = { rowsRead: number; rowsWritten: number };
export type LedgerEntry = Usage & { at: string; tool: string; label: string; queries: number };

export const ledgerPath = (): string => process.env.RTM_D1_LEDGER || join(homedir(), ".local/state/rtm/d1-usage.jsonl");

export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Appends one remote call's cost. Never throws: losing a ledger line must not fail a publish. */
export function recordUsage(entry: Omit<LedgerEntry, "at" | "tool"> & { at?: string; tool?: string }, path = ledgerPath()): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const line: LedgerEntry = { at: entry.at ?? new Date().toISOString(), tool: entry.tool ?? basename(process.argv[1] ?? "?"), label: entry.label.replace(/\s+/g, " ").slice(0, 100), queries: entry.queries, rowsRead: entry.rowsRead, rowsWritten: entry.rowsWritten };
    appendFileSync(path, JSON.stringify(line) + "\n");
  } catch {
    // best effort
  }
}

/** Sums `meta.rows_read` / `meta.rows_written` over wrangler's `--json` result entries. */
export function metaTotals(statements: Array<{ meta?: { rows_read?: number; rows_written?: number } }>): Usage & { queries: number } {
  let rowsRead = 0;
  let rowsWritten = 0;
  for (const s of statements) {
    rowsRead += Number(s?.meta?.rows_read) || 0;
    rowsWritten += Number(s?.meta?.rows_written) || 0;
  }
  return { rowsRead, rowsWritten, queries: statements.length };
}

/** The ledger's entries for the UTC day of `now`. */
export function ledgerEntries(now: Date = new Date(), path = ledgerPath()): LedgerEntry[] {
  if (!existsSync(path)) return [];
  const day = utcDay(now);
  const out: LedgerEntry[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      const e = JSON.parse(line) as LedgerEntry;
      if (typeof e.at === "string" && e.at.slice(0, 10) === day) out.push(e);
    } catch {
      // a torn line from a concurrent append: skip it
    }
  }
  return out;
}

export function ledgerToday(now: Date = new Date(), path = ledgerPath()): Usage & { entries: number } {
  const entries = ledgerEntries(now, path);
  return {
    rowsRead: entries.reduce((t, e) => t + (e.rowsRead || 0), 0),
    rowsWritten: entries.reduce((t, e) => t + (e.rowsWritten || 0), 0),
    entries: entries.length,
  };
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; json(): Promise<any> }>;
export type Credentials = { token?: string; accounts?: string[]; databaseId?: string };

/** Today's (UTC) rows read and written for the database, from Cloudflare analytics, or null if it cannot be read. */
export async function analyticsToday(fetchFn: Fetch, creds: Credentials, now: Date = new Date()): Promise<Usage | null> {
  if (!creds.token || !creds.accounts?.length || !creds.databaseId) return null;
  const query = `query ($account: String!, $db: String!, $day: Date!) {
    viewer { accounts(filter: { accountTag: $account }) {
      d1AnalyticsAdaptiveGroups(limit: 100, filter: { databaseId: $db, date: $day }) { sum { rowsRead rowsWritten } }
    } }
  }`;
  let found = false;
  const total: Usage = { rowsRead: 0, rowsWritten: 0 };
  try {
    for (const account of creds.accounts) {
      const response = await fetchFn("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: { authorization: `Bearer ${creds.token}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables: { account, db: creds.databaseId, day: utcDay(now) } }),
      });
      if (!response.ok) continue;
      const groups = (await response.json())?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
      if (!Array.isArray(groups)) continue;
      found = true;
      for (const g of groups) {
        total.rowsRead += Number(g?.sum?.rowsRead) || 0;
        total.rowsWritten += Number(g?.sum?.rowsWritten) || 0;
      }
    }
  } catch {
    return null;
  }
  return found ? total : null;
}

/** Credentials from the environment, else from wrangler's own login. Null fields when neither has them. */
export function credentials(root: string, databaseId: string | undefined): Credentials {
  const env = process.env;
  if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) return { token: env.CLOUDFLARE_API_TOKEN, accounts: [env.CLOUDFLARE_ACCOUNT_ID], databaseId };
  const json = (args: string[]) => {
    try {
      const out = execFileSync("pnpm", ["-s", "wrangler", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 });
      return JSON.parse(out.slice(out.indexOf("{")));
    } catch {
      return null;
    }
  };
  const token = env.CLOUDFLARE_API_TOKEN ?? json(["auth", "token", "--json"])?.token;
  const accounts = env.CLOUDFLARE_ACCOUNT_ID ? [env.CLOUDFLARE_ACCOUNT_ID] : (json(["whoami", "--json"])?.accounts ?? []).map((a: { id: string }) => a.id).filter(Boolean);
  return { token, accounts, databaseId };
}

export const databaseIdOf = (root: string): string | undefined =>
  (readFileSync(join(root, "wrangler.toml"), "utf8").match(/database_id\s*=\s*"([^"]+)"/) ?? [])[1];

export type Today = { used: Usage | null; ledger: Usage; analytics: Usage | null; source: string };

/** Today's usage: the larger of the ledger and analytics, per counter. `used` is null only when neither is known. */
export function combine(ledger: Usage & { entries?: number }, analytics: Usage | null): Today {
  if (!analytics && !ledger.entries) return { used: null, ledger, analytics, source: "unknown (no analytics credentials, nothing in the ledger today)" };
  if (!analytics) return { used: { rowsRead: ledger.rowsRead, rowsWritten: ledger.rowsWritten }, ledger, analytics, source: "this machine's ledger only (the Worker's traffic and other machines are not counted)" };
  return {
    used: { rowsRead: Math.max(ledger.rowsRead, analytics.rowsRead), rowsWritten: Math.max(ledger.rowsWritten, analytics.rowsWritten) },
    ledger,
    analytics,
    source: "Cloudflare analytics and this machine's ledger, the larger of each",
  };
}

export async function usageToday(root: string, fetchFn: Fetch = fetch as unknown as Fetch, now: Date = new Date()): Promise<Today> {
  const analytics = await analyticsToday(fetchFn, credentials(root, databaseIdOf(root)), now);
  return combine(ledgerToday(now), analytics);
}

export type Need = Usage;
export type BudgetVerdict = { ok: boolean; lines: string[]; headroom: Usage | null; needed: Usage };

/**
 * Does `need` (already margined by the caller, or not) fit what is left today? `reserve` is held back for the
 * Worker's own traffic (search, marks, every page's version lookup), which the ledger cannot see.
 * Unknown usage: fits only if the need alone fits the whole day's limit, and says so.
 */
export function fits(need: Need, today: Today, limits: Usage = FREE_TIER, reserve: Usage = { rowsRead: 500_000, rowsWritten: 5_000 }, margin = 1.1): BudgetVerdict {
  const needed = { rowsRead: Math.ceil(need.rowsRead * margin - 1e-6), rowsWritten: Math.ceil(need.rowsWritten * margin - 1e-6) };
  const lines: string[] = [];
  const fmt = (n: number) => n.toLocaleString("en-US");
  if (!today.used) {
    lines.push(`today's D1 usage: ${today.source}`);
    const ok = needed.rowsRead + reserve.rowsRead <= limits.rowsRead && needed.rowsWritten + reserve.rowsWritten <= limits.rowsWritten;
    lines.push(`needs about ${fmt(needed.rowsRead)} rows read and ${fmt(needed.rowsWritten)} rows written (+10%), against ${fmt(limits.rowsRead)} / ${fmt(limits.rowsWritten)} a day less a reserve of ${fmt(reserve.rowsRead)} / ${fmt(reserve.rowsWritten)} for the Worker`);
    return { ok, lines, headroom: null, needed };
  }
  const headroom = {
    rowsRead: Math.max(0, limits.rowsRead - reserve.rowsRead - today.used.rowsRead),
    rowsWritten: Math.max(0, limits.rowsWritten - reserve.rowsWritten - today.used.rowsWritten),
  };
  lines.push(`today's D1 usage (${today.source}): ${fmt(today.used.rowsRead)} rows read, ${fmt(today.used.rowsWritten)} rows written`);
  lines.push(`left after a reserve of ${fmt(reserve.rowsRead)} / ${fmt(reserve.rowsWritten)} for the Worker: ${fmt(headroom.rowsRead)} rows read, ${fmt(headroom.rowsWritten)} rows written`);
  lines.push(`needs about ${fmt(needed.rowsRead)} rows read, ${fmt(needed.rowsWritten)} rows written (+10%)`);
  const ok = needed.rowsRead <= headroom.rowsRead && needed.rowsWritten <= headroom.rowsWritten;
  return { ok, lines, headroom, needed };
}

export type QueryCost = { query: string; count: number; rowsRead: number; rowsWritten: number };

/** The day's most expensive query shapes by rows read (GraphQL `d1QueriesAdaptiveGroups`), or null. */
export async function topQueries(fetchFn: Fetch, creds: Credentials, day: string, limit = 15): Promise<QueryCost[] | null> {
  if (!creds.token || !creds.accounts?.length || !creds.databaseId) return null;
  const query = `query ($account: String!, $db: String!, $day: Date!, $limit: Int!) {
    viewer { accounts(filter: { accountTag: $account }) {
      d1QueriesAdaptiveGroups(limit: $limit, filter: { databaseId: $db, date: $day }, orderBy: [sum_rowsRead_DESC]) {
        count sum { rowsRead rowsWritten } dimensions { query }
      }
    } }
  }`;
  try {
    const out: QueryCost[] = [];
    for (const account of creds.accounts) {
      const response = await fetchFn("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: { authorization: `Bearer ${creds.token}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables: { account, db: creds.databaseId, day, limit } }),
      });
      if (!response.ok) continue;
      const groups = (await response.json())?.data?.viewer?.accounts?.[0]?.d1QueriesAdaptiveGroups;
      if (!Array.isArray(groups)) continue;
      for (const g of groups) out.push({ query: String(g?.dimensions?.query ?? ""), count: Number(g?.count) || 0, rowsRead: Number(g?.sum?.rowsRead) || 0, rowsWritten: Number(g?.sum?.rowsWritten) || 0 });
    }
    return out.sort((a, b) => b.rowsRead - a.rowsRead).slice(0, limit);
  } catch {
    return null;
  }
}
