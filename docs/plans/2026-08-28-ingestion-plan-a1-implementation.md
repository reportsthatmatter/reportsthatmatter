# Ingestion Plan A1 — recipes, a real fidelity gate, and corpus regression

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every report's build reproducible from a recorded recipe, turn the ingestion fidelity gate from a tautology into a real check, and give the pipeline a corpus regression signal — so a heuristic change's blast radius is measured rather than guessed.

**Architecture:** A per-report `ingest.yaml` records the exact inputs (ordered, checksummed PDFs) and metadata that produced `full.md`. The CLI reads it instead of taking argv flags, which lets `ingest verify` find the real source PDFs and compare against them for the first time. A `baseline.json` digest per report, checked in `verify.sh`, then makes any change to any report's output visible in one command.

**Tech Stack:** TypeScript, `tsx`, vitest, `yaml` (already a dependency), `pdftotext` (poppler 26.08.0), `node:crypto` for checksums.

**Spec:** [`docs/plans/2026-08-28-ingestion-architecture.md`](2026-08-28-ingestion-architecture.md) — stages 0–1 of §9, plus the republish that §1.7 makes necessary.

**Scope note:** The architecture doc's §9 Plan A covers stages 0–3. That is two subsystems, so it is split. **This plan (A1) is stages 0–1 plus the republish**: recipes, a working fidelity gate, and a regression signal. **Plan A2** takes stages 2–3 — provenance through the pipeline, then extracting the core library with its per-report `ingest.ts` and passes API — and is written once A1 lands, because the pass boundaries are much better informed by then and because A2 needs A1's baselines to prove it changes no output.

## Global Constraints

- **Never weaken a fidelity check to make a report pass.** If a report cannot meet the gate, mark it `ingested: false` in `reports/registry.yaml` and record why.
- **Fixes go in the pipeline, never in generated `reports/*/full.md`.** No hand-editing of generated markdown at any point in this plan.
- **Tasks 1–7 must not change any report's output.** Task 8 is the only task that changes published text, deliberately and under review.
- **Paragraph ids are the product.** They derive from a paragraph's opening words. Never make them positional; `verify.sh` fails if `p-1`-style ids reappear.
- Poppler version for every baseline in this plan: **26.08.0**. Record it; do not upgrade during the plan.
- `./scripts/verify.sh` must exit 0 before any commit that touches `scripts/ingest/`.
- Work on `main` is permitted for this plan (Rufus, 2026-08-28). Commit after every task.
- ANSI colour codes below are written `\x1b[32m` where `cli.ts` currently holds a raw escape byte. Prefer the escape sequence in new code.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/ingest/recipe.ts` | **create** — the `Recipe` type, loading/validating `ingest.yaml`, resolving and checksumming volume paths |
| `scripts/ingest/baseline.ts` | **create** — computing a `Baseline` digest from an `IngestResult`, and diffing two digests |
| `scripts/ingest/cli.ts` | **modify** — `run` takes an id and reads the recipe; `verify` uses real sources; add `baseline` and `check` |
| `scripts/ingest/fidelity.ts` | **modify** — refuse to check a document against itself |
| `reports/<id>/ingest.yaml` | **create** ×5 — the build recipe |
| `reports/<id>/baseline.json` | **create** ×5 — the regression digest |
| `tests/ingest-recipe.test.ts` | **create** — recipe loading and validation |
| `tests/ingest-baseline.test.ts` | **create** — digest computation and diffing |
| `tests/fixtures/pages/*.txt` | **create** — real extracted pages, the golden fixtures |
| `scripts/verify.sh` | **modify** — run `ingest check` |

`recipe.ts` and `baseline.ts` are separate files because they change for different reasons: one tracks the shape of a report's inputs, the other what we measure about its outputs. `cli.ts` stays the only file that touches the filesystem for reports.

---

### Task 1: The recipe type and loader

**Files:**
- Create: `scripts/ingest/recipe.ts`
- Create: `tests/ingest-recipe.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Volume = { path: string; sha256?: string }`
  - `type Recipe = { id: string; title: string; authors?: string; published_at?: string; source_url?: string; repo: string; volumes: Volume[] }`
  - `function parseRecipe(yamlText: string, expectedId: string): Recipe` — throws `Error` on invalid input
  - `function resolveVolume(recipe: Recipe, volume: Volume, rootDir: string): string` — absolute path to the PDF

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingest-recipe.test.ts
import { describe, expect, it } from "vitest";
import { parseRecipe, resolveVolume } from "../scripts/ingest/recipe";

const LEVESON = `
id: uk-leveson-inquiry
title: "An Inquiry into the Culture, Practices and Ethics of the Press"
authors: "The Right Honourable Lord Justice Leveson"
published_at: "29 November 2012"
source_url: "https://example.invalid/leveson"
repo: ../uk-leveson-inquiry
volumes:
  - path: archive/0780_i.pdf
    sha256: aa11
  - path: archive/0780_ii.pdf
    sha256: bb22
`;

describe("parseRecipe", () => {
  it("reads metadata and volumes in order", () => {
    const recipe = parseRecipe(LEVESON, "uk-leveson-inquiry");
    expect(recipe.title).toBe(
      "An Inquiry into the Culture, Practices and Ethics of the Press"
    );
    expect(recipe.volumes.map((v) => v.path)).toEqual([
      "archive/0780_i.pdf",
      "archive/0780_ii.pdf",
    ]);
  });

  it("rejects a recipe whose id does not match the directory it came from", () => {
    // A copy-pasted recipe silently ingesting the wrong PDFs is the exact
    // failure this guards; the id is the one field we can cross-check.
    expect(() => parseRecipe(LEVESON, "challenger-accident")).toThrow(/id/i);
  });

  it("rejects a recipe with no volumes", () => {
    expect(() =>
      parseRecipe("id: x\ntitle: X\nrepo: ../x\nvolumes: []", "x")
    ).toThrow(/volume/i);
  });

  it("rejects a volume path that escapes the report repo", () => {
    const evil = "id: x\ntitle: X\nrepo: ../x\nvolumes:\n  - path: ../../etc/passwd\n";
    expect(() => parseRecipe(evil, "x")).toThrow(/path/i);
  });

  it("resolves a volume against the repo, not the site root", () => {
    const recipe = parseRecipe(LEVESON, "uk-leveson-inquiry");
    expect(resolveVolume(recipe, recipe.volumes[0], "/site")).toBe(
      "/uk-leveson-inquiry/archive/0780_i.pdf"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ingest-recipe.test.ts`
Expected: FAIL — `Failed to resolve import "../scripts/ingest/recipe"`

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/ingest/recipe.ts
import { isAbsolute, join, normalize, resolve } from "node:path";
import { parse } from "yaml";

export type Volume = { path: string; sha256?: string };

export type Recipe = {
  id: string;
  title: string;
  authors?: string;
  published_at?: string;
  source_url?: string;
  /** Where the source lives, relative to the site repo root. */
  repo: string;
  /**
   * Ordered, and the order is semantic: footnote numbering and page indices
   * run continuously across volumes, so reordering changes the output.
   */
  volumes: Volume[];
};

/**
 * Parses and validates a report's build recipe.
 *
 * `expectedId` is the directory the file was read from. Cross-checking it
 * against the recipe's own `id` catches the copy-paste that would otherwise
 * ingest one report's PDFs under another report's name.
 */
export function parseRecipe(yamlText: string, expectedId: string): Recipe {
  const raw = parse(yamlText) as Partial<Recipe> | null;
  if (!raw || typeof raw !== "object") throw new Error("recipe is empty");

  if (!raw.id) throw new Error("recipe has no id");
  if (raw.id !== expectedId) {
    throw new Error(`recipe id "${raw.id}" does not match directory "${expectedId}"`);
  }
  if (!raw.title) throw new Error(`${expectedId}: recipe has no title`);
  if (!raw.repo) throw new Error(`${expectedId}: recipe has no repo`);

  const volumes = raw.volumes ?? [];
  if (!volumes.length) throw new Error(`${expectedId}: recipe lists no volumes`);

  for (const volume of volumes) {
    if (!volume?.path) throw new Error(`${expectedId}: a volume has no path`);
    if (isAbsolute(volume.path) || normalize(volume.path).startsWith("..")) {
      throw new Error(
        `${expectedId}: volume path "${volume.path}" escapes the report repo`
      );
    }
  }

  return { ...(raw as Recipe), volumes };
}

/** Absolute path to a volume's PDF, resolved against the report repo. */
export function resolveVolume(recipe: Recipe, volume: Volume, rootDir: string): string {
  return resolve(join(rootDir, recipe.repo, volume.path));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ingest-recipe.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/recipe.ts tests/ingest-recipe.test.ts
git commit -m "feat(ingest): a report's build recipe, parsed and validated"
```

---

### Task 2: Checksum verification

**Files:**
- Modify: `scripts/ingest/recipe.ts`
- Modify: `tests/ingest-recipe.test.ts`

**Interfaces:**
- Consumes: `Recipe`, `Volume`, `resolveVolume` from Task 1.
- Produces:
  - `function fileChecksum(path: string): string` — sha256 hex
  - `function checkVolume(recipe: Recipe, volume: Volume, rootDir: string): { path: string; sha256: string; matched: boolean | null }` — `matched` is `null` when the recipe records no checksum yet

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingest-recipe.test.ts — append
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkVolume, fileChecksum } from "../scripts/ingest/recipe";

describe("checkVolume", () => {
  const root = mkdtempSync(join(tmpdir(), "rtm-recipe-"));
  mkdirSync(join(root, "repo/archive"), { recursive: true });
  writeFileSync(join(root, "repo/archive/a.pdf"), "hello");
  const sha = fileChecksum(join(root, "repo/archive/a.pdf"));

  const recipe = parseRecipe(
    `id: x\ntitle: X\nrepo: repo\nvolumes:\n  - path: archive/a.pdf\n    sha256: ${sha}\n`,
    "x"
  );

  it("matches a correct checksum", () => {
    expect(checkVolume(recipe, recipe.volumes[0], root).matched).toBe(true);
  });

  it("reports a mismatch rather than throwing", () => {
    const wrong = parseRecipe(
      "id: x\ntitle: X\nrepo: repo\nvolumes:\n  - path: archive/a.pdf\n    sha256: deadbeef\n",
      "x"
    );
    expect(checkVolume(wrong, wrong.volumes[0], root).matched).toBe(false);
  });

  it("returns null when the recipe records no checksum", () => {
    const none = parseRecipe(
      "id: x\ntitle: X\nrepo: repo\nvolumes:\n  - path: archive/a.pdf\n",
      "x"
    );
    expect(checkVolume(none, none.volumes[0], root).matched).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ingest-recipe.test.ts`
Expected: FAIL — `checkVolume` is not exported

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/ingest/recipe.ts — append
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function fileChecksum(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Compares a volume against the checksum the recipe records.
 *
 * Returns a result rather than throwing: the caller decides whether a mismatch
 * is fatal (ingesting) or a warning (reporting). `matched` is null when the
 * recipe has no checksum to compare against yet.
 */
export function checkVolume(
  recipe: Recipe,
  volume: Volume,
  rootDir: string
): { path: string; sha256: string; matched: boolean | null } {
  const path = resolveVolume(recipe, volume, rootDir);
  const sha256 = fileChecksum(path);
  return { path, sha256, matched: volume.sha256 ? volume.sha256 === sha256 : null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ingest-recipe.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/recipe.ts tests/ingest-recipe.test.ts
git commit -m "feat(ingest): checksum a recipe's source volumes"
```

---

### Task 3: `ingest run <id>` reads the recipe

**Files:**
- Modify: `scripts/ingest/cli.ts:42-108` (`runIngest`)
- Modify: `tests/ingest-recipe.test.ts`

**Interfaces:**
- Consumes: `parseRecipe`, `checkVolume`, `resolveVolume` from Tasks 1–2; `ingestPageGroups` and `extractPages` unchanged.
- Produces: `pnpm ingest run <id>`, with no argv metadata flags. Exit 1 on a missing recipe or a checksum mismatch. A `writeReport(id, title, result): number` helper, reused by Task 8.

This replaces the flag interface rather than keeping both. Two ways to invoke the same thing is how a recipe drifts from what was actually run, which is the defect being fixed.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingest-recipe.test.ts — append
import { execFileSync } from "node:child_process";

describe("ingest run", () => {
  it("fails with a clear message when the report has no recipe", () => {
    let output = "";
    try {
      execFileSync("npx", ["tsx", "scripts/ingest/cli.ts", "run", "no-such-report"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error: any) {
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
    expect(output).toMatch(/no-such-report/);
    expect(output).toMatch(/ingest\.yaml/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ingest-recipe.test.ts -t "no recipe"`
Expected: FAIL — the CLI reports `No PDF given`, which does not mention `ingest.yaml`

- [ ] **Step 3: Write minimal implementation**

Replace `runIngest` in `scripts/ingest/cli.ts`:

```ts
function runIngest(argv: string[]): number {
  const id = argv[0];
  if (!id || id.startsWith("--")) {
    console.error("Usage: pnpm ingest run <report-id>");
    return 1;
  }

  const recipePath = join(REPORTS, id, "ingest.yaml");
  if (!existsSync(recipePath)) {
    console.error(`No recipe for ${id}: expected ${join("reports", id, "ingest.yaml")}`);
    return 1;
  }

  let recipe;
  try {
    recipe = parseRecipe(readFileSync(recipePath, "utf8"), id);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const pageGroups: Page[][] = [];
  for (const volume of recipe.volumes) {
    const check = checkVolume(recipe, volume, ROOT);
    if (check.matched === false) {
      console.error(
        `Checksum mismatch for ${volume.path}\n` +
          `  recipe:  ${volume.sha256}\n` +
          `  on disk: ${check.sha256}\n` +
          "The source changed, or the recipe is wrong. Do not ingest until this is resolved."
      );
      return 1;
    }
    if (check.matched === null) console.log(`  (no checksum recorded for ${volume.path})`);
    console.log(`Extracting ${volume.path} …`);
    pageGroups.push(extractPages(check.path));
  }

  const result = ingestPageGroups(pageGroups, {
    title: recipe.title,
    authors: recipe.authors,
    published_at: recipe.published_at,
    source_url: recipe.source_url,
  });

  return writeReport(id, recipe.title, result);
}
```

Move the existing write-and-report block (`cli.ts:78-107`) verbatim into a `writeReport(id: string, title: string, result: IngestResult): number` helper, so Task 8 can reuse it. Add to the imports:

```ts
import { parseRecipe, checkVolume, resolveVolume } from "./recipe";
import type { IngestResult } from "./pipeline";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ingest-recipe.test.ts -t "no recipe"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/cli.ts tests/ingest-recipe.test.ts
git commit -m "feat(ingest): run a report from its recorded recipe, not argv flags"
```

---

### Task 4: Write the five recipes, and prove they reproduce

**Files:**
- Create: `reports/jack-smith-vol1/ingest.yaml`
- Create: `reports/us-psi-financial-crisis/ingest.yaml`
- Create: `reports/challenger-accident/ingest.yaml`
- Create: `reports/litvinenko-inquiry/ingest.yaml`
- Create: `reports/uk-leveson-inquiry/ingest.yaml`

**Interfaces:**
- Consumes: the `Recipe` shape from Task 1.
- Produces: five recipes. Every later task depends on these existing.

Metadata is copied verbatim from `reports/registry.yaml`. It must match exactly, or the front matter changes and every downstream artifact churns.

- [ ] **Step 1: Write the recipes**

```yaml
# reports/uk-leveson-inquiry/ingest.yaml
id: uk-leveson-inquiry
title: "An Inquiry into the Culture, Practices and Ethics of the Press"
authors: "The Right Honourable Lord Justice Leveson"
published_at: "29 November 2012"
source_url: "https://webarchive.nationalarchives.gov.uk/20140122145147/http://www.official-documents.gov.uk/document/hc1213/hc07/0780/0780.asp"
repo: ../uk-leveson-inquiry
# Order is semantic: footnote numbers and page indices run continuously across
# the four volumes. Reordering changes the output.
volumes:
  - path: archive/0780_i.pdf
  - path: archive/0780_ii.pdf
  - path: archive/0780_iii.pdf
  - path: archive/0780_iv.pdf
```

```yaml
# reports/jack-smith-vol1/ingest.yaml
id: jack-smith-vol1
title: "Report of Special Counsel Jack Smith, Volume One: The Election Case"
authors: "Jack Smith, Special Counsel, U.S. Department of Justice"
published_at: "January 2025"
source_url: "https://www.justice.gov/storage/Report-of-Special-Counsel-Smith-Volume-1-January-2025.pdf"
repo: ../jack-smith-report
volumes:
  - path: archive/Report-of-Special-Counsel-Smith-Volume-1-January-2025.pdf
```

```yaml
# reports/us-psi-financial-crisis/ingest.yaml
id: us-psi-financial-crisis
title: "Wall Street and the Financial Crisis: Anatomy of a Financial Collapse"
authors: "U.S. Senate Permanent Subcommittee on Investigations"
published_at: "13 April 2011"
source_url: "https://www.hsgac.senate.gov/subcommittees/investigations/reports?c=112"
repo: ../us-psi-financial-crisis
# The four hearing transcripts in this repo's archive/ are not part of the
# report and are deliberately not listed.
volumes:
  - path: "archive/PSI REPORT - Wall Street & the Financial Crisis-Anatomy of a Financial Collapse (FINAL 5-10-11).pdf"
```

```yaml
# reports/challenger-accident/ingest.yaml
id: challenger-accident
title: "Investigation of the Challenger Accident"
authors: "Committee on Science and Technology, U.S. House of Representatives"
published_at: "October 1986"
source_url: "https://www.govinfo.gov/app/details/GPO-CRPT-99hrpt1016"
repo: ../challenger-accident
volumes:
  - path: archive/GPO-CRPT-99hrpt1016-challenger-accident-1986.pdf
```

```yaml
# reports/litvinenko-inquiry/ingest.yaml
id: litvinenko-inquiry
title: "The Litvinenko Inquiry"
authors: "Sir Robert Owen (Chairman)"
published_at: "21 January 2016"
source_url: "https://www.gov.uk/government/uploads/system/uploads/attachment_data/file/493860/The-Litvinenko-Inquiry-H-C-695-web.pdf"
repo: ../uk-litvinenko-inquiry
volumes:
  - path: archive/The-Litvinenko-Inquiry-H-C-695-web.pdf
```

- [ ] **Step 2: Fill in the checksums**

```bash
for id in jack-smith-vol1 us-psi-financial-crisis challenger-accident litvinenko-inquiry uk-leveson-inquiry; do
  echo "== $id"
  npx tsx -e "
    import {parseRecipe,checkVolume} from './scripts/ingest/recipe';
    import {readFileSync} from 'node:fs';
    const r = parseRecipe(readFileSync('reports/$id/ingest.yaml','utf8'), '$id');
    for (const v of r.volumes) console.log('  ' + v.path + '\n    sha256: ' + checkVolume(r, v, '.').sha256);
  "
done
```

Paste each `sha256` under its volume's `path`.

- [ ] **Step 3: Verify the recipes reproduce**

Regenerate each report and confirm it matches what the *current code* produces — which for four of five is **not** what is committed (spec §1.7). Keep the regenerations; Task 8 reviews them.

```bash
mkdir -p /tmp/rtm-pending
for id in jack-smith-vol1 us-psi-financial-crisis challenger-accident litvinenko-inquiry uk-leveson-inquiry; do
  cp reports/$id/full.md /tmp/rtm-pending/$id.published.md
  pnpm ingest run $id
  cp reports/$id/full.md /tmp/rtm-pending/$id.regenerated.md
  git checkout -- reports/$id/full.md reports/$id/fidelity.md
  printf '%-26s %s hunks pending\n' "$id" \
    "$(diff /tmp/rtm-pending/$id.published.md /tmp/rtm-pending/$id.regenerated.md | grep -c '^[0-9]')"
done
```

Expected on poppler 26.08.0: `uk-leveson-inquiry` **0 hunks** — that is the acceptance criterion, because it proves the recipe reproduces a known-good build. The other four are expected non-zero (roughly 104, 39, 37, 3) and are Task 8's subject, not a failure here.

If Leveson is non-zero, the recipe is wrong — most likely volume order, or a metadata field that does not match `registry.yaml` character for character. Fix the recipe, never the markdown.

- [ ] **Step 4: Commit**

```bash
git add reports/*/ingest.yaml
git commit -m "feat(ingest): record how each report is built

Which PDFs, in what order, with what metadata — until now recorded nowhere,
so no report could be regenerated by anyone who was not there the first time."
```

---

### Task 5: Make `ingest verify` a real gate

**Files:**
- Modify: `scripts/ingest/fidelity.ts` — `runChecks`
- Modify: `scripts/ingest/cli.ts:110-156` — `runVerify`
- Modify: `tests/ingest.test.ts` — the existing `describe("fidelity")` block at line 332

**Interfaces:**
- Consumes: `parseRecipe`, `resolveVolume` from Tasks 1–2.
- Produces: `runChecks` throws when handed a source identical to the markdown; `verify` sources PDFs from the recipe.

Spec §1.1: today every report falls to `runChecks(markdown, markdown)` and reports exactly 100.0% retention. Two changes — make that impossible by accident, and give `verify` the real source.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingest.test.ts — add inside describe("fidelity")
it("refuses to check a document against itself", () => {
  // Comparing markdown to itself makes the lossless and retention checks
  // tautologies that report 100% for any input. Every report did this
  // until #118, because none had a source PDF to compare against.
  const markdown = "---\ntitle: x\n---\n\nSome body text.\n";
  expect(() => runChecks(markdown, markdown)).toThrow(/against itself/i);
});
```

Add `runChecks` to the existing `../scripts/ingest/fidelity` import at `tests/ingest.test.ts:15`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ingest.test.ts -t "against itself"`
Expected: FAIL — no error thrown

- [ ] **Step 3: Write minimal implementation**

In `scripts/ingest/fidelity.ts`, replace `runChecks`:

```ts
/**
 * Layers 1-3 together.
 *
 * `sourceText` must be the text extracted from the source PDF. Passing the
 * markdown itself makes layers 2 and 3 tautologies that report 100% for any
 * input — which is exactly what `ingest verify` silently did for every report
 * until #118, because no report had a `source.pdf` to compare against.
 */
export function runChecks(sourceText: string, markdown: string): Check[] {
  if (sourceText === markdown) {
    throw new Error(
      "runChecks was given the markdown as its own source: layers 2 and 3 " +
        "would be tautologies. Pass the extracted source text, or call " +
        "structuralChecks() and say that is all you are checking."
    );
  }
  return [
    ...structuralChecks(markdown),
    losslessCheck(sourceText, markdown),
    retentionCheck(sourceText, markdown),
  ];
}
```

In `scripts/ingest/cli.ts`, replace the per-target body of `runVerify` so the source comes from the recipe, and a missing source is reported rather than skipped:

```ts
for (const target of targets) {
  if (!target.ingested) {
    console.log(`\n${target.id}`);
    console.log("  \x1b[33m–\x1b[0m not produced by the pipeline; fidelity gate skipped");
    continue;
  }

  const markdownPath = join(ROOT, target.sourcePath);
  if (!existsSync(markdownPath)) {
    console.error(`missing markdown: ${target.sourcePath}`);
    allOk = false;
    continue;
  }
  const markdown = readFileSync(markdownPath, "utf8");

  const recipePath = join(REPORTS, target.id, "ingest.yaml");
  if (!existsSync(recipePath)) {
    console.log(`\n${target.id}`);
    console.error("  \x1b[31m✗\x1b[0m no ingest.yaml — cannot verify against the source");
    allOk = false;
    continue;
  }

  const recipe = parseRecipe(readFileSync(recipePath, "utf8"), target.id);
  const missing = recipe.volumes
    .map((volume) => resolveVolume(recipe, volume, ROOT))
    .filter((path) => !existsSync(path));
  if (missing.length) {
    console.log(`\n${target.id}`);
    console.error(`  \x1b[31m✗\x1b[0m source unavailable: ${missing[0]}`);
    console.error(`      clone ${recipe.repo} alongside this repo, then re-run`);
    allOk = false;
    continue;
  }

  const sourceText = recipe.volumes
    .map((volume) =>
      extractPages(resolveVolume(recipe, volume, ROOT))
        .map((page) => page.lines.join("\n"))
        .join("\n")
    )
    .join("\n");

  allOk = reportChecks(target.id, runChecks(sourceText, markdown)) && allOk;
}
```

- [ ] **Step 4: Run the tests and the real gate**

Run: `npx vitest run tests/ingest.test.ts`
Expected: PASS

Run: `pnpm ingest verify`
Expected: **real** retention figures — roughly 99% per report — not 100.0% for every report. Every check green.

Four reports' `full.md` is stale at this point (spec §1.7, fixed in Task 8), so this compares slightly old markdown against current source. That is expected to pass: the pending changes rejoin paragraphs rather than add or remove words, and both checks are word-level. If one does fail, that is evidence about the pending diff and belongs in Task 8's review.

If a report fails a check it previously "passed", that is the gate working. Do not weaken the check: record what failed and stop.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/cli.ts scripts/ingest/fidelity.ts tests/ingest.test.ts
git commit -m "fix(ingest): verify against the real source, not the file itself

No report had a source.pdf, so verify fell to runChecks(markdown, markdown):
the lossless and retention layers compared each file to itself and reported
exactly 100.0%. They have never actually run in verify.sh."
```

---

### Task 6: Baseline digests, and `ingest check`

**Files:**
- Create: `scripts/ingest/baseline.ts`
- Create: `tests/ingest-baseline.test.ts`
- Modify: `scripts/ingest/cli.ts` — add `baseline` and `check`
- Create: `reports/<id>/baseline.json` ×5
- Modify: `scripts/verify.sh` — after the existing "Ingestion fidelity" step

**Interfaces:**
- Consumes: `IngestResult` from `pipeline.ts`; `parseRecipe`, `resolveVolume`.
- Produces:
  - `type Baseline = { markdownSha: string; words: number; blocks: Record<string, number>; headings: string[]; footnotes: number; pageMarkers: number; poppler: string }`
  - `function computeBaseline(result: IngestResult, poppler: string): Baseline`
  - `function diffBaselines(before: Baseline, after: Baseline): string[]` — human-readable lines, empty when identical

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingest-baseline.test.ts
import { describe, expect, it } from "vitest";
import { computeBaseline, diffBaselines } from "../scripts/ingest/baseline";

const result = (markdown: string) => ({
  markdown,
  sourceText: "",
  footnotes: [{ number: 1, text: "note", page: 1 }],
  suspects: [],
  autoFixes: 0,
  pages: 3,
});

const DOC = `---
title: "x"
---

## A Heading

Body text here.

%%page 12%%

> A quotation.

- an item
`;

describe("computeBaseline", () => {
  it("counts the structure a heuristic change would move", () => {
    const baseline = computeBaseline(result(DOC), "26.08.0");
    expect(baseline.headings).toEqual(["A Heading"]);
    expect(baseline.pageMarkers).toBe(1);
    expect(baseline.blocks.quote).toBe(1);
    expect(baseline.blocks.list).toBe(1);
    expect(baseline.poppler).toBe("26.08.0");
  });

  it("changes its markdownSha when the text changes", () => {
    const a = computeBaseline(result(DOC), "26.08.0");
    const b = computeBaseline(result(DOC.replace("Body", "Bodies")), "26.08.0");
    expect(a.markdownSha).not.toBe(b.markdownSha);
  });
});

describe("diffBaselines", () => {
  it("is empty for identical baselines", () => {
    const a = computeBaseline(result(DOC), "26.08.0");
    expect(diffBaselines(a, a)).toEqual([]);
  });

  it("names a heading that disappeared", () => {
    const a = computeBaseline(result(DOC), "26.08.0");
    const b = computeBaseline(result(DOC.replace("## A Heading", "A Heading")), "26.08.0");
    expect(diffBaselines(a, b).join("\n")).toMatch(/A Heading/);
  });

  it("reports a poppler change, because that is tool drift not a code change", () => {
    const a = computeBaseline(result(DOC), "26.08.0");
    const b = computeBaseline(result(DOC), "25.01.0");
    expect(diffBaselines(a, b).join("\n")).toMatch(/poppler/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ingest-baseline.test.ts`
Expected: FAIL — `Failed to resolve import "../scripts/ingest/baseline"`

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/ingest/baseline.ts
import { createHash } from "node:crypto";
import type { IngestResult } from "./pipeline";

/**
 * A digest of one report's output.
 *
 * Small enough to commit and read in a diff, detailed enough that any
 * heuristic change which moves a report's structure moves the digest. This is
 * the corpus regression signal the pipeline had none of: `AGENTS.md` asks that
 * every heuristic be tested against the messiest source in the corpus, and
 * until now that was a human instruction rather than a check.
 */
export type Baseline = {
  markdownSha: string;
  words: number;
  blocks: Record<string, number>;
  headings: string[];
  footnotes: number;
  pageMarkers: number;
  poppler: string;
};

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function computeBaseline(result: IngestResult, poppler: string): Baseline {
  const body = result.markdown.replace(FRONT_MATTER, "");
  const lines = body.split("\n");

  const headings = lines
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, "").trim());

  const blocks: Record<string, number> = {
    heading: headings.length,
    quote: lines.filter((line) => /^>\s/.test(line)).length,
    list: lines.filter((line) => /^(>\s)?-\s/.test(line)).length,
    paragraph: lines.filter(
      (line) => line.trim() && !/^([#>\-]|%%page|\[\^)/.test(line.trim())
    ).length,
  };

  return {
    markdownSha: createHash("sha256").update(result.markdown).digest("hex"),
    words: body.split(/\s+/).filter(Boolean).length,
    blocks,
    headings,
    footnotes: result.footnotes.length,
    pageMarkers: lines.filter((line) => /^%%page \d+%%$/.test(line.trim())).length,
    poppler,
  };
}

/** Human-readable differences, most structural first. Empty when identical. */
export function diffBaselines(before: Baseline, after: Baseline): string[] {
  const out: string[] = [];

  if (before.poppler !== after.poppler) {
    out.push(
      `poppler ${before.poppler} → ${after.poppler} — tool drift, not a code ` +
        "change; regenerate the before side with the same version before " +
        "reading any diff"
    );
  }

  for (const kind of Object.keys({ ...before.blocks, ...after.blocks })) {
    const a = before.blocks[kind] ?? 0;
    const b = after.blocks[kind] ?? 0;
    if (a !== b) out.push(`${kind}: ${a} → ${b} (${b > a ? "+" : ""}${b - a})`);
  }

  for (const field of ["words", "footnotes", "pageMarkers"] as const) {
    if (before[field] !== after[field]) {
      out.push(`${field}: ${before[field]} → ${after[field]}`);
    }
  }

  const gone = before.headings.filter((h) => !after.headings.includes(h));
  const added = after.headings.filter((h) => !before.headings.includes(h));
  for (const heading of gone.slice(0, 10)) out.push(`heading removed: ${heading}`);
  for (const heading of added.slice(0, 10)) out.push(`heading added:   ${heading}`);
  if (gone.length > 10) out.push(`… and ${gone.length - 10} more headings removed`);
  if (added.length > 10) out.push(`… and ${added.length - 10} more headings added`);

  if (!out.length && before.markdownSha !== after.markdownSha) {
    out.push("text changed, but no structural counts moved — read the diff");
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ingest-baseline.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Add the `baseline` and `check` commands**

In `scripts/ingest/cli.ts`, add `readdirSync` to the `node:fs` import, `writeFileSync` if not already there, and:

```ts
import { execFileSync } from "node:child_process";
import { computeBaseline, diffBaselines, type Baseline } from "./baseline";

function popplerVersion(): string {
  const out = execFileSync("pdftotext", ["-v"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return /pdftotext version (\S+)/.exec(out)?.[1] ?? "unknown";
}

/** Regenerates a report from its recipe, in memory, writing nothing. */
function regenerate(id: string): IngestResult {
  const recipe = parseRecipe(readFileSync(join(REPORTS, id, "ingest.yaml"), "utf8"), id);
  const pageGroups = recipe.volumes.map((volume) =>
    extractPages(resolveVolume(recipe, volume, ROOT))
  );
  return ingestPageGroups(pageGroups, {
    title: recipe.title,
    authors: recipe.authors,
    published_at: recipe.published_at,
    source_url: recipe.source_url,
  });
}

function recipeIds(): string[] {
  return readdirSync(REPORTS, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(REPORTS, entry.name, "ingest.yaml"))
    )
    .map((entry) => entry.name)
    .sort();
}

function runBaseline(argv: string[]): number {
  const poppler = popplerVersion();
  for (const id of argv.length ? argv : recipeIds()) {
    const baseline = computeBaseline(regenerate(id), poppler);
    writeFileSync(
      join(REPORTS, id, "baseline.json"),
      `${JSON.stringify(baseline, null, 2)}\n`,
      "utf8"
    );
    console.log(`  wrote reports/${id}/baseline.json`);
  }
  return 0;
}

function runCheck(argv: string[]): number {
  const poppler = popplerVersion();
  let ok = true;
  for (const id of argv.length ? argv : recipeIds()) {
    const path = join(REPORTS, id, "baseline.json");
    if (!existsSync(path)) {
      console.error(
        `  \x1b[31m✗\x1b[0m ${id}: no baseline.json — run \`pnpm ingest baseline ${id}\``
      );
      ok = false;
      continue;
    }
    const before = JSON.parse(readFileSync(path, "utf8")) as Baseline;
    const differences = diffBaselines(before, computeBaseline(regenerate(id), poppler));
    if (!differences.length) {
      console.log(`  \x1b[32m✓\x1b[0m ${id}`);
      continue;
    }
    ok = false;
    console.error(`  \x1b[31m✗\x1b[0m ${id} — output moved:`);
    for (const line of differences) console.error(`      ${line}`);
  }
  if (!ok) {
    console.error(
      "\nA change that moves a report's output must land with an updated\n" +
        "baseline in the same commit. Read the diff first, then:\n" +
        "  pnpm ingest baseline <id>"
    );
  }
  return ok ? 0 : 1;
}
```

Add both to the command switch at `cli.ts:158-165`:

```ts
else if (command === "baseline") code = runBaseline(rest);
else if (command === "check") code = runCheck(rest);
```

- [ ] **Step 6: Record the baselines and wire into `verify.sh`**

```bash
pnpm ingest baseline
pnpm ingest check    # must print ✓ for all five
```

In `scripts/verify.sh`, after the existing "Ingestion fidelity" step:

```bash
step "Ingestion regression"
if pnpm ingest check >/tmp/rtm-ingest-check.log 2>&1; then
  pass "every report matches its baseline"
else
  fail "report output moved without a baseline update"
  tail -30 /tmp/rtm-ingest-check.log
fi
```

- [ ] **Step 7: Run the full check and commit**

Run: `./scripts/verify.sh`
Expected: exit 0

```bash
git add scripts/ingest/baseline.ts scripts/ingest/cli.ts scripts/verify.sh \
        tests/ingest-baseline.test.ts reports/*/baseline.json
git commit -m "feat(ingest): corpus regression baselines

A heuristic change that moves any report's output now fails verify.sh unless
the baseline moves with it. The Leveson fix changed three other reports
silently; this is what would have caught it."
```

---

### Task 7: Golden page fixtures

**Files:**
- Create: `tests/fixtures/pages/*.txt` (6 files)
- Create: `tests/fixtures/pages/README.md`
- Modify: `tests/ingest.test.ts` — one new `describe` block

**Interfaces:**
- Consumes: `toBlocks` from `paragraphs.ts` (already imported at `tests/ingest.test.ts:3`).
- Produces: fixtures that move to the core library in Plan A2 (stage 3).

Unit tests use synthetic input, and all 1,015 lines of them passed while the Leveson defect shipped (spec §1.5). These are real pages, chosen for being hard.

- [ ] **Step 1: Extract the fixture pages**

```bash
mkdir -p tests/fixtures/pages
extract() { # <name> <pdf> <page>
  pdftotext -layout -enc UTF-8 -f "$3" -l "$3" "$2" "tests/fixtures/pages/$1.txt"
}
extract leveson-running-header  ../uk-leveson-inquiry/archive/0780_i.pdf 120
extract leveson-numbered-para   ../uk-leveson-inquiry/archive/0780_ii.pdf 240
extract psi-stacked-footnote    "../us-psi-financial-crisis/archive/PSI REPORT - Wall Street & the Financial Crisis-Anatomy of a Financial Collapse (FINAL 5-10-11).pdf" 92
extract psi-quoted-bullets      "../us-psi-financial-crisis/archive/PSI REPORT - Wall Street & the Financial Crisis-Anatomy of a Financial Collapse (FINAL 5-10-11).pdf" 148
extract challenger-ocr-noise    ../challenger-accident/archive/GPO-CRPT-99hrpt1016-challenger-accident-1986.pdf 214
extract jack-smith-inline-notes ../jack-smith-report/archive/Report-of-Special-Counsel-Smith-Volume-1-January-2025.pdf 40
```

Open each file. If a page does not exhibit the feature its name claims, pick a neighbouring page until it does — a fixture that does not contain the hard case is worse than none, because it passes for the wrong reason. Record what each is for in `tests/fixtures/pages/README.md`, one line each, naming the PDF and page it came from.

- [ ] **Step 2: Write the test**

```ts
// tests/ingest.test.ts — append
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("golden page fixtures", () => {
  const dir = join(import.meta.dirname, "fixtures/pages");
  const names = readdirSync(dir).filter((file) => file.endsWith(".txt"));

  const words = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

  it("has fixtures to check", () => {
    expect(names.length).toBeGreaterThanOrEqual(6);
  });

  for (const name of names) {
    it(`${name}: parses without losing or inventing text`, () => {
      const lines = readFileSync(join(dir, name), "utf8").split("\n");
      const blocks = toBlocks(lines);

      const output = blocks.flatMap((block) =>
        block.kind === "list"
          ? block.items.flatMap(words)
          : block.kind === "page"
            ? []
            : words(block.text)
      );
      const source = new Set(words(lines.join(" ")));

      const foreign = output.filter((word) => !source.has(word));
      expect(foreign, `invented: ${foreign.slice(0, 5).join(", ")}`).toHaveLength(0);

      // A page that parses to almost nothing is a silent total loss.
      expect(output.length).toBeGreaterThan(20);
    });
  }
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/ingest.test.ts -t "golden page"`
Expected: PASS for every fixture

A failure here is a real parser defect, not a bad fixture — investigate before adjusting anything.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/pages tests/ingest.test.ts
git commit -m "test(ingest): golden fixtures from real pages

Every synthetic unit test passed while the Leveson defect shipped. These are
the hard pages, one or two from each report in the corpus."
```

---

### Task 8: Review and republish the four stale reports

**Files:**
- Modify: `reports/{jack-smith-vol1,us-psi-financial-crisis,challenger-accident,litvinenko-inquiry}/full.md` — regenerated, never hand-edited
- Modify: the matching `fidelity.md` and `baseline.json`
- Modify: `docs/share-quotes.yaml` if `pnpm cards` reports moved ids

**Interfaces:**
- Consumes: everything above, including `writeReport` from Task 3.
- Produces: published text matching what the pipeline currently produces.

Spec §1.7: four reports are stale, and the pending diffs are improvements — paragraphs correctly rejoined across page breaks, truncated headings resolving back into the list items they always were. `AGENTS.md` is explicit that republishing is its own reviewed decision, which is why this is its own task.

**One report per commit. Do not batch.**

- [ ] **Step 1: Regenerate and read the diff, one report at a time**

```bash
id=litvinenko-inquiry     # start with the smallest diff (3 hunks)
cp reports/$id/full.md /tmp/before-$id.md
pnpm ingest run $id
diff /tmp/before-$id.md reports/$id/full.md | less
```

- [ ] **Step 2: Classify every hunk**

For each, decide: improvement, regression, or lateral. For anything not clearly an improvement, open the source page and check which reading matches the document — that question cannot be answered from the diff alone. Expected classes, from the spec's measurements:

- a paragraph rejoined across a page break — improvement
- a truncated `###` heading becoming the numbered list item it always was — improvement
- footnote count rising (jack-smith: 296 → 301) — improvement; spot-check that five of the new notes resolve

If any hunk is a regression, **stop**: `git checkout -- reports/$id/`, and fix the pipeline instead.

- [ ] **Step 3: Re-baseline, verify, and commit that one report**

```bash
pnpm ingest baseline $id
./scripts/verify.sh          # must exit 0
git add reports/$id/
git commit -m "fix($id): republish under the current pipeline"
```

Put one line per class of change, with counts, in the commit body.

- [ ] **Step 4: Repeat for the remaining three**

Ascending order of diff size: `us-psi-financial-crisis` (39 hunks), `challenger-accident` (37), `jack-smith-vol1` (104).

- [ ] **Step 5: Re-resolve share cards and the search index**

Paragraph ids move whenever ingestion changes, so the share-card `match:` phrases must be re-resolved (`AGENTS.md`, Gotchas).

```bash
pnpm cards                   # reports moved ids; update docs/share-quotes.yaml
pnpm prerender
pnpm index-search
./scripts/verify.sh
```

- [ ] **Step 6: Commit**

```bash
git add docs/share-quotes.yaml assets/generated
git commit -m "chore: re-resolve share quotes and search index after republish"
```

---

## Done condition

```bash
./scripts/verify.sh          # exits 0
pnpm ingest verify           # real retention figures, not 100.0% everywhere
pnpm ingest check            # ✓ for all five reports
```

Then update `NEXT.md` and #118 with what landed, and open the Plan A2 issue for stage 3: core library extraction, per-report `ingest.ts`, and the passes API.
