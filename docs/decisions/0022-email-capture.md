# 0022. Should the site capture email sign-ups, and with which provider?

- **Status:** decided (accepted: the recommended default) 2026-10-16
- **Date raised:** 2026-10-16 · **Date decided:** 2026-10-16
- **Decided by:** Rufus, 2026-10-16: recommended default accepted
- **Beads:** reportsthatmatter-y2t.8 (the Bluesky half shipped; the email half is this decision), reportsthatmatter-3d41 (this decision)

## Question

Do we add an email sign-up to the site, and if so with which provider and where on the page?

## Context

Reportsthatmatter-y2t.8 asked for launch-traffic capture: an email form and a Follow on Bluesky link. Only the Bluesky link is built (a quiet footer line on /about, /press and report landing pages, no script). Without any capture, launch visitors leave nothing behind (the audit's lesson from a previous spike: thousands of users, nothing kept). Against that, the 2026-10 marketing strategy cuts "any mailing list" from the launch week, the project has no newsletter content planned, and an email list carries privacy duties (consent, storage, removal) for a site whose pitch is "no commentary, no spin". The site already serves an Atom feed for the blog, and the Bluesky poster posts daily.

## Options

1. **Do nothing yet.** Bluesky follow plus the blog's Atom feed are the capture. Revisit when there is something to send (the per-paragraph dataset, a new-report announcement habit).
2. **Link to a hosted sign-up page (Buttondown or similar), no form and no script on our pages.** One more footer link. Provider holds the data, handles consent and unsubscribes; export is a CSV. Cheap, reversible, no third-party code on reading pages. Costs a few dollars a month at scale, free at the start.
3. **Embedded form posting to a provider (Buttondown, Mailchimp, ConvertKit).** Better conversion, but a form on the page, a provider the visitor never sees named, and for some providers a third-party script.
4. **Our own capture:** a Worker endpoint writing to D1 and sending through a transactional provider (Resend, Postmark). Full control and no third party on the page, but we own consent records, double opt-in, unsubscribe and deliverability, and D1 write budget is already a constraint.

## Recommendation

Option 1 for launch week, then option 2 (Buttondown) the first time there is an announcement worth sending. Do not build option 4. If chosen, add the link next to the Bluesky one in the same footer line, with one sentence saying what is sent and how often.

## Decision

Rufus, 2026-10-16: recommended default accepted. Option 1: no email capture at launch; Bluesky follow and the blog's Atom feed are the capture. Revisit option 2 (a hosted Buttondown link) the first time there is an announcement worth sending. Option 4 is not to be built.

## Consequences

If option 2: a provider account in Rufus's name, a privacy line on /about, and a short test next to `tests/follow.test.ts`. If option 1: nothing to build; revisit after the first newsletter-worthy release.

## Links

- Bluesky link: `src/templates/site.ts` (`BLUESKY_PROFILE_URL`), `src/templates/layout.ts` (`follow`).
- The marketing strategy: `marketing/strategy/2026-10-strategy.md`.
