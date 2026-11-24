import { SITE_ORIGIN } from "./site";
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

/** A composed press image: file under assets/press, pixel size, file size, use, alt text. */
type PressImage = { file: string; w: number; h: number; kb: number; use: string; alt: string };

const PRESS_IMAGES: PressImage[] = [
  {
    file: "press-hero.png", w: 2400, h: 1260, kb: 1025,
    use: "Newsletter header, link preview",
    alt: "Reports that Matter: the big public inquiries, online to be read, in their own words. Every paragraph has its own link.",
  },
  {
    file: "press-passages.png", w: 2400, h: 2480, kb: 270,
    use: "Newsletter body, social, a forum post",
    alt: "Three sentences from the public record. \u201cDoubt is our product since it is the best means of competing with the \u2018body of fact\u2019 that exists in the mind of the general public.\u201d A tobacco company strategy paper, United States v. Philip Morris (2006), p. 1537. \u201cLet's hope we are all wealthy and retired by the time this house of cards falters.\u201d A rating-agency analyst's email, Dec 2006, US Senate financial-crisis report (2011), p. 297. \u201cI am very aware . . . it is another drug we r on.\u201d A Lehman executive on Repo 105, April 2008, Lehman Brothers Examiner's Report (2010), p. 742.",
  },
  {
    file: "press-pdf-to-page.png", w: 2400, h: 1260, kb: 668,
    use: "Explaining what the site does",
    alt: "Before: one news day, then a PDF on a website that may close. On Reports that Matter: every paragraph has its own link, shown as a highlighted passage with copy-link controls.",
  },
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
    <h1>Press kit.</h1>
  </section>

  <section class="section wrap">
    <p class="section-label mono">Images</p>
    <div class="prose measure">
      <p>Free to use with a link to <a href="${SITE_ORIGIN}">reportsthatmatter.org</a>. Each is a PNG at twice the size shown.</p>
    </div>
    <div class="press-grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))">
      ${PRESS_IMAGES.map(
        (i) => `
      <div class="press-cell">
        <div class="press-swatch" style="padding: 1rem">
          <a href="/assets/press/${i.file}"><img src="/assets/press/${i.file}" alt="${i.alt.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" width="${i.w / 2}" height="${i.h / 2}" loading="lazy" style="max-width: 100%; height: auto; max-height: 320px; width: auto" /></a>
        </div>
        <p class="mono"><a href="/assets/press/${i.file}" download>${i.file}</a> — ${i.w} × ${i.h}, ${i.kb >= 1000 ? (i.kb / 1000).toFixed(1) + " MB" : i.kb + " KB"}</p>
        <p>${i.use}.</p>
      </div>`
      ).join("")}
    </div>
  </section>

  <section class="section wrap">
    <p class="section-label mono">Copy and paste</p>
    <div class="prose measure">
      <h3>Short (25 words)</h3>
      <p>Reports that Matter puts the big public inquiries and investigations online to be read, searched and linked to the paragraph, in the report's own words.</p>
      <h3>Short (about 50 words)</h3>
      <p>After a disaster or a scandal, public inquiries gather the most detailed record of what actually happened: the memos, the emails, the morning rebuilt to the minute. Almost nobody reads past the summary. Reports that Matter puts these reports online as pages you can read, search and link to, paragraph by paragraph.</p>
      <h3>Medium (about 100 words)</h3>
      <p>Public inquiries and investigations hold the most detailed record we have of what actually happened: the companies' own memos, the emails, the morning rebuilt to the minute. Almost none of it is read: one news day for the summary, then a PDF on a website that closes. Reports that Matter puts them back online as pages you can read, search and link to, paragraph by paragraph, with the official PDF one click away. The words are the report's own. Philip Morris, 9/11, the financial crisis, Grenfell, the Post Office and more. Started in 2014 by Rufus Pollock, founder of the Open Knowledge Foundation; built with Datopian.</p>
      <h3>Long (about 160 words)</h3>
      <p>After a disaster or a scandal, a country sometimes stops and finds out what happened. Public inquiries can compel evidence, and what they publish is the most detailed factual record of that moment anyone has assembled: the companies' own memos, emails with their time stamps, the morning rebuilt to the minute. Almost none of it is read. The report gets one news day, built around the executive summary. The evidence goes into a PDF on a website that often closes when the inquiry does.</p>
      <p>Reports that Matter puts these reports back online as pages you can read, search and link to, paragraph by paragraph, with the official PDF one click away and the report's own words throughout. A tobacco company's "Doubt is our product"; a credit-rating analyst's "house of cards" email; the Columbia engineer's email that he printed out instead of sending. Started by Rufus Pollock in 2014.</p>
    </div>
  </section>

  <section class="report-header wrap">
    <p class="kicker mono">Brand</p>
    <h2>Logo and logotype.</h2>
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
      <span class="wordmark" style="font-size: clamp(1.9rem, 9vw, 3rem); pointer-events: none">Reports that Matter</span>
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
    url: `${SITE_ORIGIN}/press`,
    follow: true,
  });
}
