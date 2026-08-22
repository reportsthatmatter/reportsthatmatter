-- Full-text search (#100): one row per paragraph, across every report.
-- Design: docs/plans/2026-08-21-search-decisions.md.
--
-- `section` holds the section title, not its slug — both because that is
-- what a result should show, and because it is then something a query can
-- actually match against (a mild boost for a hit in a heading, via bm25()
-- column weights, is the whole reason it is its own column). The slug for a
-- result's link comes from the report's own paragraph->section lookup
-- (src/lib/prerendered.ts, #115), not from this table.
--
-- report, paragraph_id, and page are UNINDEXED: stored and filterable
-- (`&report=` scoping is a plain WHERE), but not part of the free-text
-- match — a report id like "jack-smith-vol1" matching a query for the
-- surname "smith" would be a coincidence of the slug, not relevance.
CREATE VIRTUAL TABLE passages USING fts5(
  report UNINDEXED,
  section,
  paragraph_id UNINDEXED,
  page UNINDEXED,
  body,
  tokenize = 'porter unicode61'
);

-- Which build produced the rows currently indexed for a report, so a deploy
-- that changes report content without re-running the indexer is a detectable
-- defect rather than a search result silently pointing at stale text.
CREATE TABLE search_index_versions (
  report TEXT PRIMARY KEY,
  content_version TEXT NOT NULL,
  indexed_at INTEGER NOT NULL
);
