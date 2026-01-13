# Roadmap

Roadmap for MVP (1-2 weeks of effort)

**Engineering**: a single, fully-styled flagship report page. A user can read the report on any device, and use a desktop-first "highlight-to-share" feature to create a canonical link to a specific passage. This delivers on the core "Read → Share" user path and provides the first shareable asset.

**Marketing**: Our marketing MVP is to prove the core distribution loop. We will launch one flagship report as a public story, driving target users from a social media post directly to a specific, highlighted passage within the report. Success means validating that this user journey is compelling and can spark initial, measurable engagement with the primary source material.

## Plan (Marketing-Led)

### Chunk 1 (1-2h): Prepare the Flagship Story & Asset

**Goal:** Define the specific content and narrative for the first public launch.

- [ ] **Marketing Task:** Draft the short "why this matters" narrative for the flagship report (e.g., the US Senate Wall Street report), which will be used for the social media post.
- [ ] **Content Task:** Finalize the full Markdown for that same report, ensuring it's clean and ready for rendering.
- [ ] **Technical Task:** Add the report to the registry (`reports/registry.yaml`) to create its canonical URL.

### Chunk 2 (1-2h): Build the Polished "Landing Zone"

**Goal:** Ensure the destination for the marketing link is professional and visually consistent.

- [ ] **Tasks:** This is the core styling work. Refactor the design from `site/index.html` into a shared layout and apply it to the report renderer. The page must look complete.

### Chunk 3 (2-3h): Engineer the "Shareable Moment"

**Goal:** Create the "atomic unit of sharing" that makes the content go viral.

- [ ] **Tasks:** Implement the desktop highlight-to-share functionality. This feature directly serves the marketing goal by allowing the creation of deep links to compelling quotes, which can be used in the initial post and by subsequent readers.

### Chunk 4 (1h): Publish, Distribute, and Verify

**Goal:** Get the story circulating publicly and confirm it works.

- [ ] **Marketing Task:** Post the narrative on Twitter/X, linking directly to a highlighted quote within the live report page.
- [ ] **Technical Task:** Ensure the latest version of the site is deployed and the report URL is live and accessible.
- [ ] **Verification:** Manually click the link from the social post and verify the entire user journey works as expected.

## v1 (deprecated)

### Product / App (build foundations)

- [ ] **Report page primitive**
  - [ ] Define minimal HTML/Markdown schema (title, provenance, summary, sections, deep links).

- [ ] **Highlight & share spike**
  - [ ] Write UX sketch: text selection → share box → canonical snippet URL.
  - [ ] Decide anonymous-first vs login-gated (decision only).

- [ ] **Content ingestion path**
  - [ ] Decide canonical ingestion format (PDF → text → Markdown).
  - [ ] Select one report to ingest end-to-end as proof.

---

### Marketing / Narrative

- [ ] **Homepage content finalisation**
  - [ ] Freeze v1 homepage copy.
  - [ ] Identify 2–3 screenshots/diagrams to commission or reuse.

- [ ] **One flagship story**
  - [ ] Draft a short “why this matters” case using a single inquiry as narrative hook.
  - [ ] Prepare this as the anchor blog post.

---

### Distribution / Awareness

- [ ] **Primary channel decision**
  - [ ] Choose one initial channel (e.g. X or LinkedIn).
  - [ ] Set a simple cadence (e.g. 3 posts/week for two weeks).

- [ ] **Shareable artefact**
  - [ ] Define the atomic unit of sharing (quote card, paragraph permalink, stat).
  - [ ] Produce one manual example to validate the pattern.

---

### Operations / Focus

- **Definition of done (v1)**
  - One live homepage.
  - One fully usable report page.
  - One shareable story circulating publicly.
