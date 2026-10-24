/**
 * The newsletter signup (decision 0033): what a signup form may send, and the one D1 write it costs.
 *
 * No email is sent from the site. Rows wait in `subscribers` (migration 0006) until they are exported to the
 * mailing provider, whose own confirmation email is the double opt-in. So this keeps as little as possible: the
 * address, where the form was, and the time. No network address, browser or actor hash.
 */
import type { MarksDB } from "./marks";

export type Subscription = { email: string; source: string };

export type SubscribeResult = "ok" | "invalid" | "unavailable";

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
 * missing or malformed. The hidden `website` field is a honeypot: a person never sees it, a form-filling bot
 * fills it, and its signup is accepted (so it learns nothing) but never stored — `spam: true`.
 */
export function parseSubscription(body: Record<string, unknown>): (Subscription & { spam: boolean }) | null {
  const raw = body.email;
  if (typeof raw !== "string") return null;
  const email = normaliseEmail(raw);
  if (!isValidEmail(email)) return null;
  const honeypot = body.website;
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
 */
export async function recordSubscription(db: MarksDB | undefined, sub: Subscription, now: number): Promise<SubscribeResult> {
  if (!db) return "unavailable";
  try {
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
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = rows.map((row) =>
    [row.email, new Date(row.created_at).toISOString(), row.source, row.status].map((value) => cell(String(value))).join(",")
  );
  return ["email,subscribed_at,source,status", ...lines].join("\n") + "\n";
}
