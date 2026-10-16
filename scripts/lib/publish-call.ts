/**
 * The publish endpoint call for `pnpm publish-report`, with a retry for a transient 5xx (reportsthatmatter-moej).
 *
 * At v0.21.0 the commit step returned 500 for 4 of 10 reports and succeeded on the next try. Both the objects upload
 * (an R2 put per file) and the commit (verify every object, then upsert the version pointer) are idempotent for the
 * same hash, so a 5xx is retried up to three times with a back-off. A 4xx is a real refusal and is never retried;
 * neither is a 5xx whose body names a D1 quota, which will not clear until 00:00 UTC (`pnpm publish-report <id> --preflight`).
 * Caveat (review 2026-10-16): the Worker has no onError, so an uncaught D1 error in the commit's pointer write, a spent
 * quota included, reaches us as Hono's bare "Internal Server Error" and IS retried; harmless (the commit costs no D1
 * rows until that write succeeds, and a real publish runs the quota preflight first), and the final message says so.
 */
export const RETRY_DELAYS_MS = [2000, 5000, 10000];

/** A body that says the D1 daily quota is spent: waiting seconds cannot fix it. */
export const QUOTA_ERROR = /quota|rate.?limit|too many requests|row writes|rows? (read|written)|exceeded/i;

export type PublishCallOptions = {
  base: string;
  token: string;
  /** Printed after the last failure: the command to run again (uploads are idempotent). */
  rerun: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  delays?: number[];
  log?: (line: string) => void;
  /** Called after the failure report; the real one exits 1. */
  fail?: () => never;
};

export function makePublishCall(opts: PublishCallOptions) {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((done) => setTimeout(done, ms)));
  const delays = opts.delays ?? RETRY_DELAYS_MS;
  const log = opts.log ?? ((line) => console.error(line));
  const fail = opts.fail ?? ((): never => process.exit(1));

  return async function call(path: string, body?: unknown): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      const response = await doFetch(`${opts.base}${path}`, {
        method: body ? "POST" : "GET",
        headers: { authorization: `Bearer ${opts.token}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { error: text.slice(0, 300) };
      }
      if (response.ok) return parsed;

      const transient = response.status >= 500 && !QUOTA_ERROR.test(text);
      if (transient && attempt < delays.length) {
        log(`retry ${attempt + 1}/${delays.length} after ${response.status} ${path} (in ${delays[attempt] / 1000}s)`);
        await sleep(delays[attempt]);
        continue;
      }
      log(`${response.status} ${path}`);
      log(JSON.stringify(parsed, null, 2));
      if (transient) {
        log(`still failing after ${delays.length} retries; the uploads are idempotent, so run the same command again:\n  ${opts.rerun}`);
        log("If D1's daily quota is spent (the Worker's 500 does not say), a retry will not help before 00:00 UTC: check with --preflight.");
      }
      return fail();
    }
  };
}
