# Reports that Matter

Reports that Matter turns hard-to-access public reports into searchable, readable, and linkable web pages so primary evidence can be easily found and referenced.

## Plans

- [MARKETING.md](docs/MARKETING.md)
  - [Landing Page Brief](docs/plans/brief-landing-page.md)
- [PRODUCT.md](docs/PRODUCT.md)

## Next step ⏭️

Next concrete build step ...

- [ ] static one-page site

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
