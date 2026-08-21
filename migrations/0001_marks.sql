-- Social proof (#96): one row per marking event (a share or a save).
-- Design: docs/plans/2026-08-21-highlights-design.md §4.
CREATE TABLE marks (
  id INTEGER PRIMARY KEY,
  report TEXT NOT NULL,
  section TEXT NOT NULL,
  paragraph TEXT NOT NULL,   -- text-derived paragraph id
  exact TEXT NOT NULL,       -- the quoted text, normalised
  prefix TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  page INTEGER,
  kind TEXT NOT NULL,        -- 'share' | 'save'
  actor TEXT NOT NULL,       -- salted daily hash of ip + user agent
  created_at INTEGER NOT NULL
);

CREATE INDEX marks_report_para ON marks (report, paragraph);
CREATE INDEX marks_report_actor ON marks (report, actor, created_at);
