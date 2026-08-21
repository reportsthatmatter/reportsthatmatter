#!/usr/bin/env bash
# The done condition. Exits 0 only when the site is actually correct.
#
# Unit tests alone let "the tests pass but the page is blank" through, so this
# also boots the worker and asserts against real HTTP responses.
set -uo pipefail

cd "$(dirname "$0")/.."

PORT="${VERIFY_PORT:-8799}"
BASE="http://localhost:${PORT}"
FAILED=0
SERVER_PID=""

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILED=$((FAILED + 1)); }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
}
trap cleanup EXIT

# ---------- static checks ----------

step "Typecheck"
if pnpm typecheck >/tmp/rtm-typecheck.log 2>&1; then
  pass "tsc --noEmit"
else
  fail "tsc --noEmit"
  tail -20 /tmp/rtm-typecheck.log
fi

step "Unit tests"
if pnpm test >/tmp/rtm-test.log 2>&1; then
  pass "$(grep -oE 'Tests +[0-9]+ passed' /tmp/rtm-test.log | tail -1)"
else
  fail "vitest"
  tail -30 /tmp/rtm-test.log
fi

step "Ingestion fidelity"
if [ -f scripts/ingest/cli.ts ] && [ -d reports/jack-smith-vol1 ]; then
  if pnpm ingest verify >/tmp/rtm-ingest.log 2>&1; then
    pass "report fidelity checks"
  else
    fail "report fidelity checks"
    tail -30 /tmp/rtm-ingest.log
  fi
else
  printf '  \033[33m–\033[0m ingestion not yet built; skipping\n'
fi

# ---------- live site checks ----------

if [ -n "${VERIFY_BASE:-}" ]; then
  # Check a deployed environment instead of a local worker. Some failures only
  # exist in production — /health once flapped 200/404 because the asset router
  # answered before the Worker on some edges, which no local run can reproduce.
  BASE="$VERIFY_BASE"
  step "Checking deployed site ${BASE}"

  # A flapping route looks fine if you only ask once.
  codes=$(for _ in $(seq 1 6); do
    curl -s -o /dev/null -w '%{http_code} ' "${BASE}/health"
  done)
  if [ "$(echo "$codes" | tr ' ' '\n' | sort -u | grep -c .)" = "1" ]; then
    pass "/health stable across repeats (${codes% })"
  else
    fail "/health is not stable: ${codes% }"
  fi
else
  step "Booting worker on :${PORT}"
  pnpm wrangler dev --local --port "$PORT" >/tmp/rtm-wrangler.log 2>&1 &
  SERVER_PID=$!

  for _ in $(seq 1 60); do
    curl -sf "${BASE}/health" >/dev/null 2>&1 && break
    sleep 1
  done

  if ! curl -sf "${BASE}/health" >/dev/null 2>&1; then
    fail "worker did not start"
    tail -30 /tmp/rtm-wrangler.log
    printf '\n\033[31m%d check(s) failed\033[0m\n' "$FAILED"
    exit 1
  fi
  pass "worker responding"
fi

# /health answers before the bundle finishes building, so wait until a real
# report page is actually rendering before asserting on page content.
FIRST_ID=$(sed -n 's/^[[:space:]]*- id:[[:space:]]*//p' reports/registry.yaml | head -1)
if [ -n "$FIRST_ID" ]; then
  for _ in $(seq 1 60); do
    curl -s "${BASE}/reports/${FIRST_ID}/full" | grep -qF -- 'class="permalink"' && break
    sleep 1
  done
fi

step "Routes"

check_status() {
  local path="$1" expected="$2"
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${path}")
  if [ "$got" = "$expected" ]; then
    pass "${path} → ${got}"
  else
    fail "${path} → ${got} (expected ${expected})"
  fi
}

# Fetch to a file rather than piping into grep: `grep -q` exits on first match,
# which SIGPIPEs curl, and under `pipefail` that turns a passing check into a
# failing one on any response large enough to still be streaming.
FETCH_DIR=$(mktemp -d)
trap 'cleanup; rm -rf "$FETCH_DIR"' EXIT

fetch() {
  local path="$1"
  local cache="${FETCH_DIR}/$(echo "$path" | tr '/' '_')"
  [ -f "$cache" ] || curl -s "${BASE}${path}" -o "$cache"
  printf '%s' "$cache"
}

check_contains() {
  local path="$1" needle="$2"
  if grep -qF -- "$needle" "$(fetch "$path")"; then
    pass "${path} contains \"${needle}\""
  else
    fail "${path} missing \"${needle}\""
  fi
}

check_absent() {
  local path="$1" needle="$2"
  if grep -qF -- "$needle" "$(fetch "$path")"; then
    fail "${path} still contains \"${needle}\""
  else
    pass "${path} free of \"${needle}\""
  fi
}

check_status /health 200
check_status / 200
check_status /reports 200
check_status /about 200
check_status /reports/does-not-exist 404

check_contains / "Reports that Matter"
check_contains / "/assets/styles.css"
check_absent  / "cdn.tailwindcss.com"
check_contains /assets/styles.css "--canvas"
check_contains /assets/share.js "Highlight-to-share"
check_status /changelog 200
check_contains /changelog "What has changed"
check_status /sitemap.xml 200
check_contains /sitemap.xml "/reports/jack-smith-vol1/the-law"
check_status /robots.txt 200
check_contains /robots.txt "Sitemap:"

# Social proof (#96) — malformed input must not touch the database, and a
# well-formed one must not error even before a real reader ever sends one.
bad_mark=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/mark" \
  -H 'content-type: application/json' -d '{"kind":"not-a-real-kind"}')
[ "$bad_mark" = "400" ] && pass "/api/mark rejects a malformed event → 400" \
  || fail "/api/mark accepted a malformed event → ${bad_mark}"

good_mark=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/mark" \
  -H 'content-type: application/json' \
  -d '{"report":"verify-smoke","section":"s","paragraph":"p","exact":"e","kind":"share"}')
[ "$good_mark" = "204" ] && pass "/api/mark accepts a well-formed event → 204" \
  || fail "/api/mark rejected a well-formed event → ${good_mark}"

step "Report pages"
IDS=$(sed -n 's/^[[:space:]]*- id:[[:space:]]*//p' reports/registry.yaml)
if [ -z "$IDS" ]; then
  fail "no reports in registry"
fi
for id in $IDS; do
  # The report root is now a contents page; the text lives on sections and /full.
  check_status "/reports/${id}" 200
  check_contains "/reports/${id}" "Contents"
  check_contains "/reports/${id}" "/reports/${id}/full"

  check_status "/reports/${id}/full" 200
  check_contains "/reports/${id}/full" 'class="permalink"'
  check_contains "/reports/${id}/full" 'id="share-pop"'
  check_contains "/reports/${id}/full" '/assets/social-proof.js'
  check_status "/reports/${id}/not-a-real-section" 404

  # Social proof (#96): a D1 hiccup must never cost a reader the document, so
  # this must always answer 200 with a JSON list, empty or not.
  check_status "/reports/${id}/marks" 200
  check_contains "/reports/${id}/marks" "["

  # A shared passage link must land on the section holding it, not the contents.
  first_para=$(grep -oE '<p id="[a-z0-9-]+"' "$(fetch "/reports/${id}/full")" | head -1 | sed 's/.*id="//;s/"//')
  if [ -n "$first_para" ]; then
    routed=$(curl -s -o /dev/null -w '%{redirect_url}' "${BASE}/reports/${id}?p=${first_para}")
    case "$routed" in
      *"/reports/${id}/"*"#${first_para}") pass "?p=${first_para} routes to its section" ;;
      *) fail "?p=${first_para} routed to '${routed}'" ;;
    esac
  fi

  # Sidenotes only exist where the source has footnotes.
  src=$(sed -n "/- id: ${id}\$/,/^$/p" reports/registry.yaml | sed -n 's/.*source_path:[[:space:]]*//p')
  if [ -n "$src" ] && grep -q '^\[\^' "$src" 2>/dev/null; then
    check_contains "/reports/${id}/full" 'class="sidenote"'
  fi
  # Positional ids renumber on every re-ingest and silently break citations.
  check_absent  "/reports/${id}/full" '<p id="p-1"'
done

step "Browser end-to-end"
if pnpm exec node scripts/e2e.mjs "$BASE" >/tmp/rtm-e2e.log 2>&1; then
  while IFS= read -r line; do pass "$line"; done < <(grep '^ok ' /tmp/rtm-e2e.log | sed 's/^ok //')
else
  fail "browser checks"
  tail -40 /tmp/rtm-e2e.log
fi

# ---------- verdict ----------

if [ "$FAILED" -eq 0 ]; then
  printf '\n\033[32mAll checks passed.\033[0m\n'
  exit 0
fi

printf '\n\033[31m%d check(s) failed.\033[0m\n' "$FAILED"
exit 1
