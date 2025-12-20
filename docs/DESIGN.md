# Reports that Matter v2 — MVP Brief

## 1. Purpose and Scope

Build a lightweight web application that renders official inquiry documents from Markdown and existing HTML sources into stable, public-facing web pages.

The system prioritizes:

* transparency
* longevity
* minimal frontend complexity
* auditable, content-first architecture

This is **not** a rich client-side web app; it is a document rendering and publishing service.

---

## 2. Core Use Case

* Source documents (official inquiries, reports, appendices) exist as:

  * Markdown files (primary)
  * Existing HTML pages (secondary)
* Sources are fetched from:

  * GitHub repositories (raw content)
  * Direct HTML URLs
* Documents are:

  * normalized
  * transformed
  * rendered into consistent HTML pages
  * served under stable URLs

---

## 3. Architectural Principles

* Server-side rendering only
* Minimal or zero client-side JavaScript
* Content is the source of truth (GitHub / URLs)
* Edge-first deployment
* Simple, inspectable pipeline

---

## 4. High-Level Architecture

```
Request
  → Edge Router
    → Fetch source document
      → Detect content type (Markdown / HTML)
        → Transform + sanitize
          → Render into HTML layout
            → Cache
              → Response
```

---

## 5. Technology Choices (MVP)

### Runtime

* Cloudflare Workers

### HTTP / Routing Layer

* Hono

Rationale:

* Lightweight, edge-native
* Explicit routing and middleware
* No frontend framework assumptions

---

## 6. Content Ingestion

### Markdown Sources

* Fetch raw `.md` files from GitHub (or equivalent)
* Parse Markdown to AST
* Convert to HTML

### HTML Sources

* Fetch existing HTML pages
* Parse and sanitize
* Normalize structure for re-wrapping

---

## 7. Content Processing Pipeline

### Markdown Processing

* Parse Markdown
* Apply transforms:

  * heading IDs
  * anchor links
  * optional table of contents
* Convert to HTML AST
* Serialize to HTML

### HTML Processing

* Parse HTML
* Strip unwanted tags/scripts
* Normalize headings and links
* Prepare for layout injection

---

## 8. Rendering

* Wrap processed content in a shared HTML layout:

  * header
  * footer
  * metadata (title, description)
* No client-side hydration
* Optional minimal CSS for readability and printability

---

## 9. Routing Model (MVP)

Example:

* `/inquiry/:slug`
* `/inquiry/:slug/:section`

Routing maps to:

* GitHub repo + path
* or external HTML source

Routing configuration can initially be static (config file).

---

## 10. Caching Strategy

* Use edge caching for rendered pages
* Cache key based on:

  * source URL
  * content hash (if available)
* Short TTL acceptable for MVP

---

## 11. Non-Goals (Explicitly Out of Scope for MVP)

* Rich client-side editing UI
* Authentication / user accounts
* Collaborative editing
* WYSIWYG editor
* CMS abstractions beyond GitHub

---

## 12. MVP Deliverables

* Deployed Workers service
* At least:

  * one Markdown-based inquiry
  * one HTML-based inquiry
* Stable public URLs
* Readable, consistent HTML output
* Clear repo structure and documentation

---

## 13. Follow-On (Post-MVP, Not in Spec)

* Editorial transforms
* Inline annotations / footnotes
* Version comparison
* PDF export
* Structured citations

---

## 14. AI-Agent Task Framing

The AI agent should:

* Elaborate each section into a detailed technical spec
* Propose concrete file structure
* Define interfaces between pipeline stages
* Produce minimal reference implementation examples
* Avoid introducing unnecessary frameworks or abstractions

---

If you want, I can next:

* convert this into a **prompt for a coding agent**
* draft a **minimal folder / file layout**
* or produce a **first-pass Hono + Workers skeleton**
