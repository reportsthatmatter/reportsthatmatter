# Reports that Matter

Reports that Matter turns hard-to-access public reports into searchable, readable, and linkable web pages so primary evidence can be easily found and referenced.

## Where it lives

| | URL |
| --- | --- |
| **Live site** | <https://reportsthatmatter.org> |
| Preview / direct worker | <https://reportsthatmatter.office-d34.workers.dev> |
| Previous site (archived) | [`gh-pages` branch](https://github.com/reportsthatmatter/reportsthatmatter/tree/gh-pages) — to be republished at `old.reportsthatmatter.org` |

The preview URL bypasses the zone (no cache, no routes), which makes it the one
to check when the live site looks stale. `scripts/verify.sh` runs against either:

```bash
./scripts/verify.sh                                          # local worker
VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh  # deployed
```

Cloudflare account: `office@atomatic.net`. Deploy with `pnpm wrangler deploy`.

## Plans

- [ROADMAP.md](docs/ROADMAP.md) — the master feature list, ordered by distribution
- [Architecture](docs/plans/2026-08-01-architecture.md) — storage, splitting, permalink stability
- [Loop engineering setup](docs/plans/2026-08-01-loop-engineering-setup.md)
- [MARKETING.md](docs/MARKETING.md)
  - [Landing Page Brief](docs/plans/brief-landing-page.md)
- [PRODUCT.md](docs/PRODUCT.md)
- [CLAUDE.md](CLAUDE.md) — house rules and the done condition

## Developers

Local dev:

```bash
pnpm install
pnpm test
pnpm wrangler dev --local
```

## Deploy (Cloudflare Workers)

Prereqs:
- Cloudflare account with the `reportsthatmatter.org` zone already added
- Node + pnpm installed
- Wrangler CLI available via `pnpm` (already in devDependencies)

Deploy:

```bash
pnpm install
pnpm wrangler login
pnpm wrangler whoami
pnpm wrangler deploy
```

Scripted deploy:

```bash
./scripts/deploy-cloudflare.sh
```

Custom domain routing (one-time):
- In Cloudflare dashboard: `reportsthatmatter.org` zone → Workers & Pages → Triggers → Add route
- Route: `v2.reportsthatmatter.org/*`
- Worker: `reportsthatmatter`

Verify:
- `https://v2.reportsthatmatter.org/health` returns `ok`

## About

Reports that Matter makes important public-interest reports easy to find, read, and link to online. Many government and inquiry reports are buried in obscure websites or locked inside long PDFs, making them hard to discover and reference. Reports that Matter presents these documents in a web-native format — searchable, readable, and linkable at the level of specific sections — so primary evidence can actually be used in journalism, research, and public debate.
