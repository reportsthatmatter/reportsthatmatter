# Serving architecture: pre-render vs R2 vs static (issue #107)

**Date:** 2026-08-21
**Status:** recommendation
**Context:** production returned Cloudflare 1102 (CPU exceeded) as 503s on
`/full`, section pages, and `/sitemap.xml` on 2026-08-21. Mitigated (isolate
memo + edge cache) but not fixed, in `main`. This document answers the
objections Rufus raised the same day: build slowness, rebuilding on a theme
change, and whether R2 was properly considered. Everything below is measured
against this repo — commands are in each section, re-run them to check.

---

## 0. The short version

1. **Rufus is right that "pre-render vs static" is a false choice — they're the
   same architecture.** Once you list what genuinely needs request time
   (§4), what's left over is identical whether you call the other 95% of
   pages "pre-rendered" or "a static site." The only real question is
   **where the rendered files live**, and that was already answered on
   2026-08-01: static assets, not R2, at this scale (§5).
2. **The build-slowness objection is not true here, measured.** Rendering
   every report we have today costs **192 ms**. Rendering 25 reports at
   today's average size would cost **roughly 1–2 seconds**. "Very slow" is
   the right fear for a build that runs a bundler, a bitmap pipeline, and JS
   compilation per page; this build runs `markdown-it` over text. Numbers in
   §2.
3. **The theme-change objection dissolves rather than needing a workaround.**
   `assets/styles.css` is already a separate file linked with `<link
   rel="stylesheet">` — it was never inlined into a page. A theme change
   touches one file, today and under every option below. Pre-rendering whole
   pages (not just fragments) costs nothing extra here. §3.
4. **The emergency and the architecture are two different problems.**
   Rendering `jack-smith-vol1` costs 15–64 ms; the Workers **Free plan's CPU
   budget is 10 ms per request**, the **Paid plan's is 30 s by default**. If
   this account is on Free, upgrading ($5/month) makes today's 503s stop
   happening tonight, independent of anything else in this document. Check
   which plan the account is on before anything else — it's a five-minute
   fix that the architecture work would take days to deliver. §1.
5. **R2 was worth taking seriously, and the answer is still no, not yet** —
   for the reason the Aug 1 doc already gave for raw markdown, which
   transfers unchanged to pre-rendered HTML: static assets' free-tier ceiling
   is ~1,000 reports at this project's section count, we have four, and R2
   trades away the "one deploy = one coherent, rollback-able site version"
   property for a decoupling benefit this project doesn't need yet. §5.

---

## 1. The emergency, separated from the architecture question

Measured (Node, this machine — Workers reported 15–47 ms for the same report,
so treat these as a floor, not the actual isolate cost):

```
$ pnpm exec tsx measure.mjs
challenger-accident:      md=824KB  render=41.1ms  split=9.2ms
jack-smith-vol1:          md=393KB  render=15.1ms  split=4.0ms
litvinenko-inquiry:       md=783KB  render=31.6ms  split=7.7ms
us-psi-financial-crisis:  md=2008KB render=64.5ms  split=19.2ms
```

Every single report, even the smallest, costs more CPU than a **Free plan**
request is allowed (10 ms). On **Paid**, the default per-request budget is
30 s (max 5 min) — three orders of magnitude of headroom over the worst
number measured. [Confirmed against Cloudflare's current limits page,
2026-08-21.]

This means: if the account is on the Free plan, the 503s are not really an
architecture problem, they're a plan problem, and the isolate-memo + edge-cache
mitigation already in `main` is working around a constraint that ten dollars
a month removes outright. **Check the plan before scheduling the rest of this
work.** It doesn't change what to build next (the bundle-size ceiling in the
Aug 1 doc is real regardless, and `/sitemap.xml`'s all-reports-per-request
cost is a real design smell regardless of CPU budget) — it changes whether
tonight's fire needs anything more than a billing change.

---

## 2. The build-slowness objection, answered with numbers

Rufus's fear, stated precisely: "pre-rendering makes the build process very
slow... we might as well be moving to a static site."

**Rendering everything we have today:**

```
$ pnpm exec tsx measure.mjs
TOTAL (4 reports): render=152.3ms split=40.1ms combined=192.3ms
md=4007KB html=6234KB
```

192 ms, for the whole corpus, cold (no warm-cache credit taken — each report
timed after a throwaway warm-up render of *itself*, not of the others).

**Where this comes from:** `markdown-it` over plain text and a couple of
regex passes to split sections. No image processing, no JS bundling per page,
no second templating pass — this project's "build" is one function call per
report. Cost scales with markdown bytes, not report count: **≈0.048 ms per
KB** of source markdown, measured across four reports ranging 393 KB–2 MB.

**Extrapolated to 25 reports** (this project's stated ceiling from the Aug 1
doc, at today's average report size of ~1 MB): 25 MB × 0.048 ms/KB ≈
**1.2 seconds**. Double it for headroom on a slower CI box and larger future
reports and it's still under 10 seconds. That is not what "very slow" means —
it's the kind of number you don't notice in a deploy that already takes ~1 s
to bundle and upload (measured below).

**The actual deploy pipeline, today, unchanged by this proposal:**

```
$ time pnpm wrangler deploy --dry-run --outdir=/tmp/rtm-dryrun
Total Upload: 4647.54 KiB / gzip: 1427.89 KiB
real  1.043s
```

Wrangler already bundles and diffs assets in about a second for the current
site. Adding a pre-render step in front of it adds the ~200 ms–2 s above —
it does not replace a fast pipeline with a slow one, it inserts a fast step
into a fast pipeline.

**Incremental rebuild is not fiddly — it's already handled, one layer down.**
Cloudflare Workers Static Assets upload by content hash: "unmodified files
will not be returned... if they have recently been uploaded in previous
versions of your Worker" (confirmed against Cloudflare's docs, 2026-08-21).
That means the build does **not** need report-level change detection to get
incremental deploys — re-render everything on every build (it's ~1 second,
per above), and let the uploader skip whatever didn't change. This is
actually a strict improvement over what happens today: reports are currently
bundled as a single text-module inside the Worker *script*, which re-uploads
in full on every deploy because a script is one indivisible bundle, not a set
of diffable files. Splitting reports into per-section static files makes
deploys cheaper than they are now, not more expensive.

---

## 3. The theme-change objection, checked against this codebase

Rufus's fear: pre-rendered HTML means a CSS change forces re-rendering every
page.

It doesn't, and not because of a workaround — because of something already
true here. `src/templates/layout.ts:63`:

```html
<link rel="stylesheet" href="/assets/styles.css" />
```

Every page links the stylesheet; none inlines it. This has been true since
the design system landed and is unrelated to #107. A theme change edits one
file, uploads one file (by content hash, per §2), and every page — pre-rendered
or not — picks it up on the next request, because the browser, not the
server, applies CSS.

This also settles the fragment-vs-whole-page question the issue raised as a
possible way to *dissolve* the objection: it's moot, because the objection
was never really about HTML structure. **Pre-render whole pages**, byte-for-
byte what `renderReport`/`renderSection` produce today. It's simpler than
maintaining an edge-side-includes shell, and costs nothing extra: the
nav/footer markup is a few hundred bytes duplicated across files, negligible
against files that run 10–85 KB.

The one real cost a *markup* change (not a CSS change) carries — new section
HTML structure, a new class name in a template — is identical under every
architecture on the table, including what's live today: `src/templates/*`
are TypeScript, so any change to them is a code change, which means a
`wrangler deploy` either way. Pre-rendering adds ~1–2 s of render time inside
a deploy that was happening regardless. There's no version of this project
where a template change ships without a deploy.

---

## 4. What actually needs request time

Working through every route in `src/index.ts`:

| Route | Needs request time? | Why |
| --- | --- | --- |
| `/`, `/reports`, `/about`, `/changelog`, `/highlights` | No | No `markdown-it` call; static content or client-hydrated (`/highlights` reads `localStorage`) |
| `/reports/:id` | No, *usually* | Contents page. Dynamic only via `?p=` (routes a paragraph link to its section) — a redirect, not a render |
| `/reports/:id/full`, `/reports/:id/:section` | No, *usually* | Static HTML, **except** when `?p=`/`?h=` name a passage — the OG description has to quote it |
| `/reports/:id/full?p=…`, `/…/:section?p=…&h=…` | Yes, but cheap | `extractParagraph` over already-rendered HTML — **0.1–1.0 ms measured**, not `markdown-it`. See below |
| `/sitemap.xml` | Currently yes, shouldn't be | Renders all four reports in one request today — the one route that can't be cached its way out of the problem (§6) |
| `/robots.txt`, `/health` | Trivial | No content dependency |
| `old.*`, legacy-path redirects, `www.` redirect, renamed-report redirect | Yes | Routing logic / cross-origin fetch |
| search (#100) | Yes | D1/FTS5 query, inherently request-time |
| social proof (#96) | Yes | Per-reader state |

**The quote-preview cost, measured** — `extractParagraph` against a rendered
section's HTML, not the whole report:

```
$ pnpm exec tsx measure-quote.mjs
us-psi-financial-crisis (2970KB html, 2448 paragraphs):
  extractParagraph(mid)  = 0.461ms
  extractParagraph(late) = 0.970ms
```

That's against the *whole 3 MB report* — worst case, and still ~50–100×
cheaper than the 64 ms `markdown-it` render it currently rides alongside. Run
against one section's HTML (what the new architecture would actually do,
since sections are already split at build time) it's smaller again. This
comfortably fits inside the Free plan's 10 ms budget on a stone-cold isolate,
no caching required.

**This is why options 1 and 3 in the issue are the same architecture.** Once
the dynamic set is this short, and everything in it costs sub-millisecond to
low-millisecond CPU, there's no meaningful difference between "pre-render
everything, Worker handles the rest" and "static site, Worker handles the
rest" — they describe the same deployed system. The only axis left is
storage.

---

## 5. Storage: static assets vs R2, revisited for pre-rendered HTML

The Aug 1 doc (§4) already ran this analysis for raw markdown bundled into
the script; it transfers to pre-rendered HTML in static assets essentially
unchanged, and R2's numbers (checked fresh today) don't move the conclusion:

| | Static assets | R2 |
| --- | --- | --- |
| File/object limit | 20k free / 100k paid, 25 MiB each | effectively unbounded |
| At 17 files/report (Aug 1 measurement) | **~1,000 reports** on the free tier alone | irrelevant at our scale |
| Storage cost at our scale (~10 MB total today, tens of MB at 25 reports) | free | free (10 GB-month free tier) — also irrelevant at our scale |
| Read cost | edge-cached automatically, no binding call needed unless `run_worker_first` forces the Worker to run first (it does here, for routing) | `env.R2_BUCKET.get()` — a binding call, comparable latency to `ASSETS.fetch()`, no CPU saved or lost vs static assets |
| Deploy coupling | uploaded with the Worker, atomic, versioned together | **decoupled** — content can update without a Worker deploy |
| Rollback | a Worker rollback rolls back content too | a Worker rollback does **not** roll back R2 content |

The one thing R2 offers that static assets don't — publishing new or
re-ingested content **without** a deploy — is the thing to be careful about
wanting. This project's whole proposition is that a citation resolves to the
same text forever (Aug 1 doc §6, permalink stability). Decoupling content
from deploys means a bad re-ingest can reach production with no deploy to
roll back, and no atomic "this version of the site serves this version of
every report" guarantee. To get that guarantee back over R2 you'd need
content-addressed keys and a version pointer the registry pins — at which
point publishing a new version *is* effectively a deploy again, just a
homemade one, with none of Wrangler's rollback tooling behind it.

**Recommendation unchanged from Aug 1: static assets now, R2 revisited if and
when the file count or the "publish without a deploy" workflow actually
becomes something the project wants** — not preemptively. Keep the storage
lookup behind one small module (already implied by `src/lib/source.ts`'s
`loadReportMarkdown` shape) so swapping it later is a one-file change, per
the Aug 1 doc.

---

## 6. `/sitemap.xml` specifically

This is the route the issue is right to call out as unfixable by caching:
it renders **all four reports in one request**, so no isolate-level memo
(good for one report at a time) and no edge cache (first request always
pays full price) can make a cold hit cheap. Today it survives only because
one attempt succeeded and got cached — a coin flip, not a fix, and it gets
worse every time a report is added.

Fix: generate section slugs at build time into `src/generated/`, the same
place `cards.ts` already does this for share cards (`src/templates/card.ts`
+ `scripts/cards.mjs` pattern). `/sitemap.xml` then either becomes a fully
static XML file (simplest: it changes only when the report set changes,
which is exactly when a build runs) or, if it must stay a route for
`origin`-relative URLs, a lookup over pre-computed slugs with zero
`markdown-it` calls. Either way the render cost drops from "all four
reports, every cold hit" to zero.

Worth doing this one first and separately, as the issue suggests — it's the
one place where caching cannot paper over the shape of the problem, and it's
a small, self-contained change against `src/generated/cards.ts` as precedent.

---

## 7. Recommendation, in order

1. **Check the Workers plan on this account.** If Free, upgrade to Paid
   ($5/month). This alone stops tonight's class of 503 — every measured
   render (15–64 ms) already fits inside Paid's default 30 s budget with
   three orders of magnitude to spare. Doesn't replace the rest of this
   list; removes the fire while it's being done properly.
2. **Fix `/sitemap.xml` first, on its own** (§6) — generate section slugs at
   build time, same pattern as `cards.ts`. It's the one route caching cannot
   fix, and it's small.
3. **Pre-render report pages (whole pages, not fragments) to static assets
   at build/deploy time.** Keep the Worker for: quote-preview OG rewriting
   on `?p=`/`?h=` (§4, sub-millisecond), search (#100), redirects, and the
   `old.` archive proxy. This is "pre-render" and "static site" at once —
   stop treating them as competing options (§4).
4. **Static assets, not R2, for where the rendered files live** (§5).
   Revisit only if the file count approaches the ~1,000-report ceiling, or
   if the project actually wants publish-without-deploy — neither is true
   now.
5. **Add the cold-`/full` assertion to `verify.sh`.** Once report pages come
   from static assets, "cold" mostly stops being a meaningful risk for the
   base page (there's no render on that path to be cold about) — but keep
   the check as a regression guard against this class of bug recurring, and
   extend it to hit `?p=`/`?h=` with a cache-busting query string so the
   dynamic quote-preview path is actually exercised cold, not served from
   the `cached()` wrapper's exact-URL cache.

Steps 2 and 3 are the ones worth doing as one piece of work — splitting them
would mean shipping the sitemap fix against code that's about to be
restructured underneath it anyway. Step 1 is independent and should happen
today regardless of when the rest lands.

---

## 8. What it costs to be wrong

- **If step 1 is skipped and the account is on Free:** the mitigations in
  `main` keep working most of the time, exactly as they do now, until the
  next deploy flushes the cache or a fourth report pushes render time up
  further. Cheap to reverse — upgrading later loses nothing.
- **If pre-rendering is skipped and only caching is hardened:** the bundle
  ceiling in the Aug 1 doc (~20–25 reports, still true, confirmed against
  current Cloudflare limits) still arrives, and `/sitemap.xml` remains
  structurally unfixable by caching (§6) regardless of how good the cache
  gets elsewhere. This is the option that looks cheapest today and compounds
  worst.
- **If R2 is adopted now instead of static assets:** no functional loss at
  this scale, but the atomic-deploy/rollback guarantee (§5) has to be
  rebuilt by hand if the project later wants it back — better to not give it
  up before there's a reason to.
- **If static assets are kept and the project later needs R2:** a one-module
  change, per the Aug 1 doc's original argument — this is the reversible
  direction, which is the argument for defaulting to it.

---

## 9. Open questions for Rufus

- **Confirm the Workers plan** (§1) — five minutes, decides whether tonight
  needs anything beyond this document.
- **Is `/sitemap.xml` worth shipping as its own PR ahead of the rest** (§6),
  given it's the one route that's actually broken by design rather than by
  budget? I'd say yes.
- Same open questions as the Aug 1 doc, still unresolved and not blocking
  this work: report-repo granularity, and whether `/full` or the split page
  is canonical.
