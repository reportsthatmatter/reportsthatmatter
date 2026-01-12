## 2026-01-12 Next 30 minutes (planning, not building)

Outcome at T+30: A thin but explicit execution spine for both product and marketing, sufficient to guide the next several focused build sessions without reopening strategy.

- [x] **Lock the shipping boundary**
  - [x] Write one sentence defining what “good enough to ship” means for the landing page. **✅ Good enough to ship = current landing page as-is; fuller narrative and evidence explanation explicitly deferred (~50 minutes later).**
  - [x] Explicitly defer narrative expansion to a later iteration. **✅ Deferred; narrative + evidence depth treated as a separate future pass.**

- [x] **Feature development spine (site)**
  - [x] List the *three* core user actions the site must support. **✅ Core actions ordered as Read → Share → Explore.**
  - [x] Map each action to one concrete feature. **✅ Read = render full report page from prepared Markdown; Share = highlight text → share affordance (right margin / sidebar; mobile later); Explore = simple catalog/index of reports.**
  - [x] Order features strictly by dependency. **✅ Read → Share → Explore.**

- [x] **One-report path**
  - [x] Define exact steps from raw PDF to published report page. **✅ PDF → extracted text → Markdown → rendered HTML.**
  - [x] Identify the weakest step in the path. **✅ Report rendering layer (Markdown → HTML).**
  - [x] Select the next concrete build target. **✅ Render the already-prepared report on the site.**

- [x] **Marketing plan skeleton**
  - [x] Define one target audience archetype. **✅ Politically engaged users interested in current controversies (e.g. Jan 6).**
  - [x] Define one core message for that audience. **✅ “Here is the primary evidence—read the inquiry itself.”**
  - [x] Define one distribution channel and one content format. **✅ Twitter/X; direct links to specific report pages or highlighted snippets.**

- [x] **Next-session handoff**
  - [x] Write a short checklist titled “Next build session” (max 3 items). **✅ Build report renderer; add desktop highlight-to-share affordance; publish one report page and share it publicly.**

---

### Appendix: Notes / Detail (for later reference)

#### Core user actions (ordering rationale)

1. Read  
   - Most users will land directly on individual report pages.
   - Primary value is legible, navigable, linkable reports.
2. Share  
   - Highlight-based sharing enables organic distribution.
   - Ideal UX: select text → share UI appears in right margin; mobile variant TBD.
3. Explore  
   - Secondary action: browse an index/catalog of reports.

#### Audience framing (initial wedge)

- Politically engaged users interested in contested public narratives.
- Entry examples:
  - January 6 inquiry.
  - Major investigations into tech companies.
- Framing emphasis: evidence over commentary.

#### Distribution

- Single-channel focus: Twitter/X.
- Objective: drive traffic directly to individual report pages, not the homepage.

## 2026-01-12 - basic landing page

- [ ] v1 design of new front page.
  - [ ] use brief to try out 2-3 different agents
  - [ ] pick the best result
  - [ ] 🏆 archive the results of this process 
  - [ ] commit that landing page

## 2026-01-11

Here is a minimal, 60–120-minute roadmap, constrained to unblock you and advance implementation.

Immediate (next 60–90 minutes)

- [x] Repo hygiene **✅2026-01-11**
  - [x] Archive or delete everything not directly serving the current landing page + marketing push.
  - [x] Create a clean top-level structure: `/docs`, `/site`, `/assets`.

- [x] Import core documents (from ChatGPT thread) **✅2026-01-11**
  - [x] `docs/MARKETING.md` — the digital marketing strategy you just shaped.
  - [x] `docs/brief-landing-page.md` — the homepage brief for creative/dev handoff.
  - [x] (Optional) `docs/PRODUCT.md` if you have a short positioning or “why this exists” write-up distinct from marketing.

- [x] Canonical source asset **✅2026-01-11**
  - [x] Add the *Official Inquiries – the Idea* PDF to `assets/` and treat it as the conceptual anchor for Reports that Matter .

Immediate implementation nudge (remaining 30 minutes)

- [x] Create a single `README.md` that does only three things: **✅2026-01-11**
  - [x] States the one-sentence value proposition.
  - [x] Links to the marketing strategy and landing page brief.
  - [x] States the next concrete build target (e.g. “static one-page site”).

What I would recommend next (but only as stubs, not execution)

- [ ] Create placeholder files (empty or bullet-pointed):
  - [ ] `site/homepage.md` — content only, no design.
  - [ ] `site/sample-report.md` — one report page skeleton to guide development.
