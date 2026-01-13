# Cloudflare Deployment Docs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Cloudflare Workers deployment instructions (including custom domain routing) and a helper script to the repo.

**Architecture:** Document a Worker-first deploy flow in the README and provide a simple shell script that validates prerequisites and runs `wrangler deploy`, then prints the manual route step for `v2.reportsthatmatter.org/*`. Keep changes small and focused on docs + script.

**Tech Stack:** Cloudflare Workers, Wrangler CLI, pnpm, Bash

### Task 1: Add deploy instructions to README

**Files:**
- Modify: `README.md`

**Step 1: Draft the README section**

Add a new section titled "Deploy (Cloudflare Workers)" after the Developers section with the following content:

```markdown
## Deploy (Cloudflare Workers)

Prereqs:
- Cloudflare account with the `reportsthatmatter.org` zone already added
- Node + pnpm installed
- Wrangler CLI available via `pnpm` (already in devDependencies)

Deploy:

```bash
pnpm install
pnpm wrangler login
pnpm wrangler whoami
pnpm wrangler deploy
```

Custom domain routing (one-time):
- In Cloudflare dashboard: `reportsthatmatter.org` zone → Workers & Pages → Triggers → Add route
- Route: `v2.reportsthatmatter.org/*`
- Worker: `reportsthatmatter`

Verify:
- `https://v2.reportsthatmatter.org/health` returns `ok`
```

**Step 2: Review for accuracy and clarity**

Confirm the section mentions the `v2.reportsthatmatter.org` route and the Worker name matches `wrangler.toml`.

**Step 3: Optional verification**

Run: `pnpm test`
Expected: all tests pass

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add cloudflare workers deploy steps"
```

### Task 2: Add deploy helper script

**Files:**
- Create: `scripts/deploy-cloudflare.sh`

**Step 1: Create the script**

```bash
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
pnpm wrangler whoami >/dev/null

if [ $? -ne 0 ]; then
  echo "Not logged in to Cloudflare. Run: pnpm wrangler login" >&2
  exit 1
fi

echo "Deploying Worker..."
pnpm wrangler deploy

echo
echo "Next step (one-time): add route v2.reportsthatmatter.org/* in Cloudflare dashboard"
```

**Step 2: Make it executable**

Run: `chmod +x scripts/deploy-cloudflare.sh`
Expected: file is executable

**Step 3: Optional verification**

Run: `./scripts/deploy-cloudflare.sh`
Expected: deploy runs; script prints the manual route step

**Step 4: Commit**

```bash
git add scripts/deploy-cloudflare.sh
git commit -m "chore: add cloudflare deploy helper script"
```
