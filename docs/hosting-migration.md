# Hosting migration: atomatic to Datopian Cloudflare account

Runbook for moving reportsthatmatter.org from the `office@atomatic.net` Cloudflare account (free plan) to the Datopian account (`accounts@datopian.com`, Workers Paid). Decision: bead `reportsthatmatter-2oz` (Rufus, 2026-10-16: migrate ASAP, Worker, D1, R2 and the domain). Epic `reportsthatmatter-4g4d`. The site is not publicly launched yet, so Rufus accepts a short outage at the switch; there is no proxy-Worker interim (option (b) below records why it was considered and dropped).

## Where things stand

| | atomatic (production today) | Datopian (staging, then production) |
|---|---|---|
| Account id | `d342705a2f17c3e08a5dab494564e406` | `83025b28472d6aa2bf5ae59f3724aa78` |
| wrangler profile | `default` (what `~/src/reportsthatmatter` is bound to) | `datopian` |
| Worker | `reportsthatmatter`, routes `reportsthatmatter.org/*`, `www.…/*`, `old.…/*`; https://reportsthatmatter.office-d34.workers.dev | `reportsthatmatter`, no routes yet; https://reportsthatmatter.datopian.workers.dev |
| D1 `reportsthatmatter-marks` | `5200e0db-733d-40d6-962e-2f1eb024f060` | `ceb6c2cc-f9a2-414c-8ff5-476da129e7ec` (WEUR) |
| R2 `reportsthatmatter-content` | WEUR, 9,841 objects, 1.06 GB (2026-10-16) | WEUR, copied with `pnpm migrate-hosting sync-r2` |
| Secrets | `PUBLISH_SECRET`, `MARK_SALT` | `PUBLISH_SECRET` (same value, from `~/.rtm-publish-secret`, so every report token still works), `MARK_SALT` (new random value: it only salts the daily actor hash) |
| Zone / domain | Zone `661996764ff46ed21660699599d54aa7` (Free plan); domain on Cloudflare Registrar, NS jeff/jessica.ns.cloudflare.com, expires 2027-07-07 | none yet |

Everything else production uses: compatibility date 2024-12-01, `nodejs_compat`, static assets (`assets/`, `run_worker_first`), vars `REPORTS_SOURCE` and `LEGACY_BASE`, `[version_metadata]`. No KV, cron triggers, queues, Durable Objects or Analytics Engine. D1 tables: `marks` (303 rows on 2026-10-16), `passages` (FTS5, 46,744 rows), `report_versions` (18), `search_index_versions` (18).

## How an agent targets the Datopian account

Without touching wrangler's directory bindings (`~/Library/Preferences/.wrangler/profiles/directory-bindings.json`, which only Rufus changes):

- **wrangler directly:** add `--env datopian --profile datopian`. `--profile` is wrangler's global flag (there is no environment variable for it; `WRANGLER_PROFILE` is not read). `[env.datopian]` in `wrangler.toml` carries the `account_id` and the Datopian bindings. Example: `pnpm wrangler d1 execute reportsthatmatter-marks --remote --env datopian --profile datopian --command "SELECT count(*) FROM marks"`.
- **Expected warning until the switch:** a plain `wrangler deploy` (atomatic, unchanged) now warns "Multiple environments are defined … but no target environment was specified"; it still deploys the top level. `CLOUDFLARE_ENV=datopian` is wrangler's own variable for `--env`, but not for the profile, so it is not enough on its own here.
- **The repo's scripts:** `RTM_CF_ACCOUNT=datopian`. `scripts/lib/d1.ts` (publish's reindex, `seed-highlights`, `check-search-staleness`, `marks check`), `scripts/deploy-cloudflare.sh` and `pnpm d1-usage` honour it. Unset, they behave as before (wrangler's own resolution: atomatic).
- **Data copy:** `pnpm migrate-hosting` (`--help`). It never writes to the source account.

## Steps

Who does what: **R** = Rufus in the Cloudflare dashboard (bead `reportsthatmatter-i1wy` holds his steps); **A** = an agent. The order is the plan Rufus set on 2026-10-16.

### 1. Datopian resources and staging verify (A, done 2026-10-16)

```bash
pnpm wrangler d1 create reportsthatmatter-marks --location weur --profile datopian
pnpm wrangler r2 bucket create reportsthatmatter-content --location weur --profile datopian
pnpm wrangler d1 migrations apply reportsthatmatter-marks --remote --env datopian --profile datopian
pnpm migrate-hosting export-d1     # production D1 into build/hosting/ (reads every row once, ~47k of the 5M/day)
pnpm migrate-hosting import-d1     # wipes the Datopian tables, loads, then verify-d1 (row counts and sha256 per table)
pnpm migrate-hosting sync-r2       # copies every object missing or different, then compares every ETag (~45 min for 10k objects: API rate limit)
RTM_CF_ACCOUNT=datopian ./scripts/deploy-cloudflare.sh
tr -d '\n' < ~/.rtm-publish-secret | pnpm wrangler secret put PUBLISH_SECRET --env datopian --profile datopian
openssl rand -hex 32 | tr -d '\n' | pnpm wrangler secret put MARK_SALT --env datopian --profile datopian
RTM_CF_ACCOUNT=datopian VERIFY_BASE=https://reportsthatmatter.datopian.workers.dev ./scripts/verify.sh
```

### 2. Add the zone on Datopian, and an API token (R)

1. In the **atomatic** account: Websites > reportsthatmatter.org > DNS > Records > **Import and Export** > **Export**. Save the file as `~/src/reportsthatmatter/factory/scratch/datopian-1016/atomatic-zone.txt` (the agent's OAuth token cannot read DNS records; public DNS shows only the proxied apex/www/old and `_atproto` TXT, so the export is how nothing is missed).
2. In the **Datopian** account: Add a domain > `reportsthatmatter.org` > **Free** plan is enough (Workers Paid is per account, not per zone). When it offers to scan or import DNS records, skip it (an import of proxied records from the scan can cause error 1000; the agent creates the records). The zone stays **Pending** with its own two assigned nameservers; note them. Do not change nameservers anywhere: the registrar move does that.
3. In the **Datopian** account: My Profile > API Tokens > Create Token > Custom token, scoped to account Datopian and zone `reportsthatmatter.org`, permissions: Zone > DNS > Edit; Zone > Workers Routes > Edit; Zone > SSL and Certificates > Edit; Zone > Zone > Read; Account > Workers Scripts > Edit. Save it to `~/.config/cloudflare/datopian-rtm-token` (`chmod 600`; one line, the token only). Agents use it with `CLOUDFLARE_API_TOKEN` and never print it.

### 3. Recreate DNS records in the Datopian zone (A)

From `atomatic-zone.txt`, recreate every record except the ones the Worker's custom domains create (apex, `www`, `old`: those come from step 5) and Cloudflare's own CAA records. Known today: `_atproto` TXT `did=did:plc:owtfs5pk265ppfmojghzr56t` (Bluesky handle `@reportsthatmatter.org`). Check the export for a Google Search Console `google-site-verification` TXT, MX/SPF/DKIM/DMARC (public DNS shows no MX and no mail TXT on 2026-10-16) and anything else.

```bash
export CLOUDFLARE_API_TOKEN=$(cat ~/.config/cloudflare/datopian-rtm-token)
ZONE=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/zones?name=reportsthatmatter.org&account.id=83025b28472d6aa2bf5ae59f3724aa78" | jq -r '.result[0].id')
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "content-type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  --data '{"type":"TXT","name":"_atproto.reportsthatmatter.org","content":"\"did=did:plc:owtfs5pk265ppfmojghzr56t\"","ttl":1}'
```

Then attach the custom domains (step 5's first command) already now if the API accepts it on a pending zone: the records and certificate requests are then in place the moment the zone activates. If it refuses on a pending zone, do it right after activation.

### 4. Move the registration (R)

Prerequisites (checked 2026-10-16): DNSSEC is off (no DS record); registered 2019, so more than 10 days ago; status only `clientTransferProhibited` (the normal lock, not an administrative one). Still to check in the dashboard: the registrant email is verified, and no Change of Registrant is pending.

**Before you click Start, tell the agent (or the integrator) "freeze"**: no `publish-report`, no deploy and no `seed-highlights --remote` until step 5 is done. The agent then runs the pre-move sync:

```bash
pnpm migrate-hosting sync-r2                 # objects published since the copy (e.g. the CIA report on 2026-10-16)
pnpm migrate-hosting sync-d1 --versions      # new marks, report_versions, search_index_versions, passages of reindexed reports
pnpm migrate-hosting verify-d1               # informational after a sync: marks rows differ by what was appended
```

1. **atomatic account**: Domain Registration > Manage Domains > reportsthatmatter.org > **Manage** > **Configuration** tab > **Start** (the inter-account move) and follow the prompts: enter the Datopian account id `83025b28472d6aa2bf5ae59f3724aa78` and confirm.
2. **Datopian account**: accounts@datopian.com receives an email. Domain Registration > Manage Domains: a banner says domains need action > **View Actions** > **Accept**. This must happen within 5 days or the request is cancelled.
3. After acceptance the registration (and its renewals) belongs to Datopian; nothing else moves. The domain's nameservers should now be the Datopian zone's assigned pair: check Datopian > reportsthatmatter.org > Overview, and click **Re-check now** until the zone is **Active** (minutes to a few hours while resolvers' NS caches expire). If the nameservers did not change by themselves, set them in Datopian > Domain Registration > Manage > DNS / nameservers to the pair the zone was assigned in step 2.
4. The domain is locked against further transfers for 30 days. The atomatic zone shows **Moved**; leave it (Cloudflare deletes it after 7 + 7 days).

Expected outage: from the nameserver change until the Datopian zone is active and the custom domains have certificates. While resolvers still hold the old NS (the `.org` delegation TTL is 3,600 s; allow a few hours for stragglers), some readers still reach the atomatic Worker, which keeps serving from atomatic D1: marks they write there are copied over by the post-switch `sync-d1` in step 5.

### 5. Switch production to Datopian (A)

Once the zone is Active on Datopian:

```bash
# Custom domains (the Worker owns the hostname; Cloudflare creates the DNS record and certificate):
for host in reportsthatmatter.org www.reportsthatmatter.org old.reportsthatmatter.org; do
  curl -s -X PUT -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "content-type: application/json" \
    "https://api.cloudflare.com/client/v4/accounts/83025b28472d6aa2bf5ae59f3724aa78/workers/domains" \
    --data "{\"hostname\":\"$host\",\"service\":\"reportsthatmatter\",\"zone_id\":\"$ZONE\",\"environment\":\"production\"}"
done
pnpm migrate-hosting sync-d1                 # marks written on atomatic since the last sync (appended; ids are not kept)
RTM_CF_ACCOUNT=datopian VERIFY_SHARED=1 VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh
curl -sI https://www.reportsthatmatter.org/ | head -3   # 301 to the apex, served by the Worker
dig +short TXT _atproto.reportsthatmatter.org           # Bluesky handle record
```

Run `pnpm migrate-hosting sync-d1` again a day later (the last resolvers have moved by then), then lift the freeze. Then make Datopian the default (part (d) below) in one PR.

## (a) The domain move, in short

Self-serve inter-account move ([Cloudflare Registrar: inter-account transfer](https://developers.cloudflare.com/registrar/account-options/inter-account-transfer/)): the zone must exist in the target first, DNSSEC off, registrant email verified, registered more than 10 days; Start in the source (Manage Domain > Configuration), Accept in the target (Manage Domains > View Actions) within 5 days; 30-day lock after. Only the registration and WHOIS move: DNS records, Workers routes, certificates and every other zone setting stay behind ([Move a domain between accounts](https://developers.cloudflare.com/fundamentals/manage-domains/move-domain/): certificates are not transferred; Universal SSL reissues on the new zone; a Registrar domain must not use the nameserver-swap route). Hence steps 2 and 3 before 4.

## (b) The interim proxy Worker (considered, dropped)

The idea: keep the domain on atomatic and replace the atomatic Worker with a thin proxy to `reportsthatmatter.datopian.workers.dev`, so D1 runs on the paid account at once. It works technically (a cross-account CNAME to a proxied Cloudflare hostname fails with error 1014, a Worker `fetch` does not), costs no D1 on atomatic, but still counts every request against atomatic's free 100,000 Worker requests a day (twice the invocations per page: the proxy and the target), and it is one more moving part to build, test and remove. Rufus chose (2026-10-16) to go straight to the domain move since the site is not launched. Keep it in mind only as a rollback tool, see (e).

## (c) Data freeze and final re-sync

- `pnpm migrate-hosting sync-d1 [--versions]` reads only marks with `id >` the watermark in `build/hosting/state.json` (set by `import-d1`, advanced by each sync), so it costs a handful of reads on the free tier. It appends them on Datopian without their ids (Datopian assigns new ones once it takes its own writes; nothing refers to a mark by id). `--versions` also replaces `report_versions` and `search_index_versions` and re-copies the passages of every report reindexed on atomatic since the copy; use it only before the switch (afterwards Datopian's are the newer).
- `pnpm migrate-hosting sync-r2` is incremental: it copies only missing or changed objects (by key, ETag and size) and then compares all of them.
- `build/hosting/` is per worktree: run every sync from the worktree that ran `import-d1`, or run `export-d1` and `import-d1` again (a full re-copy takes ~3 minutes and ~47k reads; it also wipes the staging marks that verify.sh wrote on Datopian).
- Freeze: from the pre-move sync in step 4 until step 5's verify passes, nobody publishes, deploys or seeds. A publish in that window would go to whichever account the publisher's DNS resolves to.

## (d) Switching the repo to Datopian

One PR after step 5 (bead to file at the switch):

- `wrangler.toml`: Datopian becomes the top level: `account_id = "83025b28472d6aa2bf5ae59f3724aa78"`, D1 `database_id = "ceb6c2cc-f9a2-414c-8ff5-476da129e7ec"`, the routes replaced by `routes = [{ pattern = "reportsthatmatter.org", custom_domain = true }, { pattern = "www.reportsthatmatter.org", custom_domain = true }, { pattern = "old.reportsthatmatter.org", custom_domain = true }]`; drop `[env.datopian]`. Keep the atomatic ids in this runbook for rollback.
- Rufus rebinds the directory once: `cd ~/src/reportsthatmatter && pnpm wrangler auth activate datopian` (agents must not edit the bindings). Until then agents add `--profile datopian` (scripts: `RTM_CF_ACCOUNT=datopian`). Afterwards plain `pnpm wrangler …` works again and `pnpm wrangler d1 list` shows the Datopian database.
- `scripts/lib/migrate-hosting.ts`: `accountFromEnv` defaults to `datopian` (so `d1.ts`, `d1-usage` and `deploy-cloudflare.sh` need no variable).
- `scripts/lib/d1-usage.ts` `FREE_TIER` and `pnpm ship`'s d1-estimate step: Workers Paid includes 25 billion rows read and 50 million rows written a month (then billed per million), with no daily stop. Replace the daily free-tier refusal with a warning on unusual spend (the t4al and h6b limits no longer apply); the `--no-reindex` and `WHERE report = ?` advice stays (cost, not outage).
- `scripts/lib/d1-probe.ts` (`FREE_TIER_DAILY_WRITES`, the publish preflight's refusal), `scripts/lib/ship.ts` (limits passed to `fits`), `scripts/d1-usage.mjs` ("the free tier resets at 00:00 UTC" wording and `--alert` percentages), `scripts/lib/d1.ts` `quotaExhausted`: keep the measurement, drop the daily stop.
- `README.md` ("Cloudflare account: office@atomatic.net"), `.claude/skills/integrate-and-ship/SKILL.md` step 6 (D1 budget).
- `AGENTS.md`: the Deploy section ("Cloudflare account office@atomatic.net") and the Cloudflare paragraph under Working conventions (account, profile, binding, free-tier limits); `docs/release-checklist.md` steps 11 and 13; `docs/d1-usage-alert.md`; `docs/ARCHITECTURE.md` if it names the account.
- `pnpm publish-report` needs no change (it posts to `--base`, which is the domain), nor do the report repos' tokens (same `PUBLISH_SECRET`).

## (e) Rollback

- **Before step 4's Accept**: nothing has changed for readers. Cancel the move (or let the 5 days lapse); atomatic keeps serving.
- **After the move, if the Datopian Worker misbehaves**: fix forward on Datopian (`pnpm wrangler rollback --env datopian --profile datopian` to the previous version; D1 Time Travel `pnpm wrangler d1 time-travel restore reportsthatmatter-marks --timestamp <ISO> --env datopian --profile datopian` for data).
- **If the Datopian account itself is the problem**: the registration cannot return to atomatic for 30 days, but the zone can point anywhere. Deploy a proxy Worker on the Datopian zone (or a custom domain on a tiny Worker) forwarding to `https://reportsthatmatter.office-d34.workers.dev`, which keeps running on atomatic with its own D1 and R2 until decommission; copy back marks written on Datopian with `pnpm migrate-hosting sync-d1 --from datopian --to atomatic` (writes to atomatic: only for a real rollback).

## (f) Decommission (after a 2-week soak with verify green)

1. Final read of anything written on atomatic after the switch: `pnpm migrate-hosting sync-d1` (should report 0 marks).
2. Rufus or an agent with Rufus's go-ahead, on atomatic: delete the Worker `reportsthatmatter` (its routes went with the zone), then `pnpm wrangler d1 delete reportsthatmatter-marks --profile default` (take a last `export-d1` first and keep `build/hosting/` in the factory scratch), then empty and delete the R2 bucket `reportsthatmatter-content`. Leave the other atomatic resources (`flowershow-cloud`, `rufus` buckets) alone.
3. Remove `ACCOUNTS.atomatic`, the `--from/--to` reverse path if unused, and this runbook's "Where things stand" atomatic column; close epic `reportsthatmatter-4g4d`.
