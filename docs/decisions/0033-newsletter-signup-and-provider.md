# 0033. Where do newsletter signups live, and which provider sends the newsletter?

- **Status:** proposed (direction decided by Rufus; provider open)
- **Date raised:** 2026-10-24 · **Date decided:** — (direction: 2026-10-24)
- **Decided by:** Rufus, 2026-10-24: a monthly newsletter, each issue also a blog post. Storage and provider: recommended defaults below, provider open
- **Beads:** reportsthatmatter-dtlb (this decision), reportsthatmatter-k8qo (the build)

## Question

Rufus wants a monthly newsletter, "From the archives": key excerpts from the reports, sometimes tied to the date or the news, each issue also published as a blog post. The site had no signup. Where do signups live until there is a provider, and which provider should send it?

## Context

- `docs/MARKETING.md` §8 said the email list was "a notification channel, not a newsletter". Rufus's 2026-10-24 instruction supersedes that: a monthly newsletter, low frequency, excerpts that point into the reports. MARKETING.md is updated to match.
- The site has no accounts and no tracking cookies, and /about says exactly what is recorded. A signup must keep to that: the address, nothing about the device.
- Creating a provider account is a new public sending identity and may cost money: under the 2026-10-24 protocol that is Rufus's call, so the site must collect signups without one.
- Issues are blog posts (`content/posts/<slug>.md` with `issue: N`), so the provider must take markdown or HTML we already have, not a second editor.

## Options

Storage now:

1. **Our D1, no provider yet (chosen).** Migration 0006 `subscribers` (email, source, created_at, status). One row write per new address. `pnpm subscribers count|export|remove` with the usual `--remote --yes` gate. Double opt-in is deferred to the provider's confirmation email on import, and the form says so.
2. Embed a provider's form now. Needs the account first; puts a third party on every page.

Provider, for later (prices as published October 2026; check before buying):

| | Fit | Cost | Notes |
|---|---|---|---|
| **Buttondown** | Markdown-native: paste the post's body; API; CSV import with confirmation email; archive pages; custom sending domain | Free to 100 subscribers, then about 9 USD/month to 1,000 | Small, independent, privacy-minded; RSS-to-email is a paid add-on we do not need |
| Ghost (Pro) | A whole CMS and membership system | From about 9-15 USD/month | Duplicates the blog we have; self-hosting needs Mailgun |
| Substack | Free, a discovery network | 10% only on paid subscriptions | Its own brand and platform around ours; MARKETING.md casts Substack Notes as distribution, not home; "not a media outlet" |
| Resend (Broadcasts) | Developer API, Cloudflare-friendly | Free tier for small lists, then usage-based | We would build list management, unsubscribe and compliance ourselves |
| Listmonk | Self-hosted, free software | Server plus an SMTP provider (SES) | Another service to run and keep deliverable |

## Decision

Storage: option 1, shipped in the PR that adds this record. Provider: **recommended Buttondown**, pending Rufus. When it is chosen: `pnpm subscribers export --remote --yes`, import the CSV with the confirmation email on (that is the double opt-in the form promises), then delete the exported rows from D1 so the list lives in one place, and point the form at the provider's API or keep ours and sync. Addresses that do not confirm are deleted, as /newsletter promises.

## Consequences

- Readers can sign up from the homepage, every report's contents and section pages, the blog and /newsletter. Nothing is sent until a provider exists.
- The list holds personal data: exports go to `build/` (gitignored), never a commit. Removal requests: `pnpm subscribers remove <email> --remote --yes`.
- Migration 0006 must be applied on the Datopian D1 before the deploy that ships the form (release checklist 12a). Without it the form answers "try again later" and stores nothing.
- Each issue is a blog post with `issue: N`, so issues are on /newsletter, in the Atom feed, and have a share card (`pnpm cards --blog`).

## Links

- `src/lib/subscribe.ts`, `src/templates/newsletter.ts`, `migrations/0006_subscribers.sql`, `scripts/subscribers.mjs`
- `content/posts/from-the-archives-1.md` (issue 1, draft)
- Buttondown pricing as researched: https://pricingsaas.com/companies/buttondown, https://toolradar.com/tools/buttondown/pricing
