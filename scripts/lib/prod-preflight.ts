/**
 * Is production reachable at all? (reportsthatmatter-6pky)
 *
 * `pnpm ship` and `pnpm publish-report --all --status` used to answer a down site or a Cloudflare error page with one
 * "unknown" row per report (18 of them). They now GET the base and /health first, with no secret, and a non-200, a
 * network failure or a Cloudflare error page becomes one line: `production not reachable: <status> <cf error code>`.
 */

export type PreflightResult = { ok: true } | { ok: false; message: string };

/** The Cloudflare error code in an error page ("Error code 522", "error code: 1016"), else null. */
export function cfErrorCode(body: string): string | null {
  const m = /error code:?\s*(\d{3,4})/i.exec(body) ?? /cf-error-code[^>]*>\s*(\d{3,4})/i.exec(body);
  return m ? m[1] : null;
}

/** A Cloudflare error page: its stock markers, not any page that mentions an error. */
export function isCfErrorPage(body: string): boolean {
  return /cf-error-details|cf-wrapper|Cloudflare Ray ID/i.test(body) && cfErrorCode(body) !== null;
}

export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;

export async function productionPreflight(base: string, opts: { fetcher?: Fetcher; timeoutMs?: number } = {}): Promise<PreflightResult> {
  const fetcher: Fetcher = opts.fetcher ?? ((url, init) => fetch(url, init));
  const root = base.replace(/\/$/, "");
  for (const path of ["/", "/health"]) {
    try {
      const response = await fetcher(`${root}${path}`, { signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
      const body = await response.text().catch(() => "");
      const code = cfErrorCode(body);
      if (response.status !== 200 || (code !== null && isCfErrorPage(body))) {
        return { ok: false, message: `production not reachable: ${response.status} ${code ?? "none"} (${root}${path})` };
      }
    } catch (error) {
      const e = error as { cause?: { code?: string; message?: string; errors?: Array<{ code?: string }> }; code?: string; name?: string; message?: string };
      const why = e.cause?.code ?? e.cause?.errors?.find((x) => x.code)?.code ?? e.cause?.message ?? e.code ?? (e.name === "TimeoutError" ? "timeout" : e.message ?? "error");
      return { ok: false, message: `production not reachable: no response ${why} (${root}${path})` };
    }
  }
  return { ok: true };
}
