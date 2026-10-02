/**
 * Our side of the alignment: a report's full.md as typed blocks with clean
 * text, footnote markers at character offsets, printed page, and the
 * paragraph id the renderer gives each citable block (so an error report can
 * name `?p=<id>`).
 *
 * Reads the markdown independently of the pipeline's block model, like the
 * quality signals (src/lib/quality/blocks.ts), but keeps what they drop:
 * heading levels, list items one by one, note definitions, marker offsets.
 */
import { paragraphId } from "@rtm/ingest";
import { stripFrontMatter, pageNumber } from "../quality/blocks";

export type BlockType = "heading" | "paragraph" | "quote" | "list" | "contents" | "table" | "note";

export type Marker = { label: string; offset: number; /** resolved note definition index into `notes` */ note: number | null };

export type OurBlock = {
  i: number;
  type: BlockType;
  level: number | null;
  /** Clean text: markdown syntax and footnote markers removed. */
  text: string;
  raw: string;
  markers: Marker[];
  page: number | null;
  pageLabel: string | null;
  /** True when a page marker sits between this block and the previous text block. */
  afterPageBreak: boolean;
  /** Paragraph id (`?p=`) of this block, or of the citable block holding it (lists, quotes). */
  pid: string | null;
  /** Our nearest heading above. */
  section: string;
  /** For note definitions: the label (`12`, `3-117`). */
  label?: string;
  /** 1-based line in full.md. */
  line: number;
};

export type Ours = { blocks: OurBlock[]; body: OurBlock[]; notes: OurBlock[] };

const PAGE_MARKER = /^%%page ([^%]+)%%$/;
const NOTE_DEF = /^\[\^(\d+(?:-\d+)?)\]:[ \t]*([\s\S]*)$/;
const CONTENTS_ENTRY = /^(.+?)(?:\s+—\s+|\s*(?:\.\s?){3,}\s*)(\d{1,4}|[ivxlc]{1,6})(?:[–-]\S+)?\s*$/i;
const INLINE = /\[\^(\d+(?:-\d+)?)\]|\\([\\`*_{}[\]()#+\-.!>|~])|\*\*|__|\[([^\]]*)\]\([^)]*\)|<(https?:[^>]+)>/g;

/** Markdown inline → clean text, with marker offsets into the clean text. */
export function inlineText(md: string): { text: string; markers: { label: string; offset: number }[] } {
  let out = "";
  const markers: { label: string; offset: number }[] = [];
  let last = 0;
  for (const m of md.matchAll(INLINE)) {
    out += md.slice(last, m.index);
    last = m.index! + m[0].length;
    if (m[1] !== undefined) markers.push({ label: m[1], offset: out.replace(/\s+$/, "").length });
    else if (m[2] !== undefined) out += m[2];
    else if (m[3] !== undefined) out += m[3];
    else if (m[4] !== undefined) out += m[4];
  }
  out += md.slice(last);
  // collapse whitespace, shifting marker offsets
  let text = "";
  const shift: number[] = [];
  let space = false;
  for (let k = 0; k < out.length; k++) {
    shift[k] = text.length;
    const ch = out[k];
    if (/\s/.test(ch)) {
      if (!space && text.length) text += " ";
      space = true;
    } else {
      text += ch;
      space = false;
    }
  }
  shift[out.length] = text.length;
  const trimmed = text.replace(/\s+$/, "");
  return { text: trimmed, markers: markers.map((x) => ({ label: x.label, offset: Math.min(shift[x.offset] ?? trimmed.length, trimmed.length) })) };
}

export function parseOurs(markdown: string): Ours {
  const content = stripFrontMatter(markdown);
  const frontLines = markdown.length - content.length ? markdown.slice(0, markdown.length - content.length).split("\n").length - 1 : 0;
  const blocks: OurBlock[] = [];
  let page: number | null = null;
  let pageLabel: string | null = null;
  let pageBreak = false;
  let section = "";
  let line = frontLines + 1;
  const taken = new Set<string>();
  let listId: string | null = null;
  let lastPid: string | null = null;
  const pieces = content.split(/(\n{2,})/);
  for (const piece of pieces) {
    if (/^\n{2,}$/.test(piece)) {
      line += piece.length;
      continue;
    }
    const startLine = line + (piece.length - piece.replace(/^\n+/, "").length);
    line += (piece.match(/\n/g) ?? []).length;
    const raw = piece.trim();
    if (!raw) continue;
    const pm = PAGE_MARKER.exec(raw);
    if (pm) {
      pageLabel = pm[1];
      page = pageNumber(pageLabel);
      pageBreak = true;
      continue;
    }
    let type: BlockType;
    let level: number | null = null;
    let body = raw;
    let label: string | undefined;
    const nd = NOTE_DEF.exec(raw);
    if (/^#{1,6}\s/.test(raw)) {
      type = "heading";
      level = /^#+/.exec(raw)![0].length;
      body = raw.replace(/^#+\s*/, "");
    } else if (nd) {
      type = "note";
      label = nd[1];
      body = nd[2];
    } else if (raw.startsWith(">")) {
      type = "quote";
      body = raw.replace(/^>[ \t]?/gm, "");
    } else if (raw.startsWith("|")) {
      type = "table";
      body = raw.replace(/\|/g, " ").replace(/^[\s:-]+$/gm, "");
    } else if (/^- /.test(raw)) {
      body = raw.replace(/^- /, "");
      type = CONTENTS_ENTRY.test(body) ? "contents" : "list";
    } else type = "paragraph";

    // paragraph ids, in the renderer's order (markdown.ts rtm_anchors): top-level paragraphs and
    // the first item of each bullet list take one; headings, quotes, notes and tables do not.
    let pid: string | null = null;
    if (type === "list" || type === "contents") {
      if (listId === null) listId = paragraphId(body.split("\n")[0], taken);
      pid = listId;
    } else {
      if (type !== "note") listId = null;
      if (type === "paragraph") pid = paragraphId(raw, taken);
      else if (type === "quote") pid = lastPid;
    }
    if (pid && type === "paragraph") lastPid = pid;

    const { text, markers } = inlineText(body);
    if (type === "heading") section = text;
    blocks.push({
      i: blocks.length,
      type,
      level,
      text,
      raw,
      markers: markers.map((m) => ({ ...m, note: null })),
      page,
      pageLabel,
      afterPageBreak: pageBreak && type !== "note",
      pid,
      section,
      label,
      line: startLine,
    });
    if (type !== "note") pageBreak = false;
  }
  const body = blocks.filter((b) => b.type !== "note");
  const notes = blocks.filter((b) => b.type === "note");
  // Resolve markers to definitions as the renderer does (markdown.ts withSidenotes): the k-th
  // reference to a label takes the k-th definition with that label, the last when they run out.
  const defs = new Map<string, number[]>();
  notes.forEach((n, k) => defs.set(n.label!, [...(defs.get(n.label!) ?? []), k]));
  const used = new Map<string, number>();
  for (const b of body) {
    for (const m of b.markers) {
      const list = defs.get(m.label);
      if (!list?.length) continue;
      const seen = used.get(m.label) ?? 0;
      m.note = list[Math.min(seen, list.length - 1)];
      used.set(m.label, seen + 1);
    }
  }
  return { blocks, body, notes };
}
