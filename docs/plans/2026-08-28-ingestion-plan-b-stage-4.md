# Plan B, stage 4 — moving each report's authority into its own repo

**Status:** ready to execute, one decision open (§1).
**Spec:** [`2026-08-28-ingestion-architecture.md`](2026-08-28-ingestion-architecture.md) D2 and §9 stage 4.
**Predecessors:** [A1](2026-08-28-ingestion-plan-a1-implementation.md) and [A2](2026-08-28-ingestion-plan-a2-implementation.md), both landed.

This is the last structural piece of the architecture. Everything else it
depends on exists: each report already has an `ingest.ts` that composes library
passes, a `corrections.yaml`, and a `baseline.json`. What remains is *where
those files live*.

D2, decided 2026-08-28: **the authoritative `full.md` lives in the report
repo; the site build is an aggregation.** The reason is contributor surface —
someone working on Leveson should open the Leveson repo and see everything
that produced its text, without needing the site.

## Why it was not done in the same pass as A2

It writes to five repositories that are not this one, each with its own
remote. That is not reversible with a `git checkout`, and it needs the
decision below settled first — so it is written down rather than done on the
way past.

## 1. The open decision: how a report repo imports the library

A report's `ingest.ts` does `import { pipeline, geometry } from "…"`. Once
that file lives in `../uk-leveson-inquiry/`, that import has to resolve.

| | How | Cost |
| --- | --- | --- |
| **A. Relative path** | `../reportsthatmatter/scripts/ingest` | Zero infrastructure, works today. Hardcodes the sibling layout `AGENTS.md` already assumes. Ugly, and breaks if the site repo is cloned under another name. |
| **B. Git dependency** (recommended) | `"@rtm/ingest": "github:reportsthatmatter/ingest#v0.1.0"` | Extract `scripts/ingest/` to its own repo. Exact pinning, no registry admin, and each report pins a version — which is what makes "improvements are adopted per report, on their own schedule" real rather than aspirational. Costs one more repo and a release step. |
| **C. npm publish** | `@rtm/ingest` on the registry | Everything B gives, plus public reuse. Registry admin and a publish step for a project that is one person plus agents. |

**B is the recommendation**, and it is the option the architecture argued for:
§5 says each report pins a core version so divergence is visible instead of
silent. A is a shortcut that quietly gives that up — with a relative path
every report always runs whatever the site repo has checked out, which is the
"improvements arrive unannounced" failure that started all this.

Not decided here because it is a real trade: B is more correct and costs a
repo plus a release cadence; A is free and defers the problem.

## 2. Target layout

```
uk-leveson-inquiry/                 reportsthatmatter/
  archive/*.pdf                       reports/manifest.yaml   ← id, repo, ref
  datapackage.json                    reports/<id>/full.md    ← aggregated copy
  ingest.ts        ← authority        src/, assets/, scripts/
  corrections.yaml
  baseline.json
  full.md          ← AUTHORITATIVE
  fidelity.md
```

`reports/manifest.yaml`:

```yaml
- id: uk-leveson-inquiry
  repo: ../uk-leveson-inquiry
  ref: v1.0.0
```

The site repo **keeps a committed copy** of each `full.md`. That is deliberate:
a cold clone must build and deploy without five sibling checkouts, and a given
site version must serve exactly one version of each report, forever.

## 3. Steps

- [ ] **Settle §1.** Everything else is mechanical once it is.
- [ ] `reports/manifest.yaml`, and a loader beside `volumes.ts`.
- [ ] `cli.ts`: resolve a report's directory through the manifest rather than
      assuming `reports/<id>/`. `ingest run` writes `full.md`, `fidelity.md`
      and `baseline.json` into the report repo.
- [ ] `pnpm ingest aggregate` — copy each report's `full.md` into
      `reports/<id>/full.md` here, and fail loudly if a report repo is missing
      rather than serving a stale copy silently.
- [ ] `verify.sh`: run `aggregate` before `prerender`, so a report edited in
      its own repo is reflected in the checks — the same reasoning that made
      `verify.sh` run `prerender` itself.
- [ ] Per report repo, one commit each: move `ingest.ts`, `corrections.yaml`,
      `baseline.json`, `full.md`, `fidelity.md` in; add a README section saying
      how to rebuild. **Do not push** until the whole set is green locally.
- [ ] `pnpm ingest check` ✓ on all five, `./scripts/verify.sh` exits 0.
- [ ] Update `AGENTS.md`: where a report's files live, and that `pnpm ingest
      run <id>` now writes to the report repo.

## 4. What this does not change

- Serving. The Worker reads `assets/generated/`, which `prerender` builds from
  the aggregated copies. No request-time dependency on any report repo.
- The library's API. Report definitions are already written against
  `scripts/ingest/index.ts`; only the import specifier changes.
- Any report's output. This is a relocation, and `pnpm ingest check` must stay
  green throughout.
