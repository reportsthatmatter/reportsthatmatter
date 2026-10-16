/**
 * Reports whose share cards carry no plate (reportsthatmatter-ay85).
 *
 * The strategy's rule for reports about deaths and injustices is "no inquiry
 * logos, crests or images of the place on anything we make"
 * (marketing repo, strategy/2026-10-strategy.md section 8). Two plates break
 * it on a card: the Post Office Horizon Inquiry's plate is the Inquiry's own
 * wordmark (no figure exists in that PDF to use instead; sources.yaml `pohorizon`),
 * and Hillsborough's is the 1985 plan of the Leppings Lane turnstiles and pens.
 * `scripts/cards.mjs` renders these reports' cards (default and quote) without
 * the plate. The plate stays on the site's own pages; only the card, which
 * travels on a post, changes.
 */
export const PLATELESS_CARD_REPORTS: readonly string[] = ["uk-post-office-horizon-inquiry", "uk-hillsborough-panel"];
