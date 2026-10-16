---
theme: Tools that would have saved time
---
- **Pick a Cloudflare account with wrangler's global `--profile <name>`, not the directory bindings; and `wrangler d1 export` refuses any database with an FTS5 table, even with `--table`** (2026-10-16, reportsthatmatter-4g4d.3, hosting agent) `WRANGLER_PROFILE` is not read and `whoami` rejects `--profile`, but every other command takes it; `[env.datopian]` with `account_id` plus `--profile datopian` reached the Datopian account from a tree bound to atomatic. The FTS5 `passages` table had to be copied by paged `SELECT … WHERE rowid > ? LIMIT 500` (47k rows read). Both are now in `pnpm migrate-hosting` and `RTM_CF_ACCOUNT`. [status: done in #335]
