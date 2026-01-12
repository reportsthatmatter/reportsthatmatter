# Refined architecture: two parallel paths after Markdown canonical text

Below is a clearer separation of concerns, with explicit boundaries and two parallel but interlinked pipelines once **canonical Markdown** exists.

---

### 1. Boundary assumption (given)

**Canonical Content Store (out of scope here)**

* Input: reports already extracted to clean Markdown
* Properties:

  * stable text
  * section headings
  * paragraph breaks
* This is the *single source of truth*.

Everything below assumes this already exists.

---

### 2. Revised high-level system overview

```
                Canonical Markdown Reports
                         │
                         │
           ┌─────────────┴─────────────┐
           │                           │
           │                           │
   Web Rendering & Linking Path   AI Extraction & Distribution Path
           │                           │
           │                           │
   Linkable, navigable reports    Excerpts, summaries, social units
           │                           │
           └─────────────┬─────────────┘
                         │
                 Shared permalinks
               (paragraph-level URLs)
```

The **only hard coupling** between the two paths is the permalink layer.

---

### 3. Path A: web rendering & linking (infrastructure path)

This path is about *making reports usable on the web*.

#### Inputs

* Canonical Markdown report

#### Processing steps

* Parse Markdown into a structured document model:

  * report
  * sections
  * paragraphs
* Assign stable IDs:

  * section IDs (derived from headings)
  * paragraph IDs (deterministic hashes or counters)

#### Outputs

* HTML-rendered report pages with:

  * paragraph-level anchors
  * stable, permanent URLs
  * visible highlight state when linked

Example URL:

```
/reports/financial-crisis-inquiry#p-317
```

#### Responsibilities

* Deep linking
* Navigation
* SEO
* Human reading

This path does **not** depend on AI.

---

### 4. Path B: AI extraction & distribution (attention path)

This path is about *turning reports into distributable units*.

#### Inputs

* Canonical Markdown report
* Structural metadata from Path A (section + paragraph IDs)

#### AI tasks

* Identify candidate paragraphs:

  * key findings
  * quotable statements
  * summary-worthy sections
* Generate:

  * short annotations (1–3 sentences)
  * optional report-level summaries
  * optional tags or topics

Crucially:

* AI outputs **references**, not rewritten content.
* Every AI-generated unit points to a paragraph ID.

#### Outputs

* Excerpt objects such as:

```
{
  report_id,
  paragraph_id,
  quote,
  annotation,
  permalink
}
```

These objects feed:

* social media posts,
* preview cards,
* optional on-site “featured excerpts”.

---

### 5. Shared layer: permalink contract (key integration point)

The permalink layer is the contract between the two paths.

#### Requirements

* Every paragraph has:

  * a stable URL
  * a predictable fragment identifier
* AI systems never invent links; they select from existing IDs.

This ensures:

* social posts always land users in-context,
* no duplication of rendering logic,
* independence of pipelines.

---

### 6. Optional crossover points (later, not required)

These are *nice-to-haves*, not MVP requirements.

#### From AI → web

* “Highlighted excerpts” panels on report pages
* Auto-generated report summaries

#### From web → AI

* Analytics-informed extraction (which paragraphs get shared)

Neither is required for initial launch.

---

### 7. Why this separation matters

* You can:

  * improve rendering without touching AI,
  * change social strategy without touching the site.
* Failure in one path does not block the other.
* The architecture mirrors the original **“small pieces loosely joined”** principle in the deck .

In short:

* **Path A** makes reports *linkable citizens of the web*.
* **Path B** turns those links into *attention vectors*.

