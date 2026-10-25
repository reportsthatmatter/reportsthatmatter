/**
 * Link-preview fetchers (reportsthatmatter-te56, decision 0019). A report's `/full` page can be
 * 10.9 MB (Leveson) and Bluesky's card fetcher gives up on it, so for a page that large these
 * agents, and only these, are answered with a head-only page: the same preview tags and a link to
 * the contents page. Search engines and readers always get the whole report.
 *
 * The one place the list lives. Tokens are matched case-insensitively against the User-Agent.
 */
export const PREVIEW_AGENT_TOKENS = [
  "cardyb", // Bluesky
  "bluesky",
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "slackbot",
  "slack-imgproxy",
  "mastodon",
  "linkedinbot",
  "whatsapp",
  "discordbot",
  "telegrambot",
];

/** A `/full` body over this many bytes is answered head-only to preview agents. Only Leveson (10.9 MB) is over it; the next largest is 4.4 MB and previews fine. */
export const FULL_PREVIEW_THRESHOLD_BYTES = 8_000_000;

/** Roughly 10 bytes of `/full` HTML per word: a report with this many words is a "heavy" `/full` (Leveson 1.08M words, Philip Morris 0.44M). */
export const HEAVY_FULL_WORDS = FULL_PREVIEW_THRESHOLD_BYTES / 10;

export function isPreviewAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").toLowerCase();
  return ua !== "" && PREVIEW_AGENT_TOKENS.some((token) => ua.includes(token));
}
