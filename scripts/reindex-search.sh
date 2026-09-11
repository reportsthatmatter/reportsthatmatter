#!/usr/bin/env bash
# Refreshes and applies the D1 search index for one report.
#
#   ./scripts/reindex-search.sh <report-id> [--local]
#
# This is the automated half of a publish (docs/ARCHITECTURE.md "Search"):
# `pnpm publish-report <id>` calls this itself once a publish commits, so a
# normal publish leaves both content and search current with no separate
# step to remember.
#
# Scoped to one report on purpose. Building and applying every report's
# passages for a one-report change is what produced the ~17 MB file whose
# remote `wrangler d1 execute --file=` hit Cloudflare's import auth error
# (reportsthatmatter-7np / GH #123) — an ~800 KB single-report file applies
# in under a second. Splitting by report is the reliability fix, not just a
# speed one.
#
# Requires `assets/generated/reports/<id>/` to already reflect what you mean
# to index — `pnpm publish-report` guarantees that for its own call; running
# this by hand after any other change, run `pnpm prerender` first.
set -euo pipefail
cd "$(dirname "$0")/.."

id="${1:?Usage: ./scripts/reindex-search.sh <report-id> [--local]}"
target="local"
[ "${2:-}" = "--local" ] || target="remote"

if [ ! -d "assets/generated/reports/$id" ]; then
  echo "assets/generated/reports/$id not found — run pnpm prerender first." >&2
  exit 1
fi

echo "Building search index for $id..."
pnpm index-search "$id"

echo "Applying to D1 ($target)..."
pnpm wrangler d1 execute reportsthatmatter-marks "--$target" --file="build/search-index.$id.sql"

echo "✓ $id search index is current ($target)."
