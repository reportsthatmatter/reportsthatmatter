import MarkdownIt from "markdown-it";
import { parse } from "yaml";

export type FrontMatter = Record<string, unknown>;

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Splits leading YAML front matter off a markdown document.
 * Ingested reports carry their metadata this way, and it must never reach the
 * renderer — otherwise it prints as the opening paragraph of the report.
 */
export function splitFrontMatter(source: string): {
  data: FrontMatter;
  content: string;
} {
  const match = source.match(FRONT_MATTER);
  if (!match) return { data: {}, content: source };

  let data: FrontMatter = {};
  try {
    data = (parse(match[1]) as FrontMatter) ?? {};
  } catch {
    // Malformed front matter is metadata we lose, not a reason to fail the page.
    data = {};
  }

  return { data, content: source.slice(match[0].length) };
}

/** The ingestion pipeline marks where each printed page of the source begins. */
const PAGE_MARKER = /^%%page (\d+)%%$/;

/** Words too common to identify a paragraph by. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "by",
  "for", "with", "as", "is", "was", "were", "that", "this", "it", "he", "she",
  "they", "mr", "mrs", "ms",
]);

/**
 * A durable id for a paragraph, derived from its own opening words.
 *
 * Positional ids (`p-1`, `p-2`, …) look stable and are not: re-ingesting a
 * report to fix one OCR error renumbers everything after it, so every link
 * ever shared keeps resolving but now points at different text. Deriving the id
 * from the text means a paragraph keeps its address as long as its words do,
 * and a link that *does* break is visibly wrong rather than quietly wrong.
 *
 * It also reads better in a URL, which matters when the URL is the product:
 * `#rioters-at-the-capitol-had-been` over `#p-318`.
 */
export function paragraphId(text: string, taken: Set<string>): string {
  const words = text
    .toLowerCase()
    .replace(/\[\^\d+\]/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Dropping stopwords makes the id both shorter and more distinctive, but a
  // very short paragraph can be almost entirely stopwords — keep them then.
  const meaningful = words.filter((word) => !STOPWORDS.has(word));
  const chosen = (meaningful.length >= 2 ? meaningful : words).slice(0, 5);

  let base = chosen.join("-").slice(0, 60).replace(/-+$/, "");
  if (!base) base = "para";

  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }

  // Identical openings do occur — headings repeated across sections, boilerplate.
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/**
 * Renders report markdown to HTML.
 *
 * Top-level paragraphs get a text-derived id and a permalink anchor. Page
 * markers left by the ingestion pipeline become anchors of their own, so a
 * passage can also be cited the way these documents are normally cited — by the
 * printed page it appears on.
 */
export function renderMarkdown(markdown: string): string {
  const { content } = splitFrontMatter(markdown);

  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

  md.core.ruler.push("rtm_anchors", (state) => {
    const tokens = state.tokens;
    const taken = new Set<string>();
    let page: number | null = null;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type !== "paragraph_open" || token.level !== 0) continue;

      const text = tokens[i + 1]?.content ?? "";

      const marker = text.match(PAGE_MARKER);
      if (marker) {
        page = Number.parseInt(marker[1], 10);
        const anchor = new state.Token("html_block", "", 0);
        anchor.content =
          `<a class="page-marker" id="page-${page}" href="#page-${page}"` +
          ` aria-label="Printed page ${page}">${page}</a>\n`;
        tokens.splice(i, 3, anchor);
        continue;
      }

      // Only top-level paragraphs are citable units. A paragraph nested in a
      // list item or a block quote would put its marker mid-line.
      const id = paragraphId(text, taken);
      token.attrSet("id", id);
      if (page !== null) token.attrSet("data-page", String(page));
    }
  });

  const defaultParagraphOpen = md.renderer.rules.paragraph_open;
  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    const open = defaultParagraphOpen
      ? defaultParagraphOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);

    const id = tokens[idx].attrGet("id");
    if (!id) return open;

    return `${open}<a class="permalink" href="#${id}" aria-label="Link to this paragraph">¶</a>`;
  };

  const notes = collectNotes(content);
  const { html, used } = withSidenotes(md.render(stripNotesSection(content)), notes);

  // Not every note has a reference in the text — footnote recall is imperfect,
  // and a note we cannot place is still evidence. List the remainder rather
  // than dropping it.
  const orphans = [...notes].filter(([number]) => !used.has(number));
  if (!orphans.length) return html;

  const items = orphans
    .map(
      ([number, text]) =>
        `<li id="note-${number}"><sup>${number}</sup> ${escapeText(text)}</li>`
    )
    .join("");

  return (
    `${html}\n<section class="orphan-notes">` +
    `<h2>Notes not linked in the text</h2>` +
    `<p class="orphan-notes-why">These notes appear in the source but the pipeline ` +
    `could not place their reference in the body. They are listed here so nothing ` +
    `is lost.</p><ol>${items}</ol></section>`
  );
}

/** The collected `## Notes` block, which sidenotes replace in the body. */
export function stripNotesSection(markdown: string): string {
  return markdown.replace(/\n## Notes\n[\s\S]*$/, "\n");
}

/** `[^12]: text` definitions, keyed by number. */
export function collectNotes(markdown: string): Map<string, string> {
  const notes = new Map<string, string>();
  for (const match of markdown.matchAll(/^\[\^(\d+)\]:[ \t]*(.+)$/gm)) {
    notes.set(match[1], match[2].trim());
  }
  return notes;
}

/**
 * A note this long floating in the margin runs disproportionately taller
 * than the paragraph it supports, and drags every sidenote after it out of
 * alignment with its own paragraph for the rest of the page (floats stack
 * top-to-bottom in the margin column, independent of each note's own
 * anchor). Measured across the published reports before picking a number:
 * the median note everywhere is 47-169 characters, so this only trips for
 * the genuine outliers — see docs/plans/2026-08-09-sidenote-design-research.md.
 */
const LONG_NOTE_CHARS = 400;

/**
 * Turns footnote references into sidenotes.
 *
 * A footnote you have to travel to is a footnote you don't read. These reports
 * are mostly citation, and the citation is the evidence — so the note belongs
 * beside the sentence it supports, not 70 KB away at the end of the document.
 *
 * The markup degrades honestly: the reference is still a link to the collected
 * note, so it works without CSS, without JavaScript, and on a narrow screen
 * where there is no margin to put a sidenote in.
 */
export function withSidenotes(
  html: string,
  notes: Map<string, string>
): { html: string; used: Set<string> } {
  const used = new Set<string>();
  let counter = 0;

  const out = html.replace(/\[\^(\d+)\]/g, (whole, number: string) => {
    const note = notes.get(number);
    if (!note) return whole;

    used.add(number);
    counter += 1;
    const toggleId = `sn-${number}-${counter}`;
    const long = note.length > LONG_NOTE_CHARS;

    return (
      `<label class="sidenote-toggle" for="${toggleId}" aria-label="Note ${number}">` +
      `<sup>${number}</sup></label>` +
      `<input class="sidenote-checkbox" id="${toggleId}" type="checkbox" />` +
      `<span class="sidenote${long ? " long" : ""}"><sup>${number}</sup> ${escapeText(note)}` +
      (long ? `<label class="sidenote-expand" for="${toggleId}">Show full note</label>` : "") +
      `</span>`
    );
  });

  return { html: out, used };
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Headings get slug ids so a section can be linked as well as a paragraph. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}
