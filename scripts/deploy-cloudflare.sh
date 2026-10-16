#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but not installed." >&2
  exit 1
fi

if [ ! -f "wrangler.toml" ]; then
  echo "wrangler.toml not found. Run this from the repo root." >&2
  exit 1
fi

echo "Installing dependencies (if needed)..."
pnpm install

# Production is the Datopian account (top level of wrangler.toml), reached with its wrangler profile whatever this
# directory is bound to. RTM_CF_ACCOUNT=atomatic deploys [env.atomatic] instead (rollback only; docs/hosting-migration.md).
case "${RTM_CF_ACCOUNT:-datopian}" in
  datopian) ACCOUNT_ARGS=(--env "" --profile datopian) ;;
  atomatic) ACCOUNT_ARGS=(--env atomatic --profile default) ;;
  *) echo "RTM_CF_ACCOUNT=${RTM_CF_ACCOUNT}: expected datopian or atomatic" >&2; exit 1 ;;
esac

echo "Checking Cloudflare login..."
if ! pnpm wrangler d1 list "${ACCOUNT_ARGS[@]}" >/dev/null 2>&1; then
  echo "Not logged in to Cloudflare. Run: pnpm wrangler login" >&2
  exit 1
fi

# assets/generated/ is not committed (it is build output, not source), so
# this is not optional — a deploy without it uploads no report pages at all.
echo "Pre-rendering reports..."
pnpm prerender

echo "Deploying Worker..."
pnpm wrangler deploy "${ACCOUNT_ARGS[@]}"

# A deploy does not publish content: report text is served from R2 under a content hash, set by
# `pnpm publish-report`, so after a deploy the question is which reports now need publishing
# (reportsthatmatter-6px). Informational only; it never fails the deploy.
RTM_BASE="${RTM_BASE:-https://reportsthatmatter.org}"
echo
echo "Which reports need publishing (served at ${RTM_BASE} against this checkout)..."
pnpm publish-report --all --status --base "$RTM_BASE" || echo "(could not read the drift table; run: pnpm publish-report --all --status --base ${RTM_BASE})"

