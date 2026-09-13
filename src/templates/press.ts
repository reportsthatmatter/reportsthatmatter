import { renderLayout } from "./layout";

/** A brand asset shown on the press page: a size label and its file. */
type MarkSize = { label: string; file: string; px: number };

const MARK_SIZES: MarkSize[] = [
  { label: "16 px", file: "/assets/brand/pilcrow-16.png", px: 16 },
  { label: "32 px", file: "/assets/brand/pilcrow-32.png", px: 32 },
  { label: "64 px", file: "/assets/brand/pilcrow-64.png", px: 64 },
  { label: "180 px", file: "/assets/brand/pilcrow-180.png", px: 180 },
  { label: "512 px", file: "/assets/brand/pilcrow-512.png", px: 512 },
];

/**
 * Press & brand assets. Logo, logotype, and the two together, in the sizes
 * this project actually ships (favicon through app-icon) rather than an
 * arbitrary export ladder.
 */
export function renderPress(): string {
  const body = `
<main>
  <section class="report-header wrap">
    <p class="kicker mono">Press</p>
    <h1>Brand assets.</h1>
  </section>

  <div class="prose wrap measure">
    <p>The mark is a pilcrow (¶) in a seal: the project's own product is a
    permanent address for every paragraph, so the glyph that already means
    "paragraph" is the logo. Right-click any image below to save it, or use
    the link underneath.</p>
  </div>

  <section class="section wrap">
    <p class="section-label mono">Logo &amp; logotype together</p>
    <div class="press-swatch">
      <img src="/assets/brand/logo-lockup.png" alt="Reports that Matter, logo and wordmark" style="max-width: 100%; height: auto" />
    </div>
    <p class="mono" style="margin-top: 0.75rem"><a href="/assets/brand/logo-lockup.png">logo-lockup.png</a></p>
  </section>

  <section class="section wrap">
    <p class="section-label mono">Logo alone</p>
    <div class="press-grid">
      ${MARK_SIZES.map(
        (m) => `
      <div class="press-cell">
        <div class="press-swatch" style="min-height: ${Math.min(m.px, 140)}px">
          <img src="${m.file}" alt="Reports that Matter mark, ${m.label}" width="${Math.min(m.px, 140)}" height="${Math.min(m.px, 140)}" />
        </div>
        <p class="mono">${m.label} — <a href="${m.file}">png</a></p>
      </div>`
      ).join("")}
    </div>
  </section>

  <section class="section wrap">
    <p class="section-label mono">Logotype alone</p>
    <div class="press-swatch">
      <span class="wordmark" style="font-size: 3rem; pointer-events: none">Reports that Matter</span>
    </div>
    <p>Set in EB Garamond, the same serif as the site itself. No condensed,
    bold, or all-caps variant — set the name as running text, the way it
    appears in the navigation.</p>
  </section>

  <section class="section wrap">
    <p class="section-label mono">Using it</p>
    <div class="prose measure">
      <p>Keep the mark's proportions and the clear space implied by its own
      circle — don't crop the seal, recolor it, or add effects. On a dark
      background, ink and paper should invert together rather than leaving
      the mark in its light-mode colors.</p>
    </div>
  </section>
</main>`;

  return renderLayout("Press — Reports that Matter", body, {
    description:
      "Logo, logotype, and brand assets for Reports that Matter, in the sizes the site itself ships.",
  });
}
