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

/**
 * Renders report markdown to HTML.
 *
 * Every top-level paragraph gets a stable sequential id (`p-1`, `p-2`, …) and a
 * permalink anchor, so any passage can be cited by URL. Ids are positional, so
 * they are only stable for a given version of the source markdown — re-ingesting
 * a report can renumber them.
 */
export function renderMarkdown(markdown: string): string {
  const { content } = splitFrontMatter(markdown);

  let paragraphCount = 0;
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  const defaultParagraphOpen = md.renderer.rules.paragraph_open;

  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    const open = () =>
      defaultParagraphOpen
        ? defaultParagraphOpen(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options);

    // Only top-level paragraphs are citable units. A paragraph nested in a list
    // item or a block quote would put its marker in the middle of the line.
    if (tokens[idx].level !== 0) return open();

    paragraphCount += 1;
    const id = `p-${paragraphCount}`;
    tokens[idx].attrSet("id", id);
    return `${open()}<a class="permalink" href="#${id}" aria-label="Link to paragraph ${paragraphCount}">¶</a>`;
  };

  return md.render(content);
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
