#!/usr/bin/env bash
# Bootstrap a cold checkout and confirm the baseline, so a fresh session can
# tell its own breakage apart from breakage it inherited.
set -uo pipefail

cd "$(dirname "$0")/.."

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

step "Where we are"
pwd
git log --oneline -5
git status --short || true

step "Toolchain"
node --version
if ! command -v pnpm >/dev/null 2>&1; then
  echo "installing pnpm…"
  npm i -g pnpm >/dev/null 2>&1 || echo "  (global install failed; use 'npx pnpm')"
fi
pnpm --version
# poppler drifts, and its output feeds every committed baseline. A routine
# `brew upgrade` before a re-ingest is a real risk to citation stability (#117).
EXPECTED_POPPLER=$(sed -n 's/^export const EXPECTED_POPPLER = "\(.*\)";$/\1/p' scripts/ingest/poppler.ts)
if command -v pdftotext >/dev/null 2>&1; then
  found=$(pdftotext -v 2>&1 | sed -n 's/^pdftotext version \(.*\)$/\1/p')
  if [ "$found" = "$EXPECTED_POPPLER" ]; then
    echo "pdftotext: $found (pinned)"
  else
    printf 'pdftotext: \033[33m%s, expected %s\033[0m — diffs may be tool drift, not code (#117)\n' \
      "$found" "$EXPECTED_POPPLER"
  fi
else
  echo "pdftotext: MISSING — the ingestion pipeline needs poppler"
fi

step "Dependencies"
pnpm install

step "Browser"
pnpm exec playwright install chromium >/dev/null 2>&1 && echo "chromium ready"

step "Ledger"
if [ -f docs/v2-features.yaml ]; then
  echo "open items:"
  # Entries have multi-line descriptions, so track the current id rather than
  # grepping a fixed window back from `passes: false`.
  awk '
    /^- id:/ { id = $3 }
    /passes: false/ { print "  " id }
    /^  blocked:/ { print "      blocked" }
  ' docs/v2-features.yaml
fi

step "Baseline"
exec ./scripts/verify.sh
