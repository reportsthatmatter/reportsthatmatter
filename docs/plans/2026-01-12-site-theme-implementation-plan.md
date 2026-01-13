# Site Theme + Homepage Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the `site/index.html` design as the shared theme, add a reports list section to the homepage, and serve assets from `/assets`.

**Architecture:** A Tailwind CDN-powered layout in `renderLayout`, a home template that mirrors `site/index.html` and appends a registry-driven reports section, and a report template that reuses the theme with a reading layout. Static assets moved to top-level `assets/` and served via `/assets/*`.

**Tech Stack:** Hono, Tailwind CDN, TypeScript

---

### Task 1: Move assets and wire static serving

**Files:**
- Move: `site/assets/*` → `assets/*`
- Modify: `src/index.ts`
- Modify: `wrangler.toml`
- Test: `tests/routes.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("assets", () => {
  it("serves static assets", async () => {
    const res = await app.request("http://localhost/assets/images/senate-screenshot-2.png");
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL (404)

**Step 3: Write minimal implementation**

- Move `site/assets` to top-level `assets/`
- Add Hono static middleware route for `/assets/*`
- Configure Wrangler assets binding to serve `assets` directory

**Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add assets src/index.ts wrangler.toml tests/routes.test.ts

git commit -m "Serve site assets from /assets"
```

---

### Task 2: Shared Tailwind-based layout

**Files:**
- Modify: `src/templates/layout.ts`
- Modify: `src/templates/index.ts`
- Modify: `src/templates/report.ts`
- Test: `tests/routes.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("layout", () => {
  it("includes Tailwind CDN and theme scaffold", async () => {
    const res = await app.request("http://localhost/");
    const body = await res.text();
    expect(body).toContain("https://cdn.tailwindcss.com");
    expect(body).toContain("Reports that Matter");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL (missing Tailwind CDN)

**Step 3: Write minimal implementation**

- Add Tailwind CDN script and Google Fonts to `renderLayout`
- Add background ribbon + gridlines layers and a shared header/nav
- Wrap content in a main container

**Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/templates/layout.ts src/templates/index.ts src/templates/report.ts tests/routes.test.ts

git commit -m "Apply Tailwind theme layout"
```

---

### Task 3: Home page template from site/index.html

**Files:**
- Modify: `src/templates/index.ts`
- Modify: `src/index.ts`
- Test: `tests/routes.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("home", () => {
  it("links hero CTA to reports section", async () => {
    const res = await app.request("http://localhost/");
    const body = await res.text();
    expect(body).toContain("#reports");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL (CTA not wired)

**Step 3: Write minimal implementation**

- Port `site/index.html` structure into `renderIndex`
- Keep imagery paths under `/assets/...`
- Add a bottom `Reports` section with cards from registry
- Wire CTA button to `#reports`

**Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/templates/index.ts src/index.ts tests/routes.test.ts

git commit -m "Render themed homepage with report cards"
```

---

### Task 4: Report page themed reading layout

**Files:**
- Modify: `src/templates/report.ts`
- Modify: `src/templates/layout.ts`
- Test: `tests/routes.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("report page", () => {
  it("uses themed reading container", async () => {
    const res = await app.request(
      "http://localhost/reports/us-senate-wall-street-and-financial-crisis"
    );
    const body = await res.text();
    expect(body).toContain("max-w-3xl");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL (missing container class)

**Step 3: Write minimal implementation**

- Wrap markdown output in a themed reading container
- Add tailwind classes for heading and paragraph spacing

**Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/templates/report.ts src/templates/layout.ts tests/routes.test.ts

git commit -m "Theme report pages"
```

---

## Local Dev Commands

- `pnpm install`
- `pnpm test`
- `pnpm wrangler dev --local`
