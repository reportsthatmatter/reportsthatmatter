/**
 * numbered-prose-list (J, reportsthatmatter-b78.8, mv1t): a top-level ordered
 * list in the rendered body that is really numbered paragraphs. Markdown reads
 * "1. In 1981…" or "2008) was 16.1x…" as a list item: no paragraph id, no
 * permalink, nothing to cite. @rtm/ingest escapes printed paragraph numbers by
 * default (printed-numbers.ts), so a finding here is a case it did not catch.
 *
 * One finding per top-level `<ol>` (not inside a blockquote or another list):
 *
 * - it starts at a year-like number (`<ol start="2008">`: a page-break
 *   continuation), or
 * - it has one item, opening lower-case (a sentence continued from the
 *   paragraph before), or
 * - most of its items read as prose: eight words or more, opening on a capital,
 *   closing a sentence or running to twenty words; or it has one such item of
 *   100 characters or more.
 *
 * Genuine lists of short items (an outline, a timeline, notes) do not fire.
 * The heuristic mirrors `markPrintedNumbers` in the ingest, deliberately.
 */
import type { Finding, Signal } from "./signals";

const TAG = /<(\/?)(ol|ul|blockquote)\b([^>]*)>/g;

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function readsAsProse(item: string): boolean {
  if (/^[a-z]/.test(item) || /[;,]$/.test(item)) return false;
  const words = item.split(" ").length;
  return words >= 8 && (/[.!?"”’)]$/.test(item) || words >= 20);
}

type TopList = { start: number | null; items: string[]; at: number };

function topLevelLists(html: string): TopList[] {
  const out: TopList[] = [];
  let depth = 0;
  let open: { at: number; contentFrom: number; start: number | null } | null = null;
  for (const m of html.matchAll(TAG)) {
    const closing = m[1] === "/";
    if (!closing) {
      if (depth === 0 && m[2] === "ol") {
        const start = /\bstart="(\d+)"/.exec(m[3]);
        open = { at: m.index!, contentFrom: m.index! + m[0].length, start: start ? Number(start[1]) : null };
      }
      depth++;
    } else {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && m[2] === "ol" && open) {
        const inner = html.slice(open.contentFrom, m.index!);
        const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)(?=<li\b|$)/g)].map((li) => text(li[1]));
        out.push({ start: open.start, items: items.filter(Boolean), at: open.at });
        open = null;
      }
    }
  }
  return out;
}

function pageBefore(html: string, at: number): number | null {
  const head = html.slice(Math.max(0, at - 6000), at);
  const all = [...head.matchAll(/data-page="(\d+)"|id="page-(\d+)"/g)];
  const last = all[all.length - 1];
  return last ? Number(last[1] ?? last[2]) : null;
}

export function numberedProseLists(html: string): Finding[] {
  const out: Finding[] = [];
  for (const list of topLevelLists(html)) {
    if (list.items.length === 0) continue;
    const first = list.items[0];
    const prose = list.items.filter(readsAsProse).length;
    const why =
      list.start !== null && list.start >= 1900 && list.start <= 2099
        ? "starts at a year"
        : list.items.length === 1 && /^[a-z]/.test(first)
          ? "one lower-case item"
          : list.items.length === 1
            ? first.length >= 100 && readsAsProse(first)
              ? "one prose paragraph"
              : ""
            : prose / list.items.length >= 0.6
              ? `${prose} of ${list.items.length} items are prose`
              : "";
    if (!why) continue;
    const label = `<ol${list.start !== null ? ` start=${list.start}` : ""}> ${why}: ${first}`;
    out.push({ signal: "numbered-prose-list", page: pageBefore(html, list.at), excerpt: label.length > 160 ? label.slice(0, 159) + "…" : label });
  }
  return out;
}

export const numberedProseList: Signal = {
  id: "numbered-prose-list",
  kind: "count",
  cls: "J",
  doc: "A top-level <ol> of printed paragraph numbers (a year-like start, a lone lower-case item, or items that read as prose): paragraphs with no id, so none can be cited. @rtm/ingest escapes printed numbers by default; a finding is one it missed. Budget is a maximum count.",
  run: (input) => numberedProseLists(input.html),
};
