#!/usr/bin/env bash
# Stop hook for unattended runs: blocks the turn from ending while verify.sh
# fails, so the loop cannot stop on red.
#
# Opt-in, because verify.sh boots a worker and a browser and takes the better
# part of a minute — fine once per loop iteration, miserable on every turn of
# an interactive session. Enable by exporting RTM_LOOP=1 in the session that
# runs the loop.
#
# Wire it up in .claude/settings.json (that directory is gitignored, so this
# stays a local choice):
#
#   {
#     "hooks": {
#       "Stop": [
#         { "hooks": [{ "type": "command", "command": "./scripts/stop-hook.sh" }] }
#       ]
#     }
#   }

set -uo pipefail
cd "$(dirname "$0")/.."

if [ "${RTM_LOOP:-0}" != "1" ]; then
  exit 0
fi

if ./scripts/verify.sh > /tmp/rtm-stop-hook.log 2>&1; then
  exit 0
fi

echo "verify.sh is failing — the work is not finished. Output:" >&2
tail -40 /tmp/rtm-stop-hook.log >&2
exit 2
