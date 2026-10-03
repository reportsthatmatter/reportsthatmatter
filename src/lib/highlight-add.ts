/**
 * `pnpm highlight add <share link>`: turn a link copied from the site's share
 * popover into an editor's highlight in `editorial/<id>.yaml` (decision 0013).
 *
 * The link already names everything: the report (path), the paragraph (`?p=`)
 * and the words (`?h=`, a quote selector). The quote is read back off the
 * pre-rendered paragraph rather than taken from the link, because a long
 * selection travels abbreviated ("opening⋯closing") and the file holds the
 * full verbatim words that `pnpm editorial` checks.
 */
import { parse, stringify } from "yaml";
import { decodeAnchor, locate } from "../../assets/anchor.js";
import { extractParagraph } from "../templates/report";
import { resolveParagraph, type AliasMeta } from "./aliases";

export type ShareLink = { report: string; paragraph: string; anchor: string | null };

/** The report, paragraph and anchor a share link names, or a reason it names none. */
export function parseShareLink(link: string): ShareLink | string {
  let url: URL;
  try {
    url = new URL(link, "https://reportsthatmatter.org");
  } catch {
    return "not a URL";
  }
  const report = url.pathname.match(/^\/reports\/([a-z0-9-]+)(?:\/|$)/)?.[1];
  if (!report) return "not a report link (expected /reports/<id>…)";
  const paragraph = url.searchParams.get("p") || url.hash.slice(1);
  if (!paragraph) return "the link names no paragraph (no ?p= and no #fragment): select the words on the site and use Copy link";
  return { report, paragraph, anchor: url.searchParams.get("h") };
}

/**
 * The verbatim quote and live paragraph id a link points at, against the
 * pre-rendered report body. No anchor means the whole paragraph.
 */
export function resolveShareLink(
  link: ShareLink,
  body: string,
  meta: AliasMeta
): { paragraph: string; quote: string } | string {
  const live = resolveParagraph(meta, link.paragraph);
  if (!live) return `no paragraph "${link.paragraph}" in ${link.report}, and no alias for it`;
  const text = extractParagraph(body, live.id);
  if (!text) return `paragraph "${live.id}" is not a plain paragraph in ${link.report} (a list item or quotation cannot be highlighted yet)`;
  if (!link.anchor) return { paragraph: live.id, quote: text };
  const selector = decodeAnchor(link.anchor);
  if (!selector) return "the ?h= anchor is malformed";
  const found = locate(text, selector);
  if (!found) return `the quoted words are no longer in paragraph "${live.id}"`;
  return { paragraph: live.id, quote: text.slice(found.start, found.end) };
}

/**
 * Append a highlight to an editorial file's text as a text edit at the end of
 * its `highlights:` block, so the rest of the file (folded prose, comments) is
 * untouched: re-serialising the document would reflow every paragraph.
 * Returns the file unchanged, with `added: false`, when the same paragraph and
 * quote are already there.
 */
export function addHighlight(
  yamlText: string,
  highlight: { paragraph: string; quote: string; card?: boolean }
): { text: string; added: boolean } {
  const existing = ((parse(yamlText) ?? {}).highlights ?? []) as Array<{ paragraph: string; quote: string }>;
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  if (existing.some((h) => h.paragraph === highlight.paragraph && squash(h.quote) === squash(highlight.quote))) {
    return { text: yamlText, added: false };
  }

  const entry: Record<string, unknown> = { paragraph: highlight.paragraph, quote: highlight.quote };
  if (highlight.card) entry.card = true;
  const lines = yamlText.replace(/\n*$/, "").split("\n");
  const at = lines.findIndex((line) => /^highlights:\s*(\[\s*\])?\s*$/.test(line));

  if (at === -1 || /\[\s*\]/.test(lines[at])) {
    // No block yet (or an empty flow list): write a fresh one at the end.
    if (at !== -1) lines.splice(at, 1);
    const block = stringify({ highlights: [entry] }, { lineWidth: 0 }).replace(/\n$/, "");
    return { text: `${lines.join("\n").replace(/\n*$/, "")}\n\n${block}\n`, added: true };
  }

  // The block runs until the next top-level key; match its items' indent.
  let end = at + 1;
  while (end < lines.length && (lines[end] === "" || /^[\s#-]/.test(lines[end]))) end++;
  while (end > at + 1 && lines[end - 1].trim() === "") end--;
  const indent = lines.slice(at + 1, end).find((line) => /^\s*- /.test(line))?.match(/^(\s*)-/)?.[1] ?? "  ";
  const item = stringify([entry], { lineWidth: 0 })
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => indent + line);
  lines.splice(end, 0, ...item);
  return { text: lines.join("\n") + "\n", added: true };
}
