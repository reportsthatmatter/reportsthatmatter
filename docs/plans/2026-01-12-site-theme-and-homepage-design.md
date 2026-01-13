# Site Theme + Homepage Integration Design

## Status

Approved for implementation.

## Goal

Apply the existing `site/index.html` visual design as the shared site theme and
wire it into the runtime app. The homepage should match the current design and
add a live reports listing at the bottom. Report pages should reuse the theme
while focusing on reading layout.

## Decisions

- Use Tailwind via CDN (no build step).
- Keep the existing home page structure and imagery.
- Add a Reports section at the bottom of the home page, populated from the
  registry.
- “Explore reports” button links to `#reports`.
- Apply the same header/footer theme to report detail pages, but skip the hero
  and marketing sections.
- Serve static assets from `/assets/*` after moving `site/assets` → `assets`.

## Homepage (/) Layout

Keep the existing sections from `site/index.html`:
- Hero with CTA
- Evidence section with screenshots
- Change section panels

Append a new `Reports` section:
- Tailwind card grid of reports
- Each card links to `/reports/:id`
- Title, author, year displayed

## Report Page (/reports/:id) Layout

- Shared header/nav and background styling
- Focused reading column (max-width, comfortable spacing)
- Markdown content rendered inside a themed container

## Styling Approach

- Tailwind via CDN in layout template
- Minimal custom CSS for:
  - Background ribbon and gridlines
  - Any base typography tweaks not covered by Tailwind utilities

## Static Assets

- Move `site/assets` to top-level `assets`
- Serve `/assets/*` via Hono static middleware in dev
- Use Wrangler assets in Workers

## Deferred

- Tailwind build pipeline
- CSS extraction into `/assets/app.css`
