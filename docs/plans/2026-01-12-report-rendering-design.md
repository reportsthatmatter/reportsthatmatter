# Report Rendering App Design (MVP)

## Status

Locked design for implementation.

## Goal

Build a runtime-rendered, read-only app that turns canonical Markdown reports into
readable web pages with stable paragraph-level permalinks. No AI extraction,
no server-side persistence.

## Non-Goals

- AI extraction or distribution pipeline
- Authentication or write operations
- Exact text highlight permalinks (deferred)
- Pagination or section-only rendering (deferred)
- Caching (deferred)

## Inputs and Outputs

Inputs:
- Canonical Markdown per report, stored in external GitHub repos
- Registry file committed in this repo

Outputs:
- `/reports` index page
- `/reports/:id` full report page with paragraph anchors

## Registry

Single committed registry file, authoritative for what the app can serve.

Minimum fields:
- `id`
- `title`
- `source_url` (raw GitHub URL to canonical Markdown)
- `repo`
- `published_at`

Optional fields (later):
- `slug`
- `description`
- `authors`

## Runtime Rendering Flow

1. Request `/reports/:id`
2. Load registry entry by `id`
3. Fetch Markdown from `source_url`
4. Parse Markdown into a structured document model
5. Assign stable IDs to sections and paragraphs
6. Render HTML with anchors and minimal JS

No caching for MVP; every request re-fetches and re-renders.

## ID Strategy

- Section IDs: slugified heading text with disambiguation suffix if repeated
- Paragraph IDs: sequential by document order (`p-1`, `p-2`, ...)

These are deterministic and stable as long as the canonical Markdown is stable.

## URL Structure

- `/reports` list page (from registry)
- `/reports/:id` full report, TOC at top

Paragraph permalinks:
- `/reports/:id#p-317`

## UI/UX

- Long-form reading layout with clear hierarchy and comfortable line length
- TOC at top for fast navigation
- Paragraph link affordance (clickable anchor)
- If a hash is present, apply a highlight class to the target paragraph

## Risks and Mitigations

- Large documents may be slow to fetch/render
  - Acceptable for MVP; add caching or pre-render later if needed
- Very long single-page reports could affect browser performance
  - If needed later, add section-level rendering without breaking anchor IDs

## Deferred Extensions

- Exact text highlighting (text fragments or paragraph+offset scheme)
- Caching (memory, file, or R2)
- Static export option
- Section-level rendering/pagination
