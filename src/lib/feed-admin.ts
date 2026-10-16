/**
 * The logic behind `pnpm feed` (scripts/feed.mjs, reportsthatmatter-bght.10.5): naming rows to hide or show, the
 * SQL for it, and rebuilding `public_marks` from `marks`. Pure or injectable, so it is tested without wrangler.
 */
import { decodeAnchor, encodeAnchor } from "../../assets/anchor.js";
import type { ContentSource } from "./content";
import { verifyMark } from "./feed";
import { feedEnabled, isExcludedReport, verdictFor, type FeedEnv } from "./feed-policy";
import { isEditorActor, RATE_LIMIT_PER_DAY, type MarkEvent } from "./marks";

/** What `hide`/`show` act on: one row by id, the rows of one passage (a link from the site), or a whole report. */
export type FeedTarget =
  | { kind: "id"; id: number }
  | { kind: "passage"; report: string; paragraph: string; anchor: string | null }
  | { kind: "report"; report: string }
  | { kind: "all" };

const REPORT_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

/**
 * A row id, or a link to a passage as /highlights prints it (`/reports/<id>?p=<paragraph>&h=<anchor>`), with or
 * without the origin, the section slug or the `#` fragment. The anchor is normalised to the form `public_marks`
 * stores (`encodeAnchor` of its selector), whether the link carries it as printed or encoded once more (the
 * report route's redirect re-encodes it).
 */
export function parseTarget(value: string): FeedTarget | null {
  const text = value.trim();
  if (/^\d+$/.test(text)) return { kind: "id", id: Number(text) };

  const match = text.match(/\/reports\/([a-z0-9-]+)(?:\/[^?#]*)?\?([^#]*)/);
  if (!match || !REPORT_ID.test(match[1])) return null;
  const query = match[2];
  const raw = (name: string) => query.match(new RegExp(`(?:^|&)${name}=([^&]*)`))?.[1] ?? null;

  const p = raw("p");
  if (!p) return null;
  let paragraph: string;
  try {
    paragraph = decodeURIComponent(p);
  } catch {
    return null;
  }

  let h = raw("h");
  if (h && !h.includes("|")) {
    try {
      h = decodeURIComponent(h);
    } catch {
      return null;
    }
  }
  const anchor = h ? encodeAnchor(decodeAnchor(h)) : null;
  if (h && !anchor) return null;
  return { kind: "passage", report: match[1], paragraph, anchor };
}

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * One UPDATE that hides (status 'hidden', reason 'manual') or shows again (status 'visible', reason '') what the
 * target names. `show` restores only manually hidden rows: a held row (cap, blocklist) stays held.
 */
export function statusSql(target: FeedTarget, action: "hide" | "show"): string {
  const set =
    action === "hide"
      ? "SET status = 'hidden', reason = 'manual'"
      : "SET status = 'visible', reason = ''";
  const only = action === "hide" ? "status = 'visible'" : "status = 'hidden' AND reason = 'manual'";
  switch (target.kind) {
    case "id":
      return `UPDATE public_marks ${set} WHERE id = ${Math.trunc(target.id)} AND ${only}`;
    case "passage":
      return `UPDATE public_marks ${set} WHERE report = ${quote(target.report)} AND paragraph = ${quote(target.paragraph)}${
        target.anchor ? ` AND anchor = ${quote(target.anchor)}` : ""
      } AND ${only}`;
    case "report":
      return `UPDATE public_marks ${set} WHERE report = ${quote(target.report)} AND ${only}`;
    case "all":
      return `UPDATE public_marks ${set} WHERE ${only}`;
  }
}

/** The `marks` columns a rebuild reads. */
export type StoredMark = MarkEvent & { id: number; actor: string; created_at: number };

/** A `public_marks` row a rebuild would write. */
export type RebuiltRow = {
  report: string;
  paragraph: string;
  slug: string;
  section_title: string;
  words: string;
  anchor: string;
  page: number | null;
  created_at: number;
  status: string;
  reason: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `public_marks` as `publishMark` would have written it, replaying `marks` in id order against the content
 * `contentOf` returns (the current pre-rendered text): the same skips, duplicate check, cap and verification.
 * Rows a person hid (`hidden`, reason 'manual') stay hidden: pass them as `hidden`, keyed on report, paragraph
 * and words. A mark the rate limit would have refused never reached `marks`, so it needs no special case.
 */
export async function planRebuild(
  marks: StoredMark[],
  options: {
    env: FeedEnv;
    knownReports: ReadonlySet<string>;
    contentOf: (report: string) => Promise<ContentSource>;
    hidden?: Array<{ report: string; paragraph: string; words: string }>;
  }
): Promise<{ rows: RebuiltRow[]; skipped: Record<string, number> }> {
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
  const rows: RebuiltRow[] = [];
  if (!feedEnabled(options.env)) return { rows, skipped: { off: marks.length } };

  const hidden = new Set((options.hidden ?? []).map((h) => `${h.report}\u0000${h.paragraph}\u0000${h.words}`));
  const sorted = [...marks].sort((a, b) => a.id - b.id);
  const byActorReport = new Map<string, StoredMark[]>();
  const contents = new Map<string, ContentSource>();

  for (const mark of sorted) {
    const key = `${mark.actor}\u0000${mark.report}`;
    const earlier = byActorReport.get(key) ?? [];
    byActorReport.set(key, [...earlier, mark]);

    if (isEditorActor(mark.actor)) { skip("editor"); continue; }
    if (isExcludedReport(options.env, mark.report)) { skip("excluded"); continue; }
    if (!options.knownReports.has(mark.report)) { skip("unknown-report"); continue; }

    const dayStart = mark.created_at - (mark.created_at % DAY_MS);
    const duplicate = earlier.some(
      (m) => m.created_at >= dayStart && m.created_at < mark.created_at && m.paragraph === mark.paragraph && m.exact === mark.exact
    );
    if (duplicate) { skip("duplicate"); continue; }
    const before = Math.min(RATE_LIMIT_PER_DAY, earlier.filter((m) => m.created_at >= mark.created_at - DAY_MS).length);

    if (!contents.has(mark.report)) contents.set(mark.report, await options.contentOf(mark.report));
    const passage = await verifyMark(contents.get(mark.report)!, mark);
    if (!passage) { skip("unverified"); continue; }
    const verdict = verdictFor(passage.words, before);
    if (!verdict) { skip("short"); continue; }

    const manual = hidden.has(`${mark.report}\u0000${passage.paragraph}\u0000${passage.words}`);
    rows.push({
      report: mark.report,
      paragraph: passage.paragraph,
      slug: passage.slug,
      section_title: passage.sectionTitle,
      words: passage.words,
      anchor: passage.anchor,
      page: passage.page,
      created_at: mark.created_at,
      status: manual ? "hidden" : verdict.status,
      reason: manual ? "manual" : verdict.reason,
    });
  }
  return { rows, skipped };
}

/** The statements that replace `public_marks` with `rows`: one DELETE, then one INSERT per row. */
export function rebuildSql(rows: RebuiltRow[]): string {
  const value = (v: string | number | null) => (v === null ? "NULL" : typeof v === "number" ? String(v) : quote(v));
  const statements = ["DELETE FROM public_marks;"];
  for (const r of rows) {
    statements.push(
      `INSERT INTO public_marks (report, paragraph, slug, section_title, words, anchor, page, created_at, status, reason) VALUES (${[
        r.report, r.paragraph, r.slug, r.section_title, r.words, r.anchor, r.page, r.created_at, r.status, r.reason,
      ].map(value).join(", ")});`
    );
  }
  return statements.join("\n\n") + "\n";
}
