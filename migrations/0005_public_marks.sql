-- The public highlights feed (reportsthatmatter-bght.10.1, decision 0023): one row per reader mark whose words
-- were found in the published report when the mark was recorded (src/lib/feed.ts, publishMark).
--
-- Everything printed on /highlights comes from here, and every field is derived from the report, not from the
-- client: `words` is the slice of the paragraph the selection located, `anchor` is rebuilt from the paragraph's
-- own text either side, `page` is the paragraph's data-page, `section_title` is the fragment's first heading.
-- There is no actor column: nothing here identifies a reader. Rows are derived from `marks` and can be rebuilt
-- from it (`pnpm feed rebuild`).
--
-- No secondary index: /highlights reads the newest rows by rowid (`ORDER BY id DESC LIMIT n`), which needs none,
-- and each insert then costs one row write.
--
-- status: 'visible' | 'held' (reason 'cap' or 'blocklist': kept for `pnpm feed list --held`, never shown) |
-- 'hidden' (reason 'manual': `pnpm feed hide`).
--
-- Apply to production BEFORE the deploy that ships the code that writes it. Code treats a missing table as
-- "feed off", so the order only matters for whether marks made in between reach the feed.
CREATE TABLE public_marks (
  id INTEGER PRIMARY KEY,
  report TEXT NOT NULL,
  paragraph TEXT NOT NULL,
  slug TEXT NOT NULL,
  section_title TEXT NOT NULL,
  words TEXT NOT NULL,
  anchor TEXT NOT NULL,
  page INTEGER,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible',
  reason TEXT NOT NULL DEFAULT ''
);
