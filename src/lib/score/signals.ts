/**
 * How well do the b78.2 quality signals predict the scorer's errors? For each
 * signal: the scorer error it claims to find, its precision (findings that
 * are such an error) and its recall (such errors it finds).
 *
 * Findings carry a page and an excerpt, not a block, so each is located by
 * its excerpt among our blocks (the same text the signal read).
 */
import { SIGNALS, type Finding, type QualityInput } from "../quality/signals";
import type { ScoreResult } from "./score";
import { BOUNDARY_TYPES } from "./score";
import { words } from "./tokens";

export type SignalEval = {
  signal: string;
  predicts: string;
  findings: number;
  located: number;
  tp: number;
  precision: number | null;
  /** errors of the predicted kind the scorer found (in aligned text) */
  errors: number;
  caught: number;
  recall: number | null;
};

const norm = (s: string) => s.replace(/…$/, "").replace(/\s+/g, " ").trim();
const signalText = (raw: string, type: string) => (type === "quote" ? raw.replace(/^>[ \t]?/gm, "") : raw.replace(/^#+\s*/, ""));

export function evaluateSignals(input: QualityInput, result: ScoreResult): SignalEval[] {
  const d = result.detail;
  const blocks = d.ours.body;
  const texts = blocks.map((b) => norm(b.type === "list" || b.type === "contents" ? b.raw : signalText(b.raw, b.type)));
  const bare = texts.map((t) => norm(t.replace(/\[\^\d+(?:-\d+)?\]/g, "")));
  const findBlock = (needle: string, page: number | null, opts: { prefix?: boolean } = {}) => {
    const n = norm(needle).slice(0, 50);
    if (n.length < 4) return -1;
    let best = -1;
    for (let k = 0; k < blocks.length; k++) {
      const hit = opts.prefix ? texts[k].startsWith(n) || bare[k].startsWith(n) : texts[k].includes(n) || bare[k].includes(n);
      if (!hit) continue;
      if (page === null || blocks[k].page === page) return k;
      if (best < 0) best = k;
    }
    return best;
  };
  const inAligned = (k: number) => d.ourBoundary[k] !== "unmapped";

  // scorer error sets
  const spurious = new Set<number>();
  blocks.forEach((_, k) => d.ourBoundary[k] === "spurious" && spurious.add(k));
  const spuriousHead = new Set<number>();
  blocks.forEach((_, k) => d.ourHeadingOk[k] === false && spuriousHead.add(k));
  const noteBody = new Set<number>();
  blocks.forEach((_, k) => d.noteInBody[k] && noteBody.add(k));
  const extraShort = new Set<number>();
  blocks.forEach((b, k) => {
    if (b.type === "paragraph" && d.ourFrac[k] < 0.5 && !d.noteInBody[k] && b.text.split(/\s+/).length <= 12 && words(b.text).length) extraShort.add(k);
  });
  const missedHeadings = d.refBody.map((b, k) => (b.type === "heading" && d.refIncluded[k] && !d.refHeadingHit[k] ? k : -1)).filter((k) => k >= 0);
  const missedMarkers = d.refMarkers.filter((m) => m.outcome === "bare" || m.outcome === "missing");

  const out: SignalEval[] = [];
  const evalBlocks = (id: string, predicts: string, findings: Finding[], locate: (f: Finding) => number, errors: Set<number>) => {
    const located = findings.map(locate);
    const hit = new Set<number>();
    let tp = 0;
    let n = 0;
    located.forEach((k) => {
      if (k < 0) return;
      n++;
      if (errors.has(k)) {
        tp++;
        hit.add(k);
      }
    });
    out.push({ signal: id, predicts, findings: findings.length, located: n, tp, precision: n ? tp / n : null, errors: errors.size, caught: hit.size, recall: errors.size ? hit.size / errors.size : null });
    return hit;
  };

  const run = (id: string) => SIGNALS.find((s) => s.id === id)!.run(input);
  const afterOf = (f: Finding) => {
    const parts = f.excerpt.split(" ⏎ ");
    return findBlock(parts[1] ?? "", f.page, { prefix: true });
  };
  // severed-*: the block after the break should not start a block (a spurious split)
  const severedHits = new Set<number>();
  for (const id of ["severed-into-quote", "severed-paragraph", "severed-paragraph-capital"]) {
    const fs = run(id);
    const located = fs.map(afterOf);
    // severed-paragraph-capital findings can sit on page-break pairs whose "after" block is the real start
    const hit = evalBlocks(id, "spurious split (block start inside a reference block)", fs, (f) => located[fs.indexOf(f)], spurious);
    hit.forEach((k) => severedHits.add(k));
  }
  out.push({ signal: "severed-* (any)", predicts: "spurious split", findings: out.filter((o) => o.signal.startsWith("severed")).reduce((a, o) => a + o.findings, 0), located: out.filter((o) => o.signal.startsWith("severed")).reduce((a, o) => a + o.located, 0), tp: out.filter((o) => o.signal.startsWith("severed")).reduce((a, o) => a + o.tp, 0), precision: null, errors: spurious.size, caught: severedHits.size, recall: spurious.size ? severedHits.size / spurious.size : null });
  const any = out[out.length - 1];
  any.precision = any.located ? any.tp / any.located : null;

  // bare-footnote-marker: a reference marker at that place that we did not link
  {
    const fs = run("bare-footnote-marker");
    const missedPos = missedMarkers.map((m) => m.rpos).sort((a, b) => a - b);
    let located = 0;
    let tp = 0;
    const caught = new Set<number>();
    for (const f of fs) {
      const m = /([a-z\)”"’][.,;:!?])([1-9]\d{0,2})(?=\s|$)/.exec(f.excerpt);
      const k = findBlock(f.excerpt.replace(/^…/, "").slice(0, 30), f.page);
      if (k < 0 || !m) continue;
      located++;
      const at = blocks[k].text.indexOf(m[0]);
      if (at < 0) continue;
      const before = words(blocks[k].text.slice(0, at + 2)).length;
      const opos = d.O.start[k] + before - 1;
      const r = opos >= 0 ? d.body.map[opos] : -1;
      if (r < 0) continue;
      const idx = missedPos.findIndex((p) => Math.abs(p - (r + 1)) <= 3);
      if (idx >= 0) {
        tp++;
        caught.add(missedPos[idx]);
      }
    }
    out.push({ signal: "bare-footnote-marker", predicts: "reference marker we did not link", findings: fs.length, located, tp, precision: located ? tp / located : null, errors: missedMarkers.length, caught: caught.size, recall: missedMarkers.length ? caught.size / missedMarkers.length : null });
  }

  // note-text-in-body: our block is the reference's note text
  {
    const fs = run("note-text-in-body");
    evalBlocks("note-text-in-body", "reference note text in our body", fs, (f) => findBlock(f.excerpt, f.page, { prefix: true }), noteBody);
  }
  // furniture-paragraph: a short paragraph the reference does not have
  {
    const fs = run("furniture-paragraph");
    evalBlocks("furniture-paragraph", "short paragraph not in the reference", fs, (f) => findBlock(f.excerpt.replace(/ \(×\d+\)$/, ""), f.page, { prefix: true }), extraShort);
  }
  // heading signals: our heading is not a reference heading
  const headHits = new Set<number>();
  let hf = 0;
  let hl = 0;
  let htp = 0;
  for (const id of ["heading-long", "heading-function-word", "heading-marker", "heading-repeated"]) {
    const fs = run(id);
    const hit = evalBlocks(id, "spurious heading", fs, (f) => findBlock(f.excerpt.replace(/ \(×\d+\)$/, ""), f.page, { prefix: true }), spuriousHead);
    hit.forEach((k) => headHits.add(k));
    const e = out[out.length - 1];
    hf += e.findings;
    hl += e.located;
    htp += e.tp;
  }
  out.push({ signal: "heading-* (any)", predicts: "spurious heading", findings: hf, located: hl, tp: htp, precision: hl ? htp / hl : null, errors: spuriousHead.size, caught: headHits.size, recall: spuriousHead.size ? headHits.size / spuriousHead.size : null });

  // contents-entry-without-heading: a reference heading we missed
  {
    const fs = run("contents-entry-without-heading");
    const key = (s: string) =>
      s
        .toLowerCase()
        .replace(/^(?:chapter|part|section)?\s*(?:\d+(?:\.\d+)*|[ivxlc]+|[a-z])[.):]?\s+/, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    const missedKeys = new Map<string, number>();
    for (const k of missedHeadings) missedKeys.set(key(d.refBody[k].text), k);
    const allRefHeads = new Set(d.refBody.filter((b) => b.type === "heading").map((b) => key(b.text)));
    let located = 0;
    let tp = 0;
    const caught = new Set<number>();
    for (const f of fs) {
      const kf = key(f.excerpt);
      if (!allRefHeads.has(kf)) continue;
      located++;
      const m = missedKeys.get(kf);
      if (m !== undefined) {
        tp++;
        caught.add(m);
      }
    }
    out.push({ signal: "contents-entry-without-heading", predicts: "reference heading we missed (entry matches a reference heading)", findings: fs.length, located, tp, precision: located ? tp / located : null, errors: missedHeadings.length, caught: caught.size, recall: missedHeadings.length ? caught.size / missedHeadings.length : null });
  }
  void BOUNDARY_TYPES;
  void inAligned;
  return out;
}

const pct = (x: number | null) => (x === null ? "–" : `${(x * 100).toFixed(0)}%`);

export function signalsTable(id: string, evals: SignalEval[]): string {
  const lines = [
    `# b78.2 signals against the scorer: ${id}`,
    "",
    "Precision: of the findings located in our text, the share that are the scorer error the signal predicts. Recall: of the scorer's errors of that kind (in aligned text), the share some finding of the signal hits.",
    "",
    "| signal | predicts | findings | located | precision | scorer errors | caught | recall |",
    "|---|---|---:|---:|---:|---:|---:|---:|",
    ...evals.map((e) => `| ${e.signal} | ${e.predicts} | ${e.findings} | ${e.located} | ${pct(e.precision)} | ${e.errors} | ${e.caught} | ${pct(e.recall)} |`),
    "",
  ];
  return lines.join("\n");
}
