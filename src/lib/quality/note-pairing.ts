/**
 * Which definition each footnote reference opens, for a report whose numbering
 * restarts (9/11, Leveson, Litvinenko define `[^20]` once per chapter).
 *
 * The pairing itself is `resolveNoteReferences` from @rtm/ingest (markdown.ts, v0.16.0+), which the
 * renderer uses: the quality signals and the scorer must give the same answer to judge it.
 * `tests/note-pairing.test.ts` pins the behaviour.
 */

/** `[^20]:` definitions as the renderer reads them: one line each, in document order. */
export function noteDefinitions(markdown: string): { label: string; text: string }[] {
  return [...markdown.matchAll(/^\[\^(\d+(?:-\d+)?)\]:[ \t]*(.+)$/gm)].map((m) => ({ label: m[1], text: m[2].trim() }));
}

/** The body: everything before the collected `## Notes` block, as the renderer strips it. */
export function bodyOf(markdown: string): string {
  return markdown.replace(/\n## Notes\n[\s\S]*$/, "\n");
}

/** Per reference, the index of its definition within its label's list; null where unpaired. The renderer's own pairing. */
export { resolveNoteReferences as pairNoteReferences } from "@rtm/ingest";
