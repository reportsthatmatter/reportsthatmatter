import { renderLayout } from "./layout";
import { renderMarkdown } from "../lib/markdown";

/**
 * Renders docs/CHANGELOG.md.
 *
 * Hand-written rather than generated from commits: the point is to say what
 * changed and why it mattered to a reader, which a commit log does not.
 */
export function renderChangelog(markdown: string): string {
  const body = `
<main>
  <section class="report-header wrap">
    <div class="measure">
      <p class="kicker mono">Changelog</p>
      <h1>What has changed.</h1>
      <p class="byline mono">Improvements to the archive and how it reads</p>
    </div>
  </section>
  <div class="prose wrap measure">
    ${renderMarkdown(entriesOnly(markdown))}
  </div>
</main>`;

  return renderLayout("Changelog — Reports that Matter", body, {
    description:
      "What has changed on Reports that Matter — improvements to the archive, the reading experience, and how reports are converted.",
  });
}

/**
 * Everything after the first `---` rule. The file opens with a title and a note
 * to whoever maintains it; the page supplies its own title and the note is
 * internal.
 */
export function entriesOnly(markdown: string): string {
  const separator = markdown.indexOf("\n---\n");
  return separator === -1 ? markdown : markdown.slice(separator + 5).trimStart();
}
