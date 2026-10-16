/* Measures the public highlights feed's cost (reportsthatmatter-bght.10.1, .3): D1 rows read and written per
 * request on the new paths, and CPU time of the verification `POST /api/mark` runs in waitUntil.
 *
 *   pnpm exec tsx scripts/measure-feed.mjs [--runs N]
 *
 * D1: boots miniflare's D1 binding (wrangler's getPlatformProxy) over a throwaway persist dir with this repo's
 * migrations, and runs the real code (recordMarkCounted, publishMark, readFeed) through a wrapper that sums D1's
 * own meta.rows_read / rows_written per statement (local counts may run up to about 2x production's; see PR #294).
 * Nothing remote is touched. CPU: times verifyMark on Node (V8, as Workers; Workers on the free plan will be
 * somewhat slower) for the largest fragment in the corpus (common path: one fragment, no meta) and for a /full
 * mark in the report with the largest meta.json (meta parse + fragment). Needs `pnpm prerender` first.
 */
import "./lib/help.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { getPlatformProxy } from "wrangler";
import { selectorFor } from "../assets/anchor.js";
import { contentFor } from "../src/lib/content.ts";
import { publishMark, readFeed, verifyMark } from "../src/lib/feed.ts";
import { recordMarkCounted } from "../src/lib/marks.ts";
import { extractParagraph } from "../src/templates/report.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const runs = Number(args.includes("--runs") ? args[args.indexOf("--runs") + 1] : 50);
const generated = join(root, "assets/generated/reports");

// ---------- D1 ----------
const persist = mkdtempSync(join(tmpdir(), "rtm-measure-feed-"));
execFileSync("pnpm", ["wrangler", "d1", "migrations", "apply", "reportsthatmatter-marks", "--local", "--persist-to", persist], { cwd: root, stdio: "ignore" });
const { env, dispose } = await getPlatformProxy({ configPath: join(root, "wrangler.toml"), persist: { path: join(persist, "v3") } });

const tally = { read: 0, written: 0, statements: [] };
const counted = {
  prepare(sql) {
    return {
      bind(...values) {
        const statement = env.DB.prepare(sql).bind(...values);
        const note = (meta) => {
          tally.read += meta?.rows_read ?? 0;
          tally.written += meta?.rows_written ?? 0;
          tally.statements.push(`${sql.replace(/\s+/g, " ").slice(0, 60)}… read ${meta?.rows_read} written ${meta?.rows_written}`);
        };
        return {
          async run() { const r = await statement.run(); note(r.meta); return r; },
          async all() { const r = await statement.all(); note(r.meta); return r; },
          async first() { const r = await statement.all(); note(r.meta); return r.results[0] ?? null; },
        };
      },
    };
  },
};
const measure = async (fn) => {
  tally.read = 0; tally.written = 0; tally.statements = [];
  const value = await fn();
  return { value, read: tally.read, written: tally.written, statements: [...tally.statements] };
};

// A real passage: the first long paragraph of jack-smith-vol1's the-law section.
const REPORT = "jack-smith-vol1";
const SECTION = "the-law";
const html = readFileSync(join(generated, REPORT, "fragments", `${SECTION}.html`), "utf8");
const ids = [...html.matchAll(/<p id="([^"]+)"/g)].map((m) => m[1]);
const event = (i, over = {}, from = 1) => {
  const paragraph = ids[i % ids.length];
  const text = extractParagraph(html, paragraph);
  const words = text.split(" ");
  const start = words.slice(0, from).join(" ").length + 1;
  const end = words.slice(0, from + 8).join(" ").length;
  return { report: REPORT, section: SECTION, paragraph, ...selectorFor(text, start, end), page: null, kind: "save", ...over };
};
const pageEnv = { FEED_DELAY_MINUTES: "0" };
const now0 = Date.UTC(2026, 9, 16, 9);
const lines = [];
const say = (line) => { lines.push(line); console.log(line); };

// Background: other readers' marks in the same report, so the indexed reads have something to skip.
for (let i = 0; i < 200; i++) {
  const e = event(i);
  const actor = (i % 50).toString(16).padStart(64, "0");
  const { before } = await recordMarkCounted(counted, e, actor, now0 + i);
  await publishMark(pageEnv, counted, e, actor, before, now0 + i);
}
say("POST /api/mark (recordMark + publishMark), D1 rows per request, local miniflare:");
for (const priorMarks of [0, 5, 39]) {
  const actor = `f${priorMarks}`.padEnd(64, "e");
  for (let i = 0; i < priorMarks; i++) await recordMarkCounted(counted, event(i + 1), actor, now0 + 1000 + i);
  const e = event(priorMarks + 3, {}, 2); // words no earlier mark chose
  const t = now0 + 5000;
  const rec = await measure(() => recordMarkCounted(counted, e, actor, t));
  const pub = await measure(() => publishMark(pageEnv, counted, e, actor, rec.value.before, t));
  say(`  reader with ${priorMarks} earlier marks in the report today: recordMark read ${rec.read} written ${rec.written}; publishMark (${pub.value}) read ${pub.read} written ${pub.written}`);
}
{
  const actor = "d".repeat(64);
  const e = event(7);
  await recordMarkCounted(counted, e, actor, now0 + 9000);
  await publishMark(pageEnv, counted, e, actor, 0, now0 + 9000);
  const rec = await measure(() => recordMarkCounted(counted, { ...e, kind: "share" }, actor, now0 + 9001));
  const pub = await measure(() => publishMark(pageEnv, counted, { ...e, kind: "share" }, actor, rec.value.before, now0 + 9001));
  say(`  the same reader and words again (a save, then a share): publishMark (${pub.value}) read ${pub.read} written ${pub.written}`);
}

say("GET /highlights on a cache miss (readFeed), D1 rows:");
for (const target of [200, 1000, 5000]) {
  const have = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM public_marks").first()).n);
  if (have < target) {
    const statements = [];
    for (let i = have; i < target; i++) {
      statements.push(env.DB.prepare(
        "INSERT INTO public_marks (report, paragraph, slug, section_title, words, anchor, page, created_at, status, reason) VALUES (?, ?, 's', 'S', ?, 'a', NULL, ?, 'visible', '')"
      ).bind(REPORT, `p${i}`, `filler words number ${i} for the table`, now0 + i));
    }
    for (let i = 0; i < statements.length; i += 500) await env.DB.batch(statements.slice(i, i + 500));
  }
  const r = await measure(() => readFeed(counted, pageEnv, now0 + 10 * 86400000));
  say(`  public_marks holds ${target} rows: read ${r.read}, written ${r.written}, ${r.value?.length} passages shown`);
}
await env.DB.prepare("UPDATE public_marks SET status = 'hidden', reason = 'manual'").run();
{
  const r = await measure(() => readFeed(counted, pageEnv, now0 + 10 * 86400000));
  say(`  after pnpm feed hide --all (5000 rows, all hidden): read ${r.read}, ${r.value?.length} passages shown`);
}
await dispose();

// ---------- CPU ----------
const fragments = readdirSync(generated).flatMap((report) =>
  readdirSync(join(generated, report, "fragments")).map((name) => ({ report, slug: name.replace(/\.html$/, ""), size: statSync(join(generated, report, "fragments", name)).size }))
);
const largest = fragments.sort((a, b) => b.size - a.size)[0];
const metas = readdirSync(generated).map((report) => ({ report, size: statSync(join(generated, report, "meta.json")).size }));
const largestMeta = metas.sort((a, b) => b.size - a.size)[0];

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function time(label, content, makeEvent) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    const e = makeEvent();
    const start = performance.now();
    const result = await verifyMark(content, e);
    times.push(performance.now() - start);
    if (!result) throw new Error(`${label}: did not verify`);
  }
  say(`  ${label}: median ${median(times).toFixed(2)} ms, max ${Math.max(...times).toFixed(2)} ms, first ${times[0].toFixed(2)} ms (${runs} runs)`);
}
/** Cache the files in memory, so the timing is the Worker's CPU work, not this machine's disk. */
async function inMemory(report) {
  const disk = await contentFor(undefined, report);
  const cache = new Map();
  return { version: "assets", text: async (path) => (cache.has(path) ? cache.get(path) : (cache.set(path, await disk.text(path)), cache.get(path))) };
}
function lastParagraphEvent(fragment, section) {
  const all = [...fragment.matchAll(/<p id="([^"]+)"/g)].map((m) => m[1]);
  const paragraph = all[all.length - 1];
  const text = extractParagraph(fragment, paragraph);
  const words = text.split(" ");
  return { report: "", section, paragraph, ...selectorFor(text, 0, words.slice(0, Math.min(words.length, 12)).join(" ").length), page: null, kind: "save" };
}

say("verifyMark CPU on Node:");
{
  const content = await inMemory(largest.report);
  const fragment = await content.text(`fragments/${largest.slug}.html`);
  await time(`largest fragment (${largest.report}/${largest.slug}, ${(largest.size / 1e6).toFixed(2)} MB), last paragraph, common path`, content, () => lastParagraphEvent(fragment, largest.slug));
}
{
  const content = await inMemory(largestMeta.report);
  const meta = JSON.parse(await content.text("meta.json"));
  const biggest = meta.sections.map((s) => s.slug).sort((a, b) => statSync(join(generated, largestMeta.report, "fragments", `${b}.html`)).size - statSync(join(generated, largestMeta.report, "fragments", `${a}.html`)).size)[0];
  const fragment = await content.text(`fragments/${biggest}.html`);
  await time(`/full mark (section "") in ${largestMeta.report} (meta.json ${(largestMeta.size / 1e6).toFixed(2)} MB, then ${biggest})`, content, () => lastParagraphEvent(fragment, ""));
}
