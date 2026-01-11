# Reset to Hono Worker: Design

Date: 2025-12-20

## Goals

- Reset repository to a minimal Cloudflare Workers app using Hono.
- Serve local HTML and Markdown with a shared header/footer layout.
- Mount external GitHub repos under subpaths and render Markdown with the same layout.
- Rewrite links in remote Markdown so relative and root-absolute URLs resolve under the mount.
- Provide local dev and deploy instructions.

## Non-Goals (for v1)

- Edge caching or KV storage.
- Authentication or private repos.
- Search, indexing, or structured metadata extraction.

## Architecture Overview

A Hono-based Worker serves local pages and a mounted-remote router. A mount config maps subpaths (e.g., `/psi-financial-crisis`) to GitHub repos and optional base paths. For each request, the router:

- Resolves the mount by first path segment.
- Maps `/` to `index.md` and extensionless paths to `<path>.md`.
- Passes through assets with extensions (e.g., `.png`, `.pdf`).
- Fetches raw content from GitHub via `raw.githubusercontent.com`.
- Renders Markdown through `remark`/`rehype` and wraps it with a layout.

## Routing and Path Mapping

Mount config (example):

- `/psi-financial-crisis` -> `reportsthatmatter/us-psi-financial-crisis`
- `/climate-action-us-senate-2014` -> `reportsthatmatter/climate-action-us-senate-2014`

Path mapping rules:

- `/mount/` -> `<basePath>/index.md`
- `/mount/about` -> `<basePath>/about.md`
- `/mount/dir/page` -> `<basePath>/dir/page.md`
- `/mount/assets/logo.png` -> `<basePath>/assets/logo.png`

## Markdown Rendering and Layout

Markdown is rendered using a `remark` + `rehype` pipeline (GFM enabled). The resulting HTML is inserted into a shared layout (header/footer) using Hono’s HTML helpers. Local Markdown uses the same renderer.

## Link Rewriting

After rendering, rewrite `href` and `src` attributes in HTML output:

- Relative links are resolved against the current document path, then prefixed with the mount path.
- Root-absolute links (e.g., `/images/x.png`) are rewritten to `/<mount>/images/x.png`.
- External URLs (scheme present) are left unchanged.

## Error Handling

- Remote 404 -> render a site-styled 404 page.
- Fetch or rendering errors -> render a site-styled 500/502 page and log the raw URL.
- If a URL cannot be parsed for rewriting, leave it as-is.

## Local Development

Use Wrangler for local dev:

- `npm install`
- `npm run dev`
- Visit:
  - `/` for the local home page
  - `/psi-financial-crisis/`
  - `/climate-action-us-senate-2014/`

## Deployment

- `npm run deploy` uses `wrangler deploy`.
- Cloudflare dashboard routes can map a custom domain to the worker.

## Open Questions

- Confirm default branches for sample repos (`main` vs `master`).
- Decide on a favicon/logo for the rebuilt front page.
