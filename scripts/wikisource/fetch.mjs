/* Mirror Wikisource Page: transcriptions into a report repo (reportsthatmatter-7d4y).
 *
 *   node scripts/wikisource/fetch.mjs <report-repo-dir> <us-911-commission|uk-chilcot-inquiry>
 *
 * Polite: one request at a time, 50 pages per request (generator=allpages), a pause between
 * requests, maxlag=5, Retry-After honoured, a descriptive User-Agent. Writes, in
 * <repo>/reference/wikisource/: pages/<n>.wiki (the page's wikitext exactly as served),
 * manifest.json (index, title, page id, revision id and timestamp, proofread quality level,
 * SHA-256 of each file, licence, fetch date). Re-running overwrites; the revision ids pin what was read.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCES = {
  "us-911-commission": {
    index: "Index:The 9-11 Commission Report (Official Government Edition).djvu",
    prefix: "The 9-11 Commission Report (Official Government Edition).djvu/",
    underlying: "Public domain (US government work).",
  },
  "uk-chilcot-inquiry": {
    index: "Index:The Report of the Iraq Inquiry - Executive Summary.pdf",
    prefix: "The Report of the Iraq Inquiry - Executive Summary.pdf/",
    underlying: "Crown copyright, reused under the Open Government Licence v3.0.",
  },
};
const API = "https://en.wikisource.org/w/api.php";
const UA = "reportsthatmatter-research/1.0 (https://reportsthatmatter.org; contact rufus@lifeitself.org)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash("sha256").update(s).digest("hex");

async function call(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params })}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip" } });
    if (res.status === 429 || res.status >= 500) {
      await sleep(Number(res.headers.get("retry-after") ?? 5) * 1000 * (attempt + 1));
      continue;
    }
    const json = await res.json();
    if (json.error?.code === "maxlag") {
      await sleep(5000);
      continue;
    }
    if (json.error) throw new Error(JSON.stringify(json.error));
    return json;
  }
  throw new Error("giving up: " + url);
}

const [repo, id] = process.argv.slice(2);
const src = SOURCES[id];
if (!repo || !src) {
  console.error("usage: node scripts/wikisource/fetch.mjs <report-repo-dir> <" + Object.keys(SOURCES).join("|") + ">");
  process.exit(2);
}
const out = join(repo, "reference", "wikisource");
mkdirSync(join(out, "pages"), { recursive: true });

const pages = [];
let cont = {};
for (;;) {
  const j = await call({
    action: "query",
    generator: "allpages",
    gapnamespace: "104",
    gapprefix: src.prefix,
    gaplimit: "50",
    prop: "revisions|proofread",
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    ...cont,
  });
  for (const p of j.query?.pages ?? []) {
    const rev = p.revisions?.[0];
    const text = rev?.slots?.main?.content ?? "";
    const n = Number(p.title.slice(p.title.lastIndexOf("/") + 1));
    const file = `pages/${n}.wiki`;
    writeFileSync(join(out, file), text);
    pages.push({ n, title: p.title, pageid: p.pageid, revid: rev?.revid, timestamp: rev?.timestamp, quality: p.proofread?.quality ?? null, quality_text: p.proofread?.quality_text ?? null, file, sha256: sha(text), bytes: Buffer.byteLength(text) });
  }
  console.error(`fetched ${pages.length}`);
  if (!j.continue) break;
  cont = j.continue;
  await sleep(1500);
}
pages.sort((a, b) => a.n - b.n);
const manifest = {
  report: id,
  index: src.index,
  index_url: "https://en.wikisource.org/wiki/" + encodeURI(src.index.replace(/ /g, "_")),
  api: API,
  fetched: new Date().toISOString().slice(0, 10),
  user_agent: UA,
  licence: {
    underlying_text: src.underlying,
    transcription: "Wikisource transcription and formatting by volunteers, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); see each page's history at https://en.wikisource.org/w/index.php?title=<title>&action=history. Used here as a measurement reference, not served or redistributed on the site.",
  },
  quality_levels: "0 without text, 1 not proofread, 2 problematic, 3 proofread, 4 validated",
  counts: Object.fromEntries([...new Set(pages.map((p) => p.quality))].sort().map((q) => [`quality_${q}`, pages.filter((p) => p.quality === q).length])),
  pages,
};
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
console.error(JSON.stringify(manifest.counts), pages.length, "pages");
