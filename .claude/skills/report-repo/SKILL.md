---
name: report-repo
description: Use when creating or extending a report's own repository on Reports that Matter — caching the source PDFs and clean editions under archive/ and reference/, pinning SHA-256s, writing datapackage.json and the README's scope and materials, the ingest.ts volume list, and the site's manifest entry. Stage 2 of the preparation pipeline, after report-source.
---

# Stage 2: cache and prepare the repo

**Level:** `level:specced` (Sonnet). Rules for every agent: [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) (R1-R15).

Design: `docs/design/2026-10-03-report-preparation-pipeline.md` §2-3, worked example §9. The repo layout: `docs/report-preparation.md` §2 ("Set up"). References: `docs/scoring.md` ("Adding or rebuilding a reference"). Worktrees: agent protocol R1.

**Entry.** Stage 1's gate met: a source stack and scope decision in the unit's Bead.

## Procedure

1. **Repo.** New report: `gh repo create reportsthatmatter/<id> --public` (report repos are public; the repo name is the report id), clone as a sibling of the site repo, and push an initial commit on `main` (a README stub and a `.gitignore` of `node_modules/` and `.cache/`) so the work can go on a branch with a PR. Then add the site worktree's `reports/manifest.yaml` entry (step 7) first and run `pnpm ingest worktrees <id>`: `pnpm ingest run` refuses the shared checkout. Existing report: a branch in a worktree (you own it this session; leave the sibling on clean `main` when done).
2. **`archive/`**: every canonical file, named plainly; `shasum -a 256` each and compare with stage 1's record.
3. **`datapackage.json`**: one resource per file, with source URL, title and licence. Model: `../uk-saville-inquiry/datapackage.json`.
4. **`README.md`**: Scope (the decision and why), Source, and **Materials** (the source stack, the checklist answers, version notes). Model: `../us-duelfer-report/README.md`.
5. **`reference/`** where the stack has a structure or reference source: add or extend its entry in the site's `scripts/score/reference.py` `REFERENCES` (site PR), then `python3 scripts/score/reference.py fetch <id>` and `build <id>`. Decide `set:` now, before anyone reads the pipeline's errors on it: a new publisher family defaults to held-out (`reports/score-sets.yaml`).
6. **`ingest.ts`**: `id`, title, authors, `published_at`, `source_url`, `volumes` with `path` and `sha256`; passes come in stage 3. **`package.json`** pins the same `@rtm/ingest` as the site. `pnpm -C ../<repo> install`.
7. **Site worktree**: add `reports/manifest.yaml` (`id`, `dir: ../<repo>`). No registry entry yet (stage 4). Then `pnpm ingest preflight`.

## Exit gate

- [ ] `shasum -a 256 -c` passes for every file in `archive/` and `reference/raw/`
- [ ] `datapackage.json` lists each file with source URL and licence
- [ ] README has Scope and Materials
- [ ] `reference/manifest.json` built with checksums and `set` (where a reference exists)
- [ ] `ingest.ts` volumes match `archive/`; `package.json` pin equals the site's; `pnpm ingest preflight` clean
- [ ] Report-repo PR and site PR (manifest, `REFERENCES`) open; `reports/pipeline.yaml` row says `reached: repo`

**Hands on:** the two PRs. **Gaps:** `pnpm report new <id>` (scaffold) and `pnpm report lint <id>` (this gate as a command) do not exist yet (ifb5.11). Retro and lessons: agent protocol R13-R14.
