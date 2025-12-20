# Reset to Hono Worker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current Jekyll site with a minimal Hono Cloudflare Worker that serves local HTML/Markdown and mounts external GitHub repos under subpaths with link rewriting.

**Architecture:** A Hono worker routes local pages and mounted remote paths. Remote content is fetched from GitHub raw URLs. Markdown is rendered via remark/rehype and wrapped in a shared layout. Link rewriting ensures relative and root-absolute URLs resolve under the mount path.

**Tech Stack:** TypeScript, Hono (Cloudflare Workers), remark/rehype, Wrangler.

### Task 1: Inventory current repo and confirm submodules

**Files:**
- Inspect: `.gitmodules` (if present)
- Inspect: repo root content

**Step 1: List current files**

Run: `ls`
Expected: Jekyll-era files and folders

**Step 2: Check for submodules**

Run: `cat .gitmodules`
Expected: File exists and lists submodules, or error if none

**Step 3: Commit note (if .gitmodules exists)**

Run: `git status --short`
Expected: No changes at this point

### Task 2: Remove submodules and old site content (except docs/)

**Files:**
- Modify: `.gitmodules` (delete)
- Remove: all repo root files and directories except `docs/`

**Step 1: Deinit submodules (if any)**

Run: `git submodule deinit -f --all`
Expected: Submodules deinitialized

**Step 2: Remove submodule directories**

Run: `git rm -f <submodule-path>` for each submodule
Expected: Submodule directories removed

**Step 3: Remove old site files**

Run: `rg --files -g '!*docs/**'` to list files to remove
Expected: Files to delete listed (excluding docs)

Run: `git rm -r <each path>`, leaving `docs/` intact
Expected: Old files removed from index

**Step 4: Commit cleanup**

Run:
```
git add -A
git commit -m "chore: reset repo to docs-only"
```
Expected: Commit created with deletions

### Task 3: Scaffold Hono Worker project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `src/index.tsx`
- Create: `src/config.ts`
- Create: `src/templates.tsx`
- Create: `src/markdown.ts`
- Create: `src/github.ts`

**Step 1: Create package.json**

Content (example):
```json
{
  "name": "reportsthatmatter",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "remark": "^15.0.1",
    "remark-gfm": "^4.0.0",
    "remark-rehype": "^11.1.1",
    "rehype-stringify": "^10.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.0",
    "wrangler": "^3.90.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "WebWorker"],
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "strict": true
  }
}
```

**Step 3: Create wrangler.toml**

```toml
name = "reportsthatmatter"
main = "src/index.tsx"
compatibility_date = "2025-12-20"
```

**Step 4: Add sample mount config**

Create `src/config.ts` with two mounts:
- `/psi-financial-crisis` -> `reportsthatmatter/us-psi-financial-crisis`
- `/climate-action-us-senate-2014` -> `reportsthatmatter/climate-action-us-senate-2014`

Include `branch` (default `main`) and `basePath` (default empty string).

**Step 5: Commit scaffold**

Run:
```
git add package.json tsconfig.json wrangler.toml src

git commit -m "chore: scaffold Hono worker"
```
Expected: Commit created

### Task 4: Implement templates and markdown pipeline

**Files:**
- Create: `src/templates.tsx`
- Create: `src/markdown.ts`
- Test: `tests/markdown.test.ts`

**Step 1: Write failing tests for link rewriting**

Create `tests/markdown.test.ts` with test cases:
- Relative link `./img/a.png` in mount `/psi` -> `/psi/img/a.png`
- Root-absolute `/img/a.png` in mount `/psi` -> `/psi/img/a.png`
- External `https://example.com` unchanged

Run: `npm test`
Expected: FAIL because `rewriteLinks` not defined

**Step 2: Implement markdown renderer**

In `src/markdown.ts`:
- Build remark/rehype pipeline
- Export `renderMarkdown` and `rewriteLinks`
- Apply rewriting to HTML output

Run: `npm test`
Expected: PASS

**Step 3: Implement layout**

In `src/templates.tsx`:
- Export layout with header/footer
- Wrap rendered content

**Step 4: Commit markdown pipeline**

Run:
```
git add src/markdown.ts src/templates.tsx tests/markdown.test.ts

git commit -m "feat: add markdown rendering and link rewriting"
```
Expected: Commit created

### Task 5: Implement GitHub fetch helper

**Files:**
- Create: `src/github.ts`
- Test: `tests/github.test.ts`

**Step 1: Write failing test for URL mapping**

Test mapping for:
- `/mount/` -> `index.md`
- `/mount/about` -> `about.md`
- `/mount/assets/x.png` -> `assets/x.png`

Run: `npm test`
Expected: FAIL because mapping helper missing

**Step 2: Implement mapping function**

In `src/github.ts`:
- Build `resolveRemotePath` and `buildRawUrl`
- Export helper

Run: `npm test`
Expected: PASS

**Step 3: Commit GitHub helper**

Run:
```
git add src/github.ts tests/github.test.ts

git commit -m "feat: add GitHub raw URL helpers"
```
Expected: Commit created

### Task 6: Implement Hono routes

**Files:**
- Modify: `src/index.tsx`
- Create: `src/routes.ts`
- Create: `src/content/index.md` (local homepage markdown)

**Step 1: Implement local routes**

- Serve `/` via local markdown (index.md)
- Static routes for local assets (if any)

**Step 2: Implement mount router**

- Parse first path segment
- Resolve mount config
- Use GitHub helper to fetch remote content
- Render markdown or stream assets
- Handle 404/500 with layout

**Step 3: Manual smoke test**

Run: `npm install`
Run: `npm run dev`
Expected: Local server running; sample routes render

**Step 4: Commit routes**

Run:
```
git add src/index.tsx src/routes.ts src/content/index.md

git commit -m "feat: add local and remote routes"
```
Expected: Commit created

### Task 7: Update documentation

**Files:**
- Modify: `README.md`

**Step 1: Rewrite README**

Include:
- Local dev steps (`npm install`, `npm run dev`)
- Deployment (`npm run deploy`)
- Notes on mount config and sample repos

**Step 2: Commit docs**

Run:
```
git add README.md

git commit -m "docs: update README for Hono worker"
```
Expected: Commit created

### Task 8: Final verification

**Files:**
- None

**Step 1: Run tests**

Run: `npm test`
Expected: PASS

**Step 2: Run local dev briefly**

Run: `npm run dev`
Expected: Server starts without errors

**Step 3: Commit (if changes)**

Run:
```
git status --short
```
Expected: Clean
