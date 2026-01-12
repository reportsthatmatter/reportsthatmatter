# Report Rendering App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Hono-based runtime rendering app that serves `/reports` and `/reports/:id` using the YAML registry and local sample Markdown.

**Architecture:** A minimal Hono app with a registry loader, a markdown renderer that injects paragraph IDs, and simple HTML templates. Dev uses Node file reads; Workers will bundle registry and markdown for read-only access.

**Tech Stack:** Hono, TypeScript, Wrangler (Cloudflare), YAML parser, markdown-it, Vitest

---

### Task 1: Project scaffold and health route

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `src/index.ts`
- Create: `tests/health.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("health", () => {
  it("returns ok", async () => {
    const res = await app.request("http://localhost/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (module not found / app not defined)

**Step 3: Write minimal implementation**

```ts
import { Hono } from "hono";

export const app = new Hono();

app.get("/health", (c) => c.text("ok"));
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json tsconfig.json wrangler.toml src/index.ts tests/health.test.ts
git commit -m "Add Hono scaffold and health route"
```

---

### Task 2: Registry loader for YAML

**Files:**
- Create: `src/lib/registry.ts`
- Create: `tests/registry.test.ts`
- Modify: `src/index.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../src/lib/registry";

describe("registry", () => {
  it("loads reports from YAML", async () => {
    const registry = await loadRegistry();
    expect(registry.reports.length).toBeGreaterThan(0);
    expect(registry.reports[0].id).toBe("us-senate-wall-street-and-financial-crisis");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (loadRegistry not defined)

**Step 3: Write minimal implementation**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

export type ReportRegistry = {
  reports: Array<{
    id: string;
    title: string;
    authors?: string;
    published_at?: string;
    source_path: string;
    overview_path?: string;
  }>;
};

export async function loadRegistry(): Promise<ReportRegistry> {
  const filePath = path.join(process.cwd(), "reports/registry.yaml");
  const content = await fs.readFile(filePath, "utf8");
  return parse(content) as ReportRegistry;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/registry.ts tests/registry.test.ts src/index.ts
git commit -m "Add YAML registry loader"
```

---

### Task 3: Markdown rendering with paragraph IDs

**Files:**
- Create: `src/lib/markdown.ts`
- Create: `tests/markdown.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/lib/markdown";

describe("markdown", () => {
  it("injects sequential paragraph ids", () => {
    const html = renderMarkdown("One.\n\nTwo.");
    expect(html).toContain('id="p-1"');
    expect(html).toContain('id="p-2"');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (renderMarkdown not defined)

**Step 3: Write minimal implementation**

```ts
import MarkdownIt from "markdown-it";

export function renderMarkdown(markdown: string): string {
  let paragraphCount = 0;
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  const defaultParagraphOpen = md.renderer.rules.paragraph_open;

  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    paragraphCount += 1;
    tokens[idx].attrSet("id", `p-${paragraphCount}`);
    return defaultParagraphOpen
      ? defaultParagraphOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  return md.render(markdown);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/markdown.ts tests/markdown.test.ts
git commit -m "Render markdown with paragraph ids"
```

---

### Task 4: Report routes and HTML templates

**Files:**
- Create: `src/templates/layout.ts`
- Create: `src/templates/report.ts`
- Create: `src/templates/index.ts`
- Modify: `src/index.ts`
- Create: `tests/routes.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("routes", () => {
  it("renders report index", async () => {
    const res = await app.request("http://localhost/reports");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Reports");
  });

  it("renders report detail", async () => {
    const res = await app.request(
      "http://localhost/reports/us-senate-wall-street-and-financial-crisis"
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Wall Street and the Financial Crisis");
    expect(body).toContain("id=\"p-1\"");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (routes not implemented)

**Step 3: Write minimal implementation**

```ts
// src/templates/layout.ts
export function renderLayout(title: string, body: string): string {
  return `<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\" />\n<title>${title}</title>\n</head>\n<body>${body}</body>\n</html>`;
}

// src/templates/index.ts
import type { ReportRegistry } from "../lib/registry";
import { renderLayout } from "./layout";

export function renderIndex(registry: ReportRegistry): string {
  const items = registry.reports
    .map((report) => `<li><a href=\"/reports/${report.id}\">${report.title}</a></li>`)
    .join("\n");
  return renderLayout("Reports", `<h1>Reports</h1><ul>${items}</ul>`);
}

// src/templates/report.ts
import { renderLayout } from "./layout";

export function renderReport(title: string, html: string): string {
  return renderLayout(title, `<h1>${title}</h1>${html}`);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/templates/layout.ts src/templates/index.ts src/templates/report.ts src/index.ts tests/routes.test.ts
git commit -m "Add report index and detail routes"
```

---

### Task 5: Wire markdown source loading (local file)

**Files:**
- Modify: `src/lib/registry.ts`
- Modify: `src/index.ts`
- Create: `src/lib/source.ts`
- Create: `tests/source.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { loadReportMarkdown } from "../src/lib/source";

describe("source", () => {
  it("loads markdown from source_path", async () => {
    const markdown = await loadReportMarkdown(
      "reports/samples/us-senate-wall-street-and-financial-crisis/full.md"
    );
    expect(markdown).toContain("#");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (loadReportMarkdown not defined)

**Step 3: Write minimal implementation**

```ts
import fs from "node:fs/promises";

export async function loadReportMarkdown(sourcePath: string): Promise<string> {
  return fs.readFile(sourcePath, "utf8");
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/source.ts tests/source.test.ts src/lib/registry.ts src/index.ts
git commit -m "Load report markdown from local source"
```

---

## Local Dev Commands

- Install deps: `npm install`
- Run tests: `npm test`
- Dev server: `npx wrangler dev --local`

## Notes for Cloudflare Workers

- Bundle `reports/registry.yaml` and sample markdown into the Worker for initial deploy.
- Replace `loadRegistry`/`loadReportMarkdown` with a Workers-compatible loader (fetch or bundled assets) when moving to production.
