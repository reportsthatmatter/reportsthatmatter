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
# directory is bound to. The atomatic account was decommissioned on 2026-10-24 (reportsthatmatter-4g4d.7): RTM_CF_ACCOUNT=atomatic is refused.
case "${RTM_CF_ACCOUNT:-datopian}" in
  datopian) ACCOUNT_ARGS=(--env "" --profile datopian) ;;
  atomatic) echo "RTM_CF_ACCOUNT=atomatic: the atomatic account was decommissioned on 2026-10-24 (reportsthatmatter-4g4d.7, .8); production is datopian. Unset RTM_CF_ACCOUNT." >&2; exit 1 ;;
  *) echo "RTM_CF_ACCOUNT=${RTM_CF_ACCOUNT}: expected datopian" >&2; exit 1 ;;
esac

echo "Checking Cloudflare login..."
if ! pnpm wrangler d1 list "${ACCOUNT_ARGS[@]}" >/dev/null 2>&1; then
  echo "Cannot reach reportsthatmatter-marks with ${ACCOUNT_ARGS[*]}: is wrangler's ${RTM_CF_ACCOUNT:-datopian} profile logged in? (Rufus: pnpm wrangler auth create datopian; AGENTS.md, Cloudflare)" >&2
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

