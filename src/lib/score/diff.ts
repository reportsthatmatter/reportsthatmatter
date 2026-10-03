/**
 * `pnpm score --diff`: which pipeline decisions changed verdict between two score runs (reportsthatmatter-1w3).
 *
 * The score tables say a metric moved; this says which decisions moved it, with the text, so a pass can be judged by
 * what it did to individual page breaks, headings, blocks and markers. Rows are matched across runs by what does
 * not change when the pipeline does: a layout boundary by its page and the two lines either side (the PDF is the
 * same in both runs), a block or heading by its text and printed page, a marker by its label and the words around it.
 */
import type { Row } from "./decisions";

export type Flip = { key: string; decision: string; before: boolean | null; after: boolean | null; row: Row };

export type DecisionDiff = {
  /** Per decision kind. */
  kinds: Record<string, { same: number; broke: Flip[]; fixed: Flip[]; labelled: Flip[]; unlabelled: Flip[]; added: Row[]; gone: Row[] }>;
};

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** A key that survives a change of pipeline; repeats of the same key are numbered in order. */
export function rowKeys(rows: Row[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    let base: string;
    if (r.decision === "boundary") base = r.source === "layout" ? `boundary|layout|${str(r.page)}|${str(r.prev_text)}|${str(r.next_text)}` : `boundary|blocks|${str(r.printed_page)}|${str(r.prev_text)}|${str(r.next_text)}`;
    else if (r.decision === "marker") base = `marker|${str(r.label)}|${str(r.before)}|${str(r.after)}`;
    else base = `${str(r.decision)}|${str(r.printed_page)}|${str(r.text)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}#${n}`;
  });
}

const verdict = (r: Row): boolean | null => (r.correct === true ? true : r.correct === false ? false : null);

export function diffDecisions(a: Row[], b: Row[]): DecisionDiff {
  const ka = rowKeys(a);
  const kb = rowKeys(b);
  const byKeyA = new Map(ka.map((k, i) => [k, a[i]]));
  const byKeyB = new Map(kb.map((k, i) => [k, b[i]]));
  const kinds: DecisionDiff["kinds"] = {};
  const kind = (d: string) => (kinds[d] ??= { same: 0, broke: [], fixed: [], labelled: [], unlabelled: [], added: [], gone: [] });
  for (const [k, rb] of byKeyB) {
    const ra = byKeyA.get(k);
    const d = str(rb.decision);
    if (!ra) {
      kind(d).added.push(rb);
      continue;
    }
    const before = verdict(ra);
    const after = verdict(rb);
    const flip: Flip = { key: k, decision: d, before, after, row: rb };
    if (before === after) kind(d).same++;
    else if (before === true && after === false) kind(d).broke.push(flip);
    else if (before === false && after === true) kind(d).fixed.push(flip);
    else if (before === null) kind(d).labelled.push(flip);
    else kind(d).unlabelled.push(flip);
  }
  for (const [k, ra] of byKeyA) if (!byKeyB.has(k)) kind(str(ra.decision)).gone.push(ra);
  return { kinds };
}

const clip = (s: unknown, n = 80) => {
  const t = str(s).replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** One flip as a line a reader can check against the page: where, and the text either side or inside. */
export function describe(row: Row): string {
  const page = row.printed_page ?? row.page;
  const where = page !== null && page !== undefined ? `p.${page}` : "p.?";
  if (row.decision === "boundary") {
    const verb = row.ours_boundary === true ? "we break" : row.ours_boundary === false ? "we run on" : "we ?";
    return `${where} ${verb}, reference ${row.ref_boundary ? "breaks" : "runs on"}: …${clip(row.prev_text, 50)} ¦ ${clip(row.next_text, 50)}…`;
  }
  if (row.decision === "marker") return `${where} marker ${str(row.label)} (${str(row.outcome)}): …${clip(row.before, 40)} [${str(row.label)}] ${clip(row.after, 30)}`;
  if (row.decision === "heading") return `${where} ours ${row.ours_heading ? `h${str(row.ours_level)}` : "not a heading"}, reference ${row.ref_heading ? `h${str(row.ref_level)}` : "not a heading"}: ${clip(row.text)}`;
  return `${where} ours ${str(row.ours_type)}, reference ${str(row.ref_type)}: ${clip(row.text)}`;
}

/** The flip report for one score run pair: counts per decision kind, then up to `limit` examples of each direction. */
export function formatDecisionDiff(id: string, diff: DecisionDiff, limit = 8): string {
  const lines = [`${id}`];
  for (const [kind, k] of Object.entries(diff.kinds).sort()) {
    lines.push(`  ${kind}: ${k.same} unchanged, ${k.broke.length} correct→wrong, ${k.fixed.length} wrong→correct, ${k.labelled.length} newly labelled, ${k.unlabelled.length} no longer labelled, ${k.added.length} new rows, ${k.gone.length} gone`);
  }
  for (const [name, pick] of [
    ["correct → wrong", (k: DecisionDiff["kinds"][string]) => k.broke],
    ["wrong → correct", (k: DecisionDiff["kinds"][string]) => k.fixed],
  ] as const) {
    for (const [kind, k] of Object.entries(diff.kinds).sort()) {
      const flips = pick(k);
      if (!flips.length) continue;
      lines.push(`  ${name}, ${kind} (${flips.length}):`);
      for (const f of flips.slice(0, limit)) lines.push(`    - ${describe(f.row)}`);
      if (flips.length > limit) lines.push(`    …and ${flips.length - limit} more`);
    }
  }
  return lines.join("\n");
}
