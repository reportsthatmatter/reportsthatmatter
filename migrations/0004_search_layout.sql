-- Where each report's search rows live, so a reindex reads only its own rows (reportsthatmatter-t4al).
--
-- `passages.report` is an UNINDEXED FTS5 column: `WHERE report = ?` reads every row in the corpus (~40k),
-- however small the report. On 2026-10-03 those scans (reindex reads, its row counts, the publish probe)
-- were 4.7M of the 5.48M rows read that spent the free tier's daily 5M. FTS5 can seek on rowid ranges,
-- so the version row records the report's rows as runs of rowids holding its rows and no other's:
-- `{"runs": [[lo, hi], ...], "n": <rows>, "at": <indexed_at>}` (scripts/lib/reindex.ts, Layout).
-- NULL means "not known": the reindex then scans the table once and records it.
ALTER TABLE search_index_versions ADD COLUMN layout TEXT;

-- A writer that knows about layouts always writes a new one (its `at` changes every time). Anything else
-- that updates the row (an older checkout's reindex, a hand edit) leaves `layout` as it was, and may have
-- added rows outside the runs: forget the layout, so the next reindex scans instead of trusting it.
-- A writer that replaces the row (DELETE + INSERT, as `pnpm index-search` and `--full` do) gets NULL anyway.
CREATE TRIGGER search_index_layout_guard
AFTER UPDATE ON search_index_versions
WHEN NEW.layout IS OLD.layout AND NEW.layout IS NOT NULL
BEGIN
  UPDATE search_index_versions SET layout = NULL WHERE report = NEW.report;
END;
