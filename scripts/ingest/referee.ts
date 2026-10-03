/**
 * The page-break referee (reportsthatmatter-38s.11): fill a report's committed
 * cache of LLM answers for the page breaks the layout rules cannot settle,
 * and measure what it does against the adjudicated page breaks.
 *
 *   pnpm ingest referee <id>... [--model claude-haiku-4-5] [--batch 20] [--images] [--dry-run] [--refer low|medium]
 *                               [--replay <file> | --fake join|split] [--record <file>] [--refresh] [--save-images <dir>]
 *   pnpm ingest referee eval [<id>...|--dev|--holdout] [--answers rules|oracle|invert|cache|replay:<file>|fake:join|fake:split|live]
 *                               [--model …] [--batch 20] [--images] [--record <file>] [--exclude-examples] [--refer low|medium]
 *                               [--verbose] [--show] [--breakdown] [--labels-out <file.jsonl>] [--strict-judge]
 *   pnpm ingest referee draft <id>... [--out <dir>] [--seed s] [--random 15] [--per-tier 5]   draw page breaks for a mini-reference (38s.15)
 *   pnpm ingest referee draft <id>... --verdicts <dir>                                         write <repo>/reference/adjudicated.yaml from the verdicts
 *
 * `referee <id>` runs the report's pipeline with its cache, collects the cases
 * `layoutPageJoins` marked ambiguous, asks the model about the ones the cache
 * has no answer for (until a run asks nothing new: a join can expose another
 * break), and writes `<report repo>/referee/pagebreaks.json` (or the path the
 * report's `pageBreakCache` names). Commit it in the report repo, on a branch.
 * The report reads it only once its `ingest.ts` declares
 * `layoutPageJoins({ referee: pageBreakCache(new URL("./referee/pagebreaks.json", import.meta.url)) })`.
 *
 * `eval` runs each report twice, rules alone and with the answers, and judges
 * both against the adjudicated breaks: the report repo's
 * `reference/adjudicated.yaml` (38s.12), and for held-out reports also the
 * 38s.8 pilot's adjudicated rows (docs/design/learning/results/referee-sonnet-adjudicated.jsonl).
 * It reads which side of each break a printed line ended up on from the
 * pipeline's own blocks (the PDF shadow, for a report served from its clean
 * edition), so it needs no scorer run and no prerender. `--answers`:
 * `rules` (no referee: a determinism check), `oracle` (the adjudicated
 * verdict where there is one: the most a referee could add), `invert` (the
 * opposite of the rules: the worst it could do), `cache` (the report's
 * committed cache), `replay:<file>` (a recording), `live` (the API now;
 * needs credentials, costs money: `--dry-run` first).
 *
 * Live calls go through the Anthropic SDK (ANTHROPIC_API_KEY, or an
 * `ant auth login` profile). Nothing in `pnpm ingest run`/`check` ever calls
 * out: a build reads the committed cache only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  letters,
  describeCase,
  readPageBreakCache,
  writePageBreakCache,
  isCachedReferee,
  refereePageBreaks,
  refereeRequests,
  refereeCost,
  replayTransport,
  recordingTransport,
  REFEREE_EXAMPLES,
  REFEREE_PROMPT_ID,
  type IngestResult,
  type Layout,
  type PageBreakCase,
  type PageBreakReferee,
  type PipelineDef,
  type RefereeContent,
  type RefereeEntry,
  type RefereeTransport,
  type RefereeUsage,
} from "@rtm/ingest";

export type RefereeHost = {
  root: string;
  reportDir(id: string): string;
  loadDefinition(id: string): Promise<PipelineDef>;
  /** Runs the pipeline in memory with this definition (the report's corrections, its layout). */
  run(id: string, def: PipelineDef): IngestResult;
  /** The report's source PDFs, in volume order. */
  pdfs(id: string, def: PipelineDef): string[];
  /** The report's line layout (pdftohtml -xml, cached), for `referee draft`. */
  layout(id: string, def: PipelineDef): Layout;
};

const DEFAULT_MODEL = "claude-haiku-4-5";
const ZERO: RefereeUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

const flag = (args: string[], name: string) => args.includes(`--${name}`);
/** `--refer medium` puts the medium-confidence calls to the referee too; default: what the report declares, else low. */
function referOf(args: string[]): "low" | "medium" | undefined {
  const r = option(args, "refer");
  if (r === undefined) return undefined;
  if (r !== "low" && r !== "medium") throw new Error(`--refer ${r}: low or medium`);
  return r;
}
function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}
function positional(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      if (["model", "batch", "replay", "record", "answers", "refer", "fake", "save-images", "labels-out"].includes(args[i].slice(2))) i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

type LayoutPass = { name: string; referee?: PageBreakReferee; scanned?: boolean; refer?: "low" | "medium" };

/** The report's `layoutPageJoins` pass, and the cache file its referee reads (or would). */
function refereeOf(host: RefereeHost, id: string, def: PipelineDef): { pass?: LayoutPass; path: string; declared: boolean } {
  const pass = (def.passes as unknown as LayoutPass[]).find((p) => p.name === "layoutPageJoins");
  const declared = isCachedReferee(pass?.referee);
  const path = declared ? (pass!.referee as unknown as { path: string }).path : join(host.reportDir(id), "referee", "pagebreaks.json");
  return { pass, path, declared };
}

/** The definition with `layoutPageJoins`'s referee replaced by one answering from `answers`, recording what it is asked. */
function withReferee(def: PipelineDef, answers: (c: PageBreakCase) => boolean | undefined, asked: Map<string, PageBreakCase>, refer?: "low" | "medium"): PipelineDef {
  const referee: PageBreakReferee = (c) => {
    if (!asked.has(c.key)) asked.set(c.key, c);
    return answers(c);
  };
  const passes = (def.passes as unknown as LayoutPass[]).map((p) => (p.name === "layoutPageJoins" ? { ...p, referee, refer: refer ?? p.refer ?? "low" } : p));
  return { ...def, passes } as unknown as PipelineDef;
}

// ---------------------------------------------------------------------------
// Transports

async function liveTransport(model: string): Promise<RefereeTransport> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  // Haiku 4.5 takes neither effort nor adaptive thinking; the 5.x models think by default, so keep it short.
  const thinks = !model.startsWith("claude-haiku");
  return async (request) => {
    const body = thinks
      ? { ...request, max_tokens: Math.max(4000, request.max_tokens), output_config: { ...request.output_config, effort: "low" } }
      : request;
    // The request is the Messages API body; RefereeRequest is its structural subset.
    const response = await client.messages.create(body as unknown as Parameters<typeof client.messages.create>[0] & { stream?: false });
    if (response.stop_reason === "refusal") return { text: "", usage: response.usage as Partial<RefereeUsage> };
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { text, usage: response.usage as Partial<RefereeUsage> };
  };
}

/**
 * A fake referee for testing the plumbing offline: answers every case JOIN or SPLIT, and reports usage as
 * the request's size (about 3.5 characters a token) so the cost line is exercised. Record it with
 * `--record`, then `--replay` the recording: the same path a live run takes, with no key.
 */
function fakeTransport(answer: string): RefereeTransport {
  if (answer !== "join" && answer !== "split") throw new Error(`--fake ${answer}: join or split`);
  return async (request) => {
    const texts = request.messages[0].content.flatMap((c) => (c.type === "text" ? [c.text] : []));
    const ids = texts.flatMap((t) => [...t.matchAll(/^Case (c\d+):\n/g)].map((m) => m[1]));
    const chars = texts.join("").length + request.system.reduce((n, b) => n + b.text.length, 0);
    return {
      text: JSON.stringify({ answers: ids.map((id) => ({ id, answer: answer.toUpperCase() })) }),
      usage: { input_tokens: Math.round(chars / 3.5), output_tokens: 12 * ids.length },
    };
  };
}

async function transportFor(args: string[], model: string, live: boolean): Promise<RefereeTransport | undefined> {
  const replay = option(args, "replay");
  const fake = option(args, "fake");
  let transport: RefereeTransport | undefined = replay ? replayTransport(replay) : fake ? fakeTransport(fake) : live ? await liveTransport(model) : undefined;
  const record = option(args, "record");
  if (transport && record) transport = recordingTransport(transport, record);
  return transport;
}

/** Crops of the two page edges either side of the break, at the layout's own scale (pdftohtml -xml is 1.5 × 72 dpi). */
function imagesFor(pdfs: string[], save?: string): (c: PageBreakCase) => RefereeContent[] | undefined {
  const crop = (pdf: string, page: number, top: number, bottom: number, width: number): string => {
    const y = Math.max(0, Math.floor(top));
    const h = Math.max(1, Math.ceil(bottom - y));
    const png = execFileSync("pdftoppm", ["-f", String(page), "-l", String(page), "-r", "108", "-x", "0", "-y", String(y), "-W", String(Math.ceil(width)), "-H", String(h), "-png", "-singlefile", pdf], {
      maxBuffer: 64 * 1024 * 1024,
    });
    return png.toString("base64");
  };
  return (c) => {
    const { prev, next, under, prevPage } = c.lines;
    const pdfPrev = pdfs[prev.volume - 1];
    const pdfNext = pdfs[next.volume - 1];
    if (!pdfPrev || !pdfNext) return undefined;
    const above = prevPage.lines.filter((l) => l.index < prev.index).slice(-3)[0] ?? prev;
    const low = under ?? next;
    try {
      const foot = crop(pdfPrev, prev.page, above.top - 4, prev.top + prev.height + 6, prev.pageWidth);
      const head = crop(pdfNext, next.page, next.top - 6, low.top + 2.5 * low.height + 4, next.pageWidth);
      if (save) {
        mkdirSync(save, { recursive: true });
        writeFileSync(join(save, `${c.key}-a-p${prev.page}.png`), Buffer.from(foot, "base64"));
        writeFileSync(join(save, `${c.key}-b-p${next.page}.png`), Buffer.from(head, "base64"));
      }
      return [
        { type: "image", source: { type: "base64", media_type: "image/png", data: foot } },
        { type: "image", source: { type: "base64", media_type: "image/png", data: head } },
      ];
    } catch (error) {
      console.warn(`  no image crops for p.${next.page}: ${String(error).slice(0, 120)}`);
      return undefined;
    }
  };
}

/**
 * A rough usage for a dry run: about 3.5 characters a token, and the shared prefix (instructions and
 * examples, ≈3,000 tokens) paid in full on every call: it is under Haiku 4.5's minimum cacheable
 * prefix, so the estimate does not count on caching.
 */
function estimate(cases: PageBreakCase[], model: string, batch: number): RefereeUsage {
  const usage = { ...ZERO };
  refereeRequests(cases, { model, batch }).forEach(({ ids, request }, i) => {
    const prefix = request.system.reduce((n, b) => n + b.text.length, 0) / 3.5;
    const rest = request.messages[0].content.reduce((n, b) => n + (b.type === "text" ? b.text.length : 0), 0) / 3.5;
    void i;
    usage.input_tokens += Math.round(prefix + rest);
    usage.output_tokens += 12 * ids.size + 10;
  });
  return usage;
}

const dollars = (n: number | undefined) => (n === undefined ? "?" : `$${n.toFixed(4)}`);
const add = (a: RefereeUsage, b: RefereeUsage) => {
  for (const k of Object.keys(ZERO) as Array<keyof RefereeUsage>) a[k] += b[k];
};

// ---------------------------------------------------------------------------
// pnpm ingest referee <id>

async function fill(host: RefereeHost, args: string[]): Promise<number> {
  const ids = positional(args);
  if (!ids.length) {
    console.error("Usage: pnpm ingest referee <id>... [--model M] [--dry-run] [--replay F] [--record F] [--images] [--refresh]");
    return 1;
  }
  // A fake answers as "fake-join" / "fake-split", so its entries never pass for a model's.
  const model = option(args, "fake") ? `fake-${option(args, "fake")}` : option(args, "model") ?? DEFAULT_MODEL;
  const batch = Number(option(args, "batch") ?? 20);
  const dry = flag(args, "dry-run");
  const transport = dry ? undefined : await transportFor(args, model, true);
  let code = 0;
  for (const id of ids) {
    const def = await host.loadDefinition(id);
    const { pass, path, declared } = refereeOf(host, id, def);
    if (!pass) {
      console.error(`  ${id}: does not declare layoutPageJoins; nothing to referee`);
      code = 1;
      continue;
    }
    const entries = readPageBreakCache(path);
    const stale = (e: RefereeEntry) => flag(args, "refresh") && e.by !== "human" && e.prompt !== REFEREE_PROMPT_ID;
    const usage = { ...ZERO };
    let calls = 0;
    let added = 0;
    let asked = new Map<string, PageBreakCase>();
    for (let round = 1; round <= 3; round++) {
      asked = new Map();
      host.run(id, withReferee(def, (c) => entries.get(c.key)?.join, asked, referOf(args)));
      const todo = [...asked.values()].filter((c) => !entries.has(c.key) || stale(entries.get(c.key)!));
      if (!todo.length) break;
      if (dry) {
        const u = estimate(todo, model, batch);
        console.log(`  ${id}: ${asked.size} page breaks put to the referee, ${todo.length} to ask, ${Math.ceil(todo.length / batch)} calls, about ${dollars(refereeCost(model, u))} with ${model} (estimate; a join can expose more)`);
        break;
      }
      const run = await refereePageBreaks(todo, transport!, { model, batch, ...(flag(args, "images") ? { images: imagesFor(host.pdfs(id, def), option(args, "save-images")) } : {}) });
      for (const [k, e] of run.entries) entries.set(k, e);
      add(usage, run.usage);
      calls += run.calls;
      added += run.entries.size;
      if (run.unanswered.length) console.warn(`  ${id}: ${run.unanswered.length} cases got no usable answer (they keep the rules' call)`);
      if (!run.entries.size) break;
    }
    if (dry) continue;
    const unused = [...entries.keys()].filter((k) => !asked.has(k)).length;
    const flips = [...asked.keys()].filter((k) => entries.has(k) && entries.get(k)!.join !== (entries.get(k)!.rules === "join")).length;
    if (added) writePageBreakCache(path, entries);
    console.log(
      `  ${id}: ${asked.size} page breaks put to the referee, ${added} answered now in ${calls} calls (${dollars(refereeCost(model, usage))}), ` +
        `${flips} overrule the rules; ${unused} cached answers not asked any more${added ? `; wrote ${path}` : ""}`
    );
    if (!declared) console.log(`      ${id}'s ingest.ts does not read the cache yet: declare layoutPageJoins({ referee: pageBreakCache(new URL("./referee/pagebreaks.json", import.meta.url)) })`);
  }
  return code;
}

// ---------------------------------------------------------------------------
// pnpm ingest referee eval

type Label = {
  page: number;
  prev: string;
  next: string;
  join: boolean;
  source: "adjudicated" | "pilot";
  /** A mini-reference's own split of its breaks (38s.15): `dev` or `held-out`; otherwise the report's set decides. */
  set?: "dev" | "held-out";
  /** The layout rules' confidence tier when the break was drawn, and how it was drawn (38s.15). */
  tier?: string;
  stratum?: string;
  /** What stands between the two halves on the page (notes, caption, heading…), as the adjudicator saw it. */
  between?: string;
  /** The line above a short `prev`, so it can be found in the output. */
  above?: string;
  /** false: the adjudicator was not sure (block-style paragraphs, a new paragraph inside a quotation). */
  sure?: boolean;
};

function loadLabels(host: RefereeHost, id: string, heldOut: boolean): Label[] {
  const labels: Label[] = [];
  const file = join(host.reportDir(id), "reference", "adjudicated.yaml");
  if (existsSync(file)) {
    const f = parseYaml(readFileSync(file, "utf8")) as {
      breaks?: Array<{ page: number; prev: string; next: string; verdict: string; set?: string; tier?: string; stratum?: string; between?: string; above?: string; sure?: boolean }>;
    };
    for (const b of f.breaks ?? []) {
      if (b.verdict !== "join" && b.verdict !== "split") continue;
      const label: Label = { page: Number(b.page), prev: String(b.prev), next: String(b.next), join: b.verdict === "join", source: "adjudicated" };
      if (b.set === "dev" || b.set === "held-out") label.set = b.set;
      if (b.tier) label.tier = b.tier;
      if (b.stratum) label.stratum = b.stratum;
      if (b.between) label.between = b.between;
      if (b.above) label.above = String(b.above);
      if (b.sure === false) label.sure = false;
      labels.push(label);
    }
  }
  // The 38s.8 pilot adjudicated held-out rows too (truth J/S; X dropped). Same pages, same line snippets.
  const pilot = join(host.root, "docs/design/learning/results/referee-sonnet-adjudicated.jsonl");
  if (heldOut && existsSync(pilot)) {
    for (const line of readFileSync(pilot, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as { report: string; next_page: number; prev_text: string; next_text: string; truth: string };
      if (r.report !== id || (r.truth !== "J" && r.truth !== "S")) continue;
      const dup = labels.some((l) => l.page === r.next_page && letters(l.next).slice(0, 20) === letters(r.next_text).slice(0, 20));
      if (!dup) labels.push({ page: r.next_page, prev: r.prev_text, next: r.next_text, join: r.truth === "J", source: "pilot" });
    }
  }
  return labels;
}

/** The text units of the output in order: paragraphs, headings, quotations, contents entries, list items. */
function units(result: IngestResult): string[] {
  const blocks = (result.shadow ?? result).blocks ?? [];
  return blocks.flatMap((b) => (b.kind === "page" ? [] : b.kind === "list" ? b.items.map(letters) : [letters(b.text)]));
}

/**
 * Which side of the break the output put the two lines on: true (one unit),
 * false (the next line opens a later unit), or undefined (not found).
 *
 * `label.above` (a mini-reference's line above a short last line, 38s.15) is
 * matched with it, so "failed.481" can be found. A heading's label may be
 * dropped in the output ("(iv) Firm-Wide…" is "#### Firm-Wide…"), so the next
 * line is also tried without it. When the strict reading finds nothing (the
 * last line not at the end of its unit, or the next line not at the head of
 * one), a second pass accepts the next line anywhere in the six units after:
 * the output did not run the paragraph on, which is a split.
 */
function judge(text: string[], label: Label, strictOnly = false): boolean | undefined {
  return placed(text, label, strictOnly)?.join;
}

/** `judge`, with how many of our units stand between the two lines when they are apart (0: the next unit). */
function placed(text: string[], label: Label, strictOnly = false): { join: boolean; gap: number } | undefined {
  const p = letters(`${label.above ?? ""} ${label.prev}`);
  const nexts = [letters(label.next).slice(0, 30), letters(label.next.replace(/^\s*(?:\(?[0-9]{1,3}[.)]|\([a-z]{1,4}\)|[ivxlc]{1,5}[.)]|[A-Za-z][.)]|[•·▪–-])\s+/, "")).slice(0, 30)].filter((n, i, all) => n.length >= 6 && all.indexOf(n) === i);
  if (p.length < 8 || !nexts.length) return undefined;
  for (const strict of strictOnly ? [true] : [true, false]) {
    for (let i = 0; i < text.length; i++) {
      let at = text[i].indexOf(p);
      while (at !== -1) {
        const after = text[i].slice(at + p.length);
        if (nexts.some((n) => after.slice(0, 40).includes(n))) return { join: true, gap: 0 };
        if (!strict || after.length < 12) {
          for (let j = i + 1; j < Math.min(text.length, i + 6); j++) {
            if (nexts.some((n) => (strict ? text[j].slice(0, 40) : text[j]).includes(n))) return { join: false, gap: j - i - 1 + (strict ? 0 : 1) };
          }
        }
        at = text[i].indexOf(p, at + 1);
      }
    }
  }
  return undefined;
}

const ENDS_SENTENCE = /[.?!:;]["'\u201d\u2019)\]]*(?:\s?\d{1,4})?\s*$/;
/**
 * What kind of error a wrong call at an adjudicated break is, for `--breakdown` (38s.15): a missed join
 * by what stands between the halves or by the shape of the two lines (the 38s.8 clusters), a wrong join
 * by how the new block opens.
 */
export function errorKind(l: Pick<Label, "prev" | "next" | "join" | "between">, gap = 0): string {
  const next = l.next.trim();
  if (l.join) {
    // Something of ours stands between the halves (a note, caption or credit left in the body, text out of order): upstream of the join decision.
    if (gap > 0) return `missed join: ${l.between && l.between !== "none" ? l.between : "something"} left between in our text`;
    // Footnotes at the page foot are routine (most of these reports have them on every page): a kind by the lines' shape.
    if (l.between && l.between !== "none" && l.between !== "notes") return `missed join: ${l.between} between`;
    if (ENDS_SENTENCE.test(l.prev.trim())) return "missed join: runs on after a finished sentence";
    if (/^[a-z,;]/.test(next)) return "missed join: lower-case continuation";
    if (/^[\d(\[“"‘'$]/.test(next)) return "missed join: digit, bracket or quotation mark opens";
    return "missed join: capital after an unfinished sentence";
  }
  if (/^(?:\d{1,4}(?:\.\d{1,4})*[.)]?|[a-z][.)]|[A-Z]\.|[ivxlc]{1,5}[.)]|\([a-z0-9]{1,4}\)|[•·▪–-])\s/.test(next)) return "wrong join: into a label or numbered paragraph";
  if (/^[“"‘']/.test(next)) return "wrong join: into a quotation";
  if (ENDS_SENTENCE.test(l.prev.trim())) return "wrong join: after a finished sentence";
  return "wrong join: after an unfinished line";
}

/** Why `judge` could not place a label: for `--verbose`, so a mini-reference's unjudged breaks can be fixed. */
function whyUnjudged(text: string[], label: Label): string {
  const p = letters(`${label.above ?? ""} ${label.prev}`);
  const n = letters(label.next).slice(0, 30);
  if (p.length < 8 || n.length < 6) return `line too short to find (prev ${p.length} letters, next ${n.length})`;
  const pi = text.findIndex((u) => u.includes(p));
  const ni = text.findIndex((u) => u.includes(n));
  const at = (i: number, needle: string) => (i === -1 ? "not found" : `unit ${i} at ${text[i].indexOf(needle)} of ${text[i].length}`);
  return `prev ${at(pi, p)}; next ${at(ni, n)}${pi !== -1 ? `; after prev: "${text[pi].slice(text[pi].indexOf(p) + p.length, text[pi].indexOf(p) + p.length + 40)}"` : ""}`;
}

/** The case an adjudicated break is about, if one was asked: same new page, the same line opening it and the same line ending the old one. */
function caseFor(cases: PageBreakCase[], label: Label): PageBreakCase | undefined {
  const n = letters(label.next).slice(0, 20);
  const p = letters(label.prev).slice(-20);
  if (n.length < 6) return undefined;
  return cases.find((c) => {
    if (c.lines.next.page !== label.page) return false;
    const cn = letters(c.lines.next.text);
    const cp = letters(c.lines.prev.text);
    const nextMatches = cn.startsWith(n) || (cn.length >= 6 && n.startsWith(cn.slice(0, 20)));
    const prevMatches = p.length < 6 || cp.endsWith(p) || (cp.length >= 6 && p.endsWith(cp.slice(-20)));
    return nextMatches && prevMatches;
  });
}

type Tally = {
  reports: number;
  judged: number;
  wrongBefore: number;
  wrongAfter: number;
  asked: number;
  answered: number;
  overruled: number;
  ambiguousLabelled: number;
  rulesRight: number;
  refereeRight: number;
  calls: number;
  usage: RefereeUsage;
  estimate: RefereeUsage;
};
const tally = (): Tally => ({ reports: 0, judged: 0, wrongBefore: 0, wrongAfter: 0, asked: 0, answered: 0, overruled: 0, ambiguousLabelled: 0, rulesRight: 0, refereeRight: 0, calls: 0, usage: { ...ZERO }, estimate: { ...ZERO } });

async function evaluate(host: RefereeHost, args: string[]): Promise<number> {
  const sets = parseYaml(readFileSync(join(host.root, "reports/score-sets.yaml"), "utf8")) as { development: string[]; held_out: string[]; mini_references?: string[] };
  // Mini-references (38s.15) split their own breaks: --dev reads their dev half, --holdout their held-out half.
  const mini = sets.mini_references ?? [];
  let ids = positional(args).filter((a) => a !== "eval");
  if (flag(args, "dev")) ids = [...ids, ...sets.development, ...mini];
  if (flag(args, "holdout")) ids = [...ids, ...sets.held_out, ...mini];
  if (!ids.length) ids = [...sets.development, ...sets.held_out, ...mini];
  ids = [...new Set(ids)];
  const wantSet = flag(args, "dev") && !flag(args, "holdout") ? "dev" : flag(args, "holdout") && !flag(args, "dev") ? "held-out" : undefined;
  const source = option(args, "answers") ?? "rules";
  const model = source.startsWith("fake:") ? `fake-${source.slice(5)}` : option(args, "model") ?? DEFAULT_MODEL;
  const batch = Number(option(args, "batch") ?? 20);
  const exampleKeys = new Set(REFEREE_EXAMPLES.map((x) => x.key));
  const transport =
    source === "live" ? await transportFor(args, model, true)
    : source.startsWith("replay:") ? await transportFor(["--replay", source.slice(7), ...args], model, false)
    : source.startsWith("fake:") ? await transportFor(["--fake", source.slice(5), ...args], model, false)
    : undefined;

  const totals = { dev: tally(), "held-out": tally() } as Record<string, Tally>;
  const breakdown = new Map<string, { cases: number; labelled: number; rulesWrong: number }>();
  // 38s.15: per tier and per error kind, over the adjudicated breaks (by set), and every label's outcome for --labels-out.
  const byTier = new Map<string, { judged: number; wrongBefore: number; wrongAfter: number }>();
  const byKind = new Map<string, { before: number; after: number }>();
  const labelRows: string[] = [];
  const rows: string[] = [];
  for (const id of ids) {
    const set = sets.held_out.includes(id) ? "held-out" : sets.development.includes(id) ? "dev" : "other";
    const def = await host.loadDefinition(id);
    const { pass, path } = refereeOf(host, id, def);
    if (!pass) {
      console.error(`  ${id}: no layoutPageJoins; skipped`);
      continue;
    }
    const labels = loadLabels(host, id, set === "held-out").filter((l) => !l.set || !wantSet || l.set === wantSet);

    // Rules alone.
    const asked = new Map<string, PageBreakCase>();
    const before = units(host.run(id, withReferee(def, () => undefined, asked, referOf(args))));
    let cases = [...asked.values()];
    if (flag(args, "exclude-examples")) cases = cases.filter((c) => !exampleKeys.has(c.key));

    // The answers.
    const answers = new Map<string, boolean>();
    const t = totals[set] ?? (totals[set] = tally());
    if (source === "oracle") {
      for (const l of labels) {
        const c = caseFor(cases, l);
        if (c) answers.set(c.key, l.join);
      }
    } else if (source === "invert") {
      for (const c of cases) answers.set(c.key, !c.decision.join);
    } else if (source === "cache") {
      for (const [k, e] of readPageBreakCache(path)) answers.set(k, e.join);
    } else if (transport) {
      const run = await refereePageBreaks(cases, transport, { model, batch, ...(flag(args, "images") ? { images: imagesFor(host.pdfs(id, def), option(args, "save-images")) } : {}) });
      for (const [k, e] of run.entries) answers.set(k, e.join);
      t.calls += run.calls;
      add(t.usage, run.usage);
    } else if (source !== "rules") {
      console.error(`Unknown --answers ${source}`);
      return 1;
    }
    const after = units(host.run(id, withReferee(def, (c) => (cases.some((x) => x.key === c.key) ? answers.get(c.key) : undefined), new Map(), referOf(args))));

    // A mini-reference splits its own breaks into dev and held-out (38s.15): those are tallied apart, as "<set> (PDF-only)".
    const perSet = new Map<string, { judged: number; wrongBefore: number; wrongAfter: number; ambiguousLabelled: number; rulesRight: number; refereeRight: number }>();
    const setOf = (l: Label) => (l.set ? `${l.set} (PDF-only)` : set);
    const flips: string[] = [];
    for (const l of labels) {
      // --strict-judge: the reading before 38s.15 (no second pass), to compare with numbers recorded before it.
      const strictJudge = flag(args, "strict-judge");
      const b = judge(before, l, strictJudge);
      const a = judge(after, l, strictJudge);
      if (flag(args, "verbose") && (b === undefined || b !== l.join)) {
        const c = [...asked.values()].find((x) => caseFor([x], l));
        if (c && flag(args, "show")) console.log(describeCase(c));
        console.log(`  ${id} p.${l.page} ${l.source} truth ${l.join ? "join" : "split"}, ours ${b === undefined ? "unjudged" : b ? "join" : "split"}${c ? ` [ambiguous: ${c.decision.rule} ${c.decision.reason}]` : ""}: "${l.prev.trim().slice(-45)}" / "${l.next.trim().slice(0, 45)}"`);
      }
      const c = caseFor(cases, l);
      const gb = placed(before, l, strictJudge)?.gap ?? 0;
      const ga = placed(after, l, strictJudge)?.gap ?? 0;
      if (option(args, "labels-out"))
        labelRows.push(JSON.stringify({ report: id, set: setOf(l), page: l.page, stratum: l.stratum, tier: l.tier, between: l.between, sure: l.sure !== false, truth: l.join ? "join" : "split", before: b === undefined ? null : b ? "join" : "split", after: a === undefined ? null : a ? "join" : "split", referred: c ? `${c.decision.confidence} ${c.decision.rule}: ${c.decision.reason}` : null, gap_before: gb, gap_after: ga, kind_before: errorKind(l, gb), kind_after: errorKind(l, ga), prev: l.prev, next: l.next }));
      if (b === undefined && flag(args, "verbose")) console.log(`      unjudged: ${whyUnjudged(before, l)}`);
      if (b === undefined || a === undefined) continue;
      const k = setOf(l);
      const s = perSet.get(k) ?? { judged: 0, wrongBefore: 0, wrongAfter: 0, ambiguousLabelled: 0, rulesRight: 0, refereeRight: 0 };
      perSet.set(k, s);
      s.judged++;
      if (b !== l.join) s.wrongBefore++;
      if (a !== l.join) s.wrongAfter++;
      if (l.tier) {
        const tk = `${k} | ${l.tier}`;
        const t = byTier.get(tk) ?? { judged: 0, wrongBefore: 0, wrongAfter: 0 };
        byTier.set(tk, t);
        t.judged++;
        if (b !== l.join) t.wrongBefore++;
        if (a !== l.join) t.wrongAfter++;
      }
      const bump = (kind: string, side: "before" | "after") => {
        const ek = `${k} | ${kind}`;
        const e = byKind.get(ek) ?? { before: 0, after: 0 };
        byKind.set(ek, e);
        e[side]++;
      };
      if (b !== l.join) bump(errorKind(l, gb), "before");
      if (a !== l.join) bump(errorKind(l, ga), "after");
      if (c) {
        s.ambiguousLabelled++;
        if (c.decision.join === l.join) s.rulesRight++;
        if ((answers.get(c.key) ?? c.decision.join) === l.join) s.refereeRight++;
      }
      if (a !== b) flips.push(`      p.${l.page} ${b ? "join" : "split"} → ${a ? "join" : "split"} (truth ${l.join ? "join" : "split"}, ${l.source}): "${l.prev.trim().slice(-40)}" / "${l.next.trim().slice(0, 40)}"`);
    }
    if (flag(args, "breakdown")) {
      for (const c of cases) {
        const r = `${c.decision.rule} ${c.decision.reason}${c.decision.ambiguous ? " (ambiguous)" : ""}`;
        const row = breakdown.get(r) ?? { cases: 0, labelled: 0, rulesWrong: 0 };
        row.cases++;
        const l = labels.find((x) => caseFor([c], x));
        if (l) {
          row.labelled++;
          if (c.decision.join !== l.join) row.rulesWrong++;
        }
        breakdown.set(r, row);
      }
    }
    const answered = cases.filter((c) => answers.has(c.key)).length;
    const overruled = cases.filter((c) => answers.has(c.key) && answers.get(c.key) !== c.decision.join).length;
    if (!perSet.size) perSet.set(set, { judged: 0, wrongBefore: 0, wrongAfter: 0, ambiguousLabelled: 0, rulesRight: 0, refereeRight: 0 });
    let first = true;
    for (const [k, s] of perSet) {
      // The referral counts are the report's, whichever of its sets they are listed under: count them once.
      const tk = totals[k] ?? (totals[k] = tally());
      rows.push(
        `| ${id} | ${k} | ${s.judged} | ${s.wrongBefore} | ${s.wrongAfter} | ${first ? cases.length : ""} | ${first ? answered : ""} | ${first ? overruled : ""} | ${s.ambiguousLabelled} | ${s.rulesRight} | ${s.refereeRight} |`
      );
      tk.judged += s.judged;
      tk.wrongBefore += s.wrongBefore;
      tk.wrongAfter += s.wrongAfter;
      tk.ambiguousLabelled += s.ambiguousLabelled;
      tk.rulesRight += s.rulesRight;
      tk.refereeRight += s.refereeRight;
      if (first) {
        tk.answered += answered;
        tk.overruled += overruled;
        tk.asked += cases.length;
        add(tk.estimate, estimate(cases, model, batch));
        if (tk !== t) {
          tk.calls += t.calls;
          add(tk.usage, t.usage);
          t.calls = 0;
          Object.assign(t.usage, ZERO);
        }
      }
      tk.reports += 1;
      first = false;
    }
    if (flips.length && flag(args, "verbose")) rows.push(...flips.map((f) => `<!-- ${f.trim()} -->`));
  }

  console.log(`\nPage-break referee, answers: ${source}${transport ? ` (${model})` : ""}; prompt ${REFEREE_PROMPT_ID}\n`);
  console.log("| report | set | adjudicated breaks judged | ours wrong, rules | ours wrong, with referee | breaks referred | answered | overruled | referred ∩ adjudicated | rules right there | referee right there |");
  console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of rows) console.log(r);
  for (const [set, t] of Object.entries(totals)) {
    if (!t.reports) continue;
    console.log(`| **${set}** | | ${t.judged} | ${t.wrongBefore} (${pct(1 - t.wrongBefore / t.judged)} right) | ${t.wrongAfter} (${pct(1 - t.wrongAfter / t.judged)} right) | ${t.asked} | ${t.answered} | ${t.overruled} | ${t.ambiguousLabelled} | ${t.rulesRight} | ${t.refereeRight} |`);
  }
  for (const [set, t] of Object.entries(totals)) {
    if (t.calls) console.log(`\n${set}: ${t.calls} calls, ${t.usage.input_tokens} input + ${t.usage.cache_read_input_tokens} cache-read + ${t.usage.cache_creation_input_tokens} cache-write + ${t.usage.output_tokens} output tokens, ${dollars(refereeCost(model, t.usage))} (${dollars((refereeCost(model, t.usage) ?? 0) / Math.max(1, t.answered))} a decision)`);
    if (t.asked) {
      const est = (m: string) => dollars(refereeCost(m, t.estimate));
      console.log(`${set}: ${t.asked} breaks referred in ${t.reports} reports; estimated at list price (≈3.5 characters a token, ${batch} a call, no prompt caching): ${est("claude-haiku-4-5")} with claude-haiku-4-5, ${est("claude-sonnet-5-5")} with claude-sonnet-5-5 (before thinking tokens)`);
    }
  }
  if (byTier.size) {
    console.log("\nAdjudicated breaks by the rules' confidence tier when drawn (38s.15 mini-references):\n\n| set | tier | judged | ours wrong, rules | ours wrong, with referee |\n|---|---|---:|---:|---:|");
    for (const [k, v] of [...byTier].sort((a, b) => a[0].localeCompare(b[0]))) {
      const [s, tier] = k.split(" | ");
      console.log(`| ${s} | ${tier} | ${v.judged} | ${v.wrongBefore} | ${v.wrongAfter} |`);
    }
  }
  if (flag(args, "breakdown") && byKind.size) {
    console.log("\nOur errors at adjudicated breaks, by kind:\n\n| set | kind | rules | with referee |\n|---|---|---:|---:|");
    for (const [k, v] of [...byKind].sort((a, b) => a[0].localeCompare(b[0]) || b[1].before - a[1].before)) {
      const [s, kind] = k.split(" | ");
      console.log(`| ${s} | ${kind} | ${v.before} | ${v.after} |`);
    }
  }
  const labelsOut = option(args, "labels-out");
  if (labelsOut) {
    writeFileSync(labelsOut, labelRows.join("\n") + "\n");
    console.log(`\n${labelRows.length} adjudicated breaks, with our call before and after, → ${labelsOut}`);
  }
  if (breakdown.size) {
    console.log("\n| rules' call | cases | adjudicated | rules wrong |\n|---|---:|---:|---:|");
    for (const [r, v] of [...breakdown].sort((a, b) => b[1].cases - a[1].cases)) console.log(`| ${r} | ${v.cases} | ${v.labelled} | ${v.rulesWrong} |`);
  }
  for (const [k, held] of Object.entries(totals)) {
    if (k.startsWith("held-out") && held.reports && held.wrongAfter > held.wrongBefore) {
      console.error(`\n✗ ${k}: ${held.wrongAfter - held.wrongBefore} more adjudicated breaks wrong with the referee than without`);
      return 1;
    }
  }
  return 0;
}

const pct = (x: number) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : "–");

export async function runReferee(args: string[], host: RefereeHost): Promise<number> {
  if (args[0] === "eval") return evaluate(host, args.slice(1));
  if (args[0] === "draft") return (await import("./pagebreak-sample")).runDraft(host, args.slice(1));
  return fill(host, args);
}

