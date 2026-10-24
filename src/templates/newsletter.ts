/**
 * The newsletter (decision 0033): the signup form every page that carries one shares, and /newsletter itself.
 *
 * The form works with no script: it posts to /api/subscribe, which answers a plain form post with a redirect
 * back to /newsletter saying what happened. /assets/signup.js upgrades it to an in-place answer, so a reader
 * signing up at the end of a report section stays on it.
 */
import { renderLayout, escapeHtml } from "./layout";
import { SITE_ORIGIN, CONTACT_EMAIL } from "./site";
import { formatDate } from "./blog";
import type { Post } from "../lib/blog";

export const NEWSLETTER_PATH = "/newsletter";
export const SIGNUP_SCRIPT = "/assets/signup.js";

/** One line, under every form: what we keep and what happens next. The full version is on /newsletter and /about. */
export const SIGNUP_PRIVACY =
  "We keep your address, and when and where on the site you signed up; nothing else, and only for this newsletter. Before the first issue you get one email asking you to confirm; every issue has an unsubscribe link.";

export const NEWSLETTER_PITCH =
  "A few passages worth reading again, sometimes tied to the date or the news, each linked to its place in the report.";

/**
 * The signup block. `source` says where it is ("home", "blog", "post:<slug>", "report:<id>", "newsletter"), so
 * we can tell which placements work; it is all the form records besides the address.
 * `compact` drops the heading for pages where the block sits under other content (a report section's end).
 */
export function renderSignup(source: string, options: { compact?: boolean } = {}): string {
  return `
<section class="signup wrap" aria-labelledby="signup-heading">
  <div class="measure">
    <p class="section-label mono" id="signup-heading">Newsletter · From the archives</p>
    ${options.compact ? "" : `<h2 class="signup-title">One email a month from the archive.</h2>`}
    <p class="signup-pitch">${escapeHtml(options.compact ? `Once a month: ${NEWSLETTER_PITCH.charAt(0).toLowerCase()}${NEWSLETTER_PITCH.slice(1)}` : NEWSLETTER_PITCH)}</p>
    ${signupForm(source)}
  </div>
</section>`;
}

/** The form, the answer line under it and the privacy line, without the block around them. */
function signupForm(source: string): string {
  return `<form class="signup-form" method="post" action="/api/subscribe" data-signup>
      <input type="hidden" name="source" value="${escapeHtml(source)}" />
      <label class="visually-hidden" for="signup-email">Email address</label>
      <input type="email" id="signup-email" name="email" required autocomplete="email" maxlength="254" placeholder="you@example.org" />
      <div class="signup-trap" aria-hidden="true"><label>Leave this empty <input type="text" name="rtm_hp" tabindex="-1" autocomplete="off" /></label></div>
      <button type="submit">Subscribe</button>
    </form>
    <p class="signup-status" role="status" aria-live="polite"></p>
    <p class="signup-privacy">${escapeHtml(SIGNUP_PRIVACY)} <a href="${NEWSLETTER_PATH}#privacy">More</a></p>`;
}

export type SignupOutcome = "subscribed" | "invalid" | "unavailable" | undefined;

const OUTCOME_TEXT: Record<Exclude<SignupOutcome, undefined>, string> = {
  subscribed: "Thank you. Before the first issue you will get one email asking you to confirm; the list is only those who do.",
  invalid: "That does not look like an email address. Please check it and try again.",
  unavailable: "Sorry, we could not save that just now. Please try again in a few minutes.",
};

export function signupMessage(outcome: Exclude<SignupOutcome, undefined>): string {
  return OUTCOME_TEXT[outcome];
}

/** /newsletter: what it is, the form, past issues (the published posts that are issues), and the privacy terms. */
export function renderNewsletterPage(issues: Post[], outcome?: SignupOutcome): string {
  const notice = outcome
    ? `<p class="signup-notice${outcome === "subscribed" ? "" : " signup-notice-error"}" role="status">${escapeHtml(OUTCOME_TEXT[outcome])}</p>`
    : "";
  const past = issues.length
    ? `<ul class="post-list">${issues
        .map(
          (post) => `
      <li class="post-item">
        <p class="post-meta mono">No. ${post.issue} · ${formatDate(post.date)}</p>
        <h2><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h2>
        <p class="post-summary">${escapeHtml(post.summary)}</p>
      </li>`
        )
        .join("")}</ul>`
    : `<p>The first issue is in preparation. Each issue is also published on the <a href="/blog">blog</a>.</p>`;

  const body = `
<main>
  <section class="report-header wrap">
    <div class="measure">
      <p class="kicker mono">Newsletter</p>
      <h1>From the archives.</h1>
      <p class="byline mono">Monthly · every issue is also on the <a href="/blog">blog</a> and its <a href="/blog/feed.xml">feed</a></p>
    </div>
  </section>
  <div class="prose wrap measure">
    ${notice}
    <p>Once a month: ${escapeHtml(NEWSLETTER_PITCH.charAt(0).toLowerCase() + NEWSLETTER_PITCH.slice(1))} No commentary in place of the source: we quote the report and point into it, so you can read the passage in context and cite it by its own link.</p>
    <div class="signup signup-bare">${signupForm("newsletter")}</div>
    <h2 id="issues">Past issues</h2>
    ${past}
    <h2 id="privacy">Your address</h2>
    <p>When you subscribe we keep your email address, the time, and which page the form was on. We do not keep your
      network address or browser, and we do not use your address for anything but this newsletter. We will never sell it, or give it to anyone but the mailing service that sends the newsletter.</p>
      <p>The list is held on the same Cloudflare database as the rest of the site until we send the first issue. The
      newsletter will then be sent by a mailing service, which emails you once to ask you to confirm before you
      receive anything; we delete addresses that are not confirmed. Every issue has an unsubscribe link.</p>
    <p>To be removed at any time, or to ask what we hold, write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
  </div>
</main>`;

  return renderLayout("Newsletter — Reports that Matter", body, {
    description: `The Reports that Matter newsletter. ${NEWSLETTER_PITCH}`,
    url: `${SITE_ORIGIN}${NEWSLETTER_PATH}`,
    feed: { href: "/blog/feed.xml", title: "Reports that Matter — Blog" },
    scripts: [SIGNUP_SCRIPT],
    // A ?subscribed= page is a receipt, not a page to index.
    noindex: outcome !== undefined,
  });
}
