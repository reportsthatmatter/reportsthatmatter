-- The newsletter's signup list (decision 0033, newsletter-blog 2026-10-24): one row per email address
-- given in a signup form (POST /api/subscribe, src/lib/subscribe.ts).
--
-- Nothing is sent from here. The list is exported (`pnpm subscribers export`) to the mailing provider, which
-- sends its own confirmation email before the first issue: that confirmation is the double opt-in, so `status`
-- starts at 'unconfirmed' and only the provider can make an address confirmed. `pnpm subscribers remove <email>`
-- deletes a row outright (a removal request, or an address the provider reports as unsubscribed).
--
-- email: lower-cased and trimmed, UNIQUE (its autoindex makes a repeat signup a no-op, at the cost of one extra
-- row write per new address). source: where the form was ("home", "blog", "newsletter", "report:<id>"), to know
-- which placements work; no network address, browser or other identifier is kept.
--
-- Apply to production BEFORE the deploy that ships the form. Code treats a missing table as "signup off" and
-- answers with an error page, so the order only matters for whether signups made in between are kept.
CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'unconfirmed'
);
