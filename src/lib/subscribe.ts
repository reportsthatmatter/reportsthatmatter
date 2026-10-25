/**
 * The newsletter signup (decision 0033): what a signup form may send, and the one D1 write it costs.
 *
 * No email is sent from the site. Rows wait in `subscribers` (migration 0006) until they are exported to the
 * mailing provider, whose own confirmation email is the double opt-in. So this keeps as little as possible: the
 * address, where the form was, and the time. No network address, browser or actor hash.
 */
import type { MarksDB } from "./marks";

export type Subscription = { email: string; source: string };

export type SubscribeResult = "ok" | "invalid" | "unavailable" | "limited";

/** More new addresses than this in the last 24 hours and signups pause until the window moves on (reportsthatmatter-bvl7). */
export const DAILY_SIGNUP_CAP = 500;

/**
 * The Workers Rate Limiting binding (`[[ratelimits]]` in wrangler.toml). The caller's network address is only ever
 * handed to Cloudflare as the counting key: we never write it anywhere (the privacy promise, decision 0033).
 */
export type SignupLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

/**
 * Whether one caller may post another signup now. A missing binding (tests, local dev) or a failing one lets the
 * request through: the limit is a brake on scripts, not a reason to refuse a reader.
 */
export async function withinRateLimit(limiter: SignupLimiter | undefined, clientKey: string | undefined): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key: clientKey || "unknown" })).success;
  } catch {
    return true;
  }
}

/** A signup body is a few hundred bytes; anything much larger is not a form we rendered. */
export const MAX_BODY_BYTES = 4096;

/**
 * Only our own pages may post a signup: a cross-site form or script posting to us is refused. Browsers send
 * `Sec-Fetch-Site` (and `Origin` on a POST); a request with neither (curl, a test) is let through, since the
 * check is against other sites signing strangers up from their pages, not against a determined script.
 */
export function isSameSite(requestUrl: string, origin: string | undefined, fetchSite: string | undefined): boolean {
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site" && fetchSite !== "none") return false;
  if (origin && origin !== "null") {
    try {
      return new URL(origin).host === new URL(requestUrl).host;
    } catch {
      return false;
    }
  }
  return true;
}

/** RFC 5321 caps a path at 254 characters; anything longer is not an address we could ever send to. */
const MAX_EMAIL = 254;

/**
 * Deliberately loose: one @, something either side, a dot in the domain, no spaces or angle brackets. The
 * provider's confirmation email is the real check; this only stops typos like a missing @ and junk.
 */
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;.]{2,}$/;

/** Where a form may say it was. Anything else is recorded as "other" rather than trusted as free text. */
const SOURCE = /^(home|blog|newsletter|post:[a-z0-9-]{1,80}|report:[a-z0-9-]{1,80})$/;

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL && EMAIL.test(email);
}

export function normaliseSource(value: unknown): string {
  return typeof value === "string" && SOURCE.test(value) ? value : "other";
}

/**
 * A signup from a form body (urlencoded or JSON, already parsed to a record). `null` when the address is
 * missing or malformed. The hidden `rtm_hp` field is a honeypot: a person never sees it, a form-filling bot
 * fills it, and its signup is accepted (so it learns nothing) but never stored — `spam: true`.
 */
export function parseSubscription(body: Record<string, unknown>): (Subscription & { spam: boolean }) | null {
  const raw = body.email;
  if (typeof raw !== "string") return null;
  const email = normaliseEmail(raw);
  if (!isValidEmail(email)) return null;
  const honeypot = body.rtm_hp;
  return {
    email,
    source: normaliseSource(body.source),
    spam: typeof honeypot === "string" && honeypot.trim() !== "",
  };
}

/**
 * Store one signup. A repeat of an address already on the list changes nothing (the UNIQUE index), so asking
 * twice is harmless and reveals nothing about whether an address was already there. "unavailable" when there is
 * no database or the table is missing (migration 0006 not applied): the caller tells the reader to try later.
 * "limited" when `DAILY_SIGNUP_CAP` addresses have been added in the last 24 hours, counted from the newest
 * rows only (a reverse rowid scan, so at most the cap in rows read); a repeat is not told apart from a new one
 * below the cap, and above it nobody is stored.
 */
export async function recordSubscription(db: MarksDB | undefined, sub: Subscription, now: number): Promise<SubscribeResult> {
  if (!db) return "unavailable";
  try {
    const recent = await db
      .prepare("SELECT COUNT(*) AS n FROM (SELECT created_at FROM subscribers ORDER BY id DESC LIMIT ?) WHERE created_at >= ?")
      .bind(DAILY_SIGNUP_CAP, now - 24 * 60 * 60 * 1000)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= DAILY_SIGNUP_CAP) return "limited";
    await db
      .prepare("INSERT INTO subscribers (email, source, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING")
      .bind(sub.email, sub.source, now)
      .run();
    return "ok";
  } catch {
    return "unavailable";
  }
}

/** A list as the provider's CSV import reads it: email, then when and where they signed up. */
export function subscribersCsv(rows: Array<{ email: string; source: string; created_at: number; status: string }>): string {
  // A leading = + - @ would be a formula to a spreadsheet opening the file: prefix ' so it stays text.
  const cell = (raw: string) => {
    const value = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  const lines = rows.map((row) =>
    [row.email, new Date(row.created_at).toISOString(), row.source, row.status].map((value) => cell(String(value))).join(",")
  );
  return ["email,subscribed_at,source,status", ...lines].join("\n") + "\n";
}
