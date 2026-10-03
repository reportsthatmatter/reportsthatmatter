/**
 * Golden pages against adjudicated page breaks (reportsthatmatter-m7ga).
 *
 * `golden.yaml` says what a page's top looks like (`continues_previous: true` means it opens mid-block);
 * `reference/adjudicated.yaml` says, for ~30 breaks, whether the block runs on (`join`) or a new one starts
 * (`split`), both read off the PDF. An adjudicated `page` is the physical page of the first line after the
 * break, which is the golden `pdf` page. When both exist for one page they must agree; a golden page that
 * contradicts an adjudication is one of the two being wrong, and `verify` cannot tell, because it only checks
 * the pipeline against the golden. Pure: parses the two YAML texts, no files.
 */
import { parse } from "yaml";

export type Contradiction = { page: number; kind: "join-vs-opens-new" | "split-vs-continues" | "opening-differs"; detail: string };

type GoldenLike = { pdf: number; volume?: number; continues_previous?: boolean; opens_with?: string; blocks?: unknown[]; headings?: unknown[] };
type BreakLike = { page: number | string; next?: string; verdict: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
const words = (s: string, n: number) => norm(s).split(" ").filter(Boolean).slice(0, n).join(" ");

export function goldenVsAdjudicated(goldenYaml: string, adjudicatedYaml: string): Contradiction[] {
  const golden = ((parse(goldenYaml) as { pages?: GoldenLike[] } | null)?.pages ?? []).filter((p) => (p.volume ?? 1) === 1);
  const breaks = ((parse(adjudicatedYaml) as { breaks?: BreakLike[] } | null)?.breaks ?? []).filter((b) => b.verdict === "join" || b.verdict === "split");
  const out: Contradiction[] = [];
  for (const b of breaks) {
    const page = Number(b.page);
    const g = golden.find((p) => Number(p.pdf) === page);
    if (!g) continue;
    // A golden page asserts how it opens only when it lists blocks or headings, or says it continues.
    const asserts = g.continues_previous === true || (g.blocks?.length ?? 0) > 0 || (g.headings?.length ?? 0) > 0;
    if (!asserts) continue;
    if (b.verdict === "join" && !g.continues_previous) {
      out.push({ page, kind: "join-vs-opens-new", detail: "adjudicated join (the block runs on), but the golden page opens a new block (no continues_previous)" });
    } else if (b.verdict === "split" && g.continues_previous) {
      out.push({ page, kind: "split-vs-continues", detail: "adjudicated split (a new block starts), but the golden page continues_previous" });
    } else if (b.verdict === "join" && g.opens_with && b.next) {
      const n = Math.min(3, norm(g.opens_with).split(" ").length, norm(b.next).split(" ").length);
      if (words(g.opens_with, n) !== words(b.next, n)) {
        out.push({ page, kind: "opening-differs", detail: `golden opens_with "${g.opens_with}" but the adjudicated next line is "${b.next}"` });
      }
    }
  }
  return out;
}
