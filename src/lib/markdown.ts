import MarkdownIt from "markdown-it";

export function renderMarkdown(markdown: string): string {
  let paragraphCount = 0;
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  const defaultParagraphOpen = md.renderer.rules.paragraph_open;

  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    paragraphCount += 1;
    tokens[idx].attrSet("id", `p-${paragraphCount}`);
    return defaultParagraphOpen
      ? defaultParagraphOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  return md.render(markdown);
}
