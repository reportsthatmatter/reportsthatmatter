# Scheduled D1 usage alert

`pnpm d1-usage --alert 80` exits 2 when today's rows read or written are at or over 80% of the free tier's daily limit (5,000,000 reads, 100,000 writes, reset 00:00 UTC), 3 when Cloudflare analytics cannot be read (no credentials, or wrangler not logged in: this machine's ledger alone cannot see the Worker's search and marks traffic), and 0 otherwise. A scheduled run turns that into a notification before a release or a traffic burst spends the day's reads (reportsthatmatter-t4al: search and marks were down from ~18:50 UTC on 2026-10-03). It costs no D1 rows: analytics is Cloudflare's GraphQL API, not a query against the database.

Nothing here is installed by the repo. The schedule lives on the machine that runs releases (it needs wrangler's login, `pnpm wrangler login`, or `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`). Run it by hand first: `pnpm d1-usage --alert 80; echo $?`.

## The wrapper

Save as `~/bin/rtm-d1-alert` (`chmod +x`). It runs from the integrator's site checkout, notifies once per hour at most, and treats exit 3 as an alert too, because an unreadable alert is not a quiet one.

```bash
#!/bin/bash
cd "$HOME/src/reportsthatmatter/reportsthatmatter" || exit 1
out=$(pnpm -s d1-usage --alert 80 2>&1); code=$?
[ "$code" -eq 0 ] && exit 0
stamp="$HOME/.local/state/rtm/d1-alert.stamp"
mkdir -p "$(dirname "$stamp")"
if [ -z "$(find "$stamp" -mmin -60 2>/dev/null)" ]; then
  touch "$stamp"
  osascript -e 'display notification "pnpm d1-usage --alert 80 exited '"$code"': hold releases and reindexes until 00:00 UTC" with title "RTM D1 usage"'
fi
echo "$out" >> "$HOME/.local/state/rtm/d1-alert.log"
```

## launchd (macOS), every 30 minutes

`~/Library/LaunchAgents/org.reportsthatmatter.d1-alert.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>org.reportsthatmatter.d1-alert</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>-lc</string><string>$HOME/bin/rtm-d1-alert</string></array>
  <key>StartInterval</key><integer>1800</integer>
  <key>StandardErrorPath</key><string>/tmp/rtm-d1-alert.err</string>
</dict>
</plist>
```

Load with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/org.reportsthatmatter.d1-alert.plist`; remove with `launchctl bootout gui/$(id -u)/org.reportsthatmatter.d1-alert`. The `-lc` login shell is so `pnpm` and `node` are on the PATH.

## cron (Linux, or macOS without launchd)

```
*/30 * * * * PATH=/usr/local/bin:/opt/homebrew/bin:$PATH $HOME/bin/rtm-d1-alert
```

On Linux replace the `osascript` line with `notify-send` or a mail command.

## Reading the result

Exit 2 means hold releases (`pnpm ship` also refuses when what is left is less than what the release needs, and when usage is unknown). `pnpm d1-usage` without `--alert` shows what spent it by tool and by query.
