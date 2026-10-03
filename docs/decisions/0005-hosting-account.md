# 0005. Cloudflare plan and account: Workers Paid, or move to Datopian?

- **Status:** open
- **Date raised:** 2026-10-02
- **Decided by:** —
- **Beads:** reportsthatmatter-2oz; related: h6b, ewm0

## Context

On 2026-10-02 publishing hit D1's free-tier daily write limit (100k row writes), because each publish rewrote the search index; 8 reports were stuck until midnight UTC. Rufus agreed to Workers Paid (about $5/month, which has to be done in the dashboard), and also asked whether to move to the Datopian Cloudflare account, which is already paid. The incremental reindex (ewm0, site #237) cuts a typical release from about 253k writes to about 4.6k, which makes the quota less pressing.

## Options

1. Upgrade the current account (office@atomatic.net) to Workers Paid.
2. Migrate the Worker, R2, D1, DNS and secrets to the Datopian account.
3. Stay on the free tier, relying on incremental reindexing.

## Decision

Not yet made; a later migration decision (Rufus).
