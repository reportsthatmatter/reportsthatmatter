/**
 * Which definition each footnote reference opens, for a report whose numbering
 * restarts (9/11, Leveson, Litvinenko define `[^20]` once per chapter).
 *
 * This is `resolveNoteReferences` from @rtm/ingest (markdown.ts), copied here
 * because the pinned release (v0.15.1) predates it: the renderer pairs a
 * reference with a definition by monotone alignment, and the quality signals
 * and the scorer need the same answer to judge it. Replace this file with the
 * import once the pin carries it (reportsthatmatter-apk). `tests/note-pairing.test.ts`
 * pins the behaviour so the two cannot drift unnoticed.
 */

/** `[^20]:` definitions as the renderer reads them: one line each, in document order. */
export function noteDefinitions(markdown: string): { label: string; text: string }[] {
  return [...markdown.matchAll(/^\[\^(\d+(?:-\d+)?)\]:[ \t]*(.+)$/gm)].map((m) => ({ label: m[1], text: m[2].trim() }));
}

/** The body: everything before the collected `## Notes` block, as the renderer strips it. */
export function bodyOf(markdown: string): string {
  return markdown.replace(/\n## Notes\n[\s\S]*$/, "\n");
}

/** Per reference, the index of its definition within its label's list; null where unpaired. */
export function pairNoteReferences(labels: readonly string[], order: readonly string[]): Array<number | null> {
  const defined = new Map<string, number>();
  for (const label of order) defined.set(label, (defined.get(label) ?? 0) + 1);

  const result: Array<number | null> = labels.map((label) => (defined.get(label) === 1 ? 0 : null));
  const refs: number[] = [];
  labels.forEach((label, i) => {
    if ((defined.get(label) ?? 0) > 1) refs.push(i);
  });
  const ordinal = new Map<string, number>();
  const defs: Array<{ label: string; index: number }> = [];
  for (const label of order) {
    if ((defined.get(label) ?? 0) < 2) continue;
    const index = ordinal.get(label) ?? 0;
    ordinal.set(label, index + 1);
    defs.push({ label, index });
  }
  const n = refs.length;
  const m = defs.length;
  if (!n || !m || n * m > 40_000_000) return result;

  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        labels[refs[i]] === defs[j].label
          ? Math.min(65535, table[(i + 1) * width + j + 1] + 1)
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (labels[refs[i]] === defs[j].label && table[i * width + j] === table[(i + 1) * width + j + 1] + 1) {
      result[refs[i]] = defs[j].index;
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return result;
}
