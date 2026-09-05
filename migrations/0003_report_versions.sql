-- Which version of each report the site is currently serving
-- (docs/plans/2026-09-04-content-publishing.md §5).
--
-- This one row per report is the publish mechanism. A report's rendered
-- fragments are written to R2 under a content hash — `reports/<id>/<hash>/…`,
-- invisible to anyone until pointed at — and the publish completes by setting
-- `content_hash` here. That UPDATE is the only non-idempotent step, so a
-- publish is atomic per report and a rollback is the same statement with the
-- previous hash: no deploy, no re-render, no re-upload.
--
-- Old hashes are never collected, so a citation can pin the exact text it
-- quoted. That is a stronger permalink guarantee than a deploy gave us, where
-- the previous text was recoverable only from git history.
--
-- A report with no row here is served from the deploy's own copy in
-- assets/generated/ — which is how every report is served until it has been
-- published, and what makes this table safe to add before anything writes to it.
CREATE TABLE report_versions (
  report TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  published_at INTEGER NOT NULL
);
