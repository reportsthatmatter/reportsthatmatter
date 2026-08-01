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
command -v pdftotext >/dev/null 2>&1 \
  && echo "pdftotext: $(command -v pdftotext)" \
  || echo "pdftotext: MISSING — the ingestion pipeline needs poppler"

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
