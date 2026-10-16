---
theme: Release and process
---
- **When a cutover makes a copy script's default target production, gate its wiping commands in the same PR as the switch.** (2026-10-16, #335 review, Opus) `pnpm migrate-hosting import-d1` (DELETE FROM every table, then load an export) and `sync-d1 --versions` defaulted to `--to datopian`, safe while Datopian was staging and a production wipe from the moment it served the domain; the runbook's own "only before the switch" was prose. They now refuse without `--overwrite-production` (`refuseOverwrite` in `scripts/lib/migrate-hosting.ts`, tested). Same review: rollback and decommission commands still named `--env datopian` (gone) or omitted `--env atomatic` (so `d1 delete` would have targeted the top-level, production, account). [status: done in #335]
