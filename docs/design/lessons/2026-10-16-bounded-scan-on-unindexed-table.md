---
theme: Public highlights feed implementation (2026-10-16, bght.10)
---
- **On a table with no index on the filtered columns, read a fixed rowid window and filter in memory, not `WHERE status = ... LIMIT n`** (2026-10-16, bght.10.3, implementation agent) The review's `/highlights` query filtered status and delay in SQL; with no index, SQLite scans past every non-matching row, so after `pnpm feed hide --all` every cache miss would read the whole table. `ORDER BY id DESC LIMIT 250` with the filter in JavaScript reads exactly 250 rows at any table size (measured: 200, 1,000 and 5,000 rows, and all hidden: 200, 250, 250, 250). [status: done in #333]
