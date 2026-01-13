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

echo "Checking Cloudflare login..."
if ! pnpm wrangler whoami >/dev/null 2>&1; then
  echo "Not logged in to Cloudflare. Run: pnpm wrangler login" >&2
  exit 1
fi

echo "Deploying Worker..."
pnpm wrangler deploy

echo
echo "Next step (one-time): add route v2.reportsthatmatter.org/* in Cloudflare dashboard"
