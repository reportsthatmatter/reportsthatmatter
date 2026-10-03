/**
 * Parse granite-docling DocTags (one page) into typed blocks, and find the footnote markers the model
 * left in the body text (reportsthatmatter-kyj3). The model writes a marker as digits glued to the
 * word or punctuation before it ("untested.88"), or set off by a space ("\"patriots\" 135"), so a
 * marker is only recognised for a label the page's own footnotes define, in increasing order.
 */
import { tokens } from "../score/tokens";

export type VisionBlockType = "heading" | "paragraph" | "list_item" | "footnote" | "furniture" | "other";

export type VisionBlock = {
  type: VisionBlockType;
  /** heading level (1 for title / section_header_level_1, ...) */
  level?: number;
  /** the tag the model used */
  tag: string;
  text: string;
  /** loc_ box (0-500 grid): left, top, right, bottom */
  box: [number, number, number, number] | null;
  /** footnote blocks: the label opening the note */
  label?: string;
  /** body blocks: markers found in `text` as [label, character offset of the label's digits] */
  markers: { label: string; offset: number }[];
};

const TAGS: Record<string, [VisionBlockType, number?]> = {
  text: ["paragraph"],
  title: ["heading", 1],
  list_item: ["list_item"],
  footnote: ["footnote"],
  page_header: ["furniture"],
  page_footer: ["furniture"],
  caption: ["paragraph"],
  formula: ["other"],
  code: ["other"],
  picture: ["other"],
  logo: ["other"],
  chart: ["other"],
  table: ["other"],
  otsl: ["other"],
  checkbox_selected: ["other"],
  checkbox_unselected: ["other"],
};

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function parseDoctags(doctags: string): VisionBlock[] {
  const out: VisionBlock[] = [];
  const re = /<([a-z_0-9]+)>((?:<loc_\d+>)*)([\s\S]*?)<\/\1>/g;
  // container tags hold other blocks: a lazy match on <unordered_list> would swallow every list item inside it
  for (const m of doctags.replace(/<\/?(?:doctag|unordered_list|ordered_list|list|group|inline)>/g, "").matchAll(re)) {
    const tag = m[1];
    let type: VisionBlockType;
    let level: number | undefined;
    const sh = /^section_header_level_(\d+)$/.exec(tag);
    if (sh) {
      type = "heading";
      level = Number(sh[1]) + 1;
    } else if (tag === "section_header") {
      type = "heading";
      level = 2;
    } else if (TAGS[tag]) {
      [type, level] = TAGS[tag];
    } else continue;
    if (tag === "title") level = 1;
    const locs = [...m[2].matchAll(/<loc_(\d+)>/g)].map((x) => Number(x[1]));
    const text = decode(m[3].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const b: VisionBlock = { type, tag, text, box: locs.length === 4 ? (locs as VisionBlock["box"]) : null, markers: [] };
    if (level !== undefined) b.level = level;
    out.push(b);
  }
  // section_header_level_1 is the report's top level here; keep levels as the model gave them (1-based)
  for (const b of out) if (b.type === "heading" && b.tag.startsWith("section_header_level_")) b.level = Number(b.tag.slice(21)) + 1;
  assignMarkers(out);
  return out;
}

/** Footnote labels and body markers from the blocks' types: call again after a block is retyped. */
export function assignMarkers(blocks: VisionBlock[]) {
  for (const b of blocks) {
    b.markers = [];
    if (b.type !== "footnote") {
      delete b.label;
      continue;
    }
    const l = /^\s*(\d{1,4})\b/.exec(b.text);
    if (l) b.label = l[1];
    else delete b.label;
  }
  findMarkers(
    blocks,
    blocks.filter((b) => b.type === "footnote" && b.label).map((b) => b.label!)
  );
}

/** For each footnote label in order, the first body occurrence after the previous marker (a glued one preferred over a spaced one). */
function findMarkers(blocks: VisionBlock[], labels: string[]) {
  const body = blocks.filter((b) => b.type === "paragraph" || b.type === "heading" || b.type === "list_item");
  let bi = 0;
  let from = 0;
  for (const label of labels) {
    for (let k = bi; k < body.length; k++) {
      const text = body[k].text;
      const re = new RegExp(`(?<![\\d$])${label}(?![\\d%])`, "g");
      let best: number | null = null;
      for (const m of text.matchAll(re)) {
        if (k === bi && m.index! < from) continue;
        const glued = m.index! > 0 && !/\s/.test(text[m.index! - 1]);
        const after = text.slice(m.index! + label.length);
        // a label standing at the end of a clause or before a capital/lower word; skip "No. 12" style citations
        if (/(?:^|[\s(])(?:No|Nos|n|nn|at|p|pp|ECF|Ex|§)\.?\s*$/.test(text.slice(Math.max(0, m.index! - 7), m.index!)) && !glued) continue;
        // "April 12, 1984": a date, not the twelfth note
        if (/(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s*$/.test(text.slice(Math.max(0, m.index! - 10), m.index!)) && !glued) continue;
        if (glued || best === null) best = m.index!;
        if (glued) break;
        void after;
      }
      if (best !== null) {
        body[k].markers.push({ label, offset: best });
        bi = k;
        from = best + label.length;
        break;
      }
    }
  }
}

/** Words of a block (letters and digits, folded), for alignment. */
export const blockWords = (text: string) => tokens(text).map((t) => t.word);
