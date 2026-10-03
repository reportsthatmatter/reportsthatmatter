#!/usr/bin/env bash
# Refreshes and applies the D1 search index for one report.
#
#   ./scripts/reindex-search.sh <report-id> [--local] [--dry-run] [--full]
#
# This is the automated half of a publish (docs/ARCHITECTURE.md "Search"):
# `pnpm publish-report <id>` calls this itself once a publish commits, so a
# normal publish leaves both content and search current with no separate
# step to remember.
#
# Writes only the paragraphs that changed (scripts/reindex-search.mjs): D1's free tier allows 100,000
# row writes a day and rewriting every paragraph of a report for every publish spent it
# (reportsthatmatter-h6b). `--dry-run` prints the plan and estimated writes; `--full` is the old rewrite.
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
# Remote unless --local appears anywhere after the id (so `--full --local` cannot reach production).
target="remote"
for arg in "${@:2}"; do [ "$arg" = "--local" ] && target="local"; done

if [ ! -d "assets/generated/reports/$id" ]; then
  echo "assets/generated/reports/$id not found — run pnpm prerender first." >&2
  exit 1
fi

# Incremental by default: only paragraphs whose text, section or page changed are written
# (scripts/reindex-search.mjs). `--full` rewrites the whole report, the old behaviour.
extra=()
for arg in "${@:2}"; do [ "$arg" = "--local" ] || extra+=("$arg"); done
pnpm exec tsx scripts/reindex-search.mjs "$id" $([ "$target" = "local" ] && echo --local) "${extra[@]+"${extra[@]}"}"
