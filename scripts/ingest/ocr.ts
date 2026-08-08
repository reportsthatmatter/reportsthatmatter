/**
 * OCR-suspect detection.
 *
 * This produces a ranked review queue, not a pass/fail gate. Whether text is
 * faithful to the source is finally a human judgement, and a threshold would
 * only disguise that. What we can do honestly is surface every place the
 * scanner probably got it wrong, with a page reference, and auto-fix only the
 * patterns that have no legitimate reading.
 */

export type Suspect = {
  pattern: string;
  match: string;
  context: string;
  page: number;
  confidence: "certain" | "likely" | "possible";
};

/**
 * Substitutions with no legitimate alternative reading. Applied automatically.
 *
 * Keep these narrow. A rule that is merely *usually* right will silently invent
 * text, and the lossless fidelity check is what stops that from shipping —
 * every rule here must be one you would defend against the scan.
 */
const CERTAIN: Array<[RegExp, string, string]> = [
  // "0 1/04/2021" — the leading zero of a date split off by the scanner.
  [/\b0 (\d)\/(\d{2})\/(\d{4})\b/g, "0$1/$2/$3", "split leading zero in date"],
  // "53 :25" / "11: 15" — space around the colon of a timestamp.
  [/\b(\d{1,2}) ?: ?(\d{2})\b/g, "$1:$2", "space inside timestamp"],
  [/\bin tum\b/g, "in turn", "tum → turn"],
  [/\bUnUed States\b/g, "United States", "UnUed → United"],
  // Run-together words the scanner drops a space from. Neither half-word is
  // ever a legitimate reading on its own, unlike "modem" or "arid" below.
  [/\bofthe\b/g, "of the", "ofthe → of the"],
  [/\binthe\b/g, "in the", "inthe → in the"],
  [/\bbo th\b/g, "both", "bo th → both"],
  [/\bconceming\b/gi, "concerning", "conceming → concerning"],
  // "fonn" — the scanner reads "r" as "n", same failure as "tum" for "turn".
  // Not a word under any other reading.
  [/\bfonn\b/g, "form", "fonn → form"],
];

/** Patterns worth a human look. Never auto-changed. */
const SUSPECT: Array<[RegExp, string, Suspect["confidence"]]> = [
  [/\b\w*[a-z]rn[a-z]\w*\b/g, "possible rn/m confusion", "possible"],
  [/\b[A-Za-z]*\d[A-Za-z]+\b/g, "digit inside a word", "likely"],
  [/[A-Za-z]{2,}[;!\\|][A-Za-z]{2,}/g, "stray punctuation inside a word", "likely"],
  [/\b(tum|modem|conceming|thc|fl-om|arid|bo th|ofthe|inthe|fonn)\b/gi, "known OCR artefact", "likely"],
  [/\b[a-z]{1,2}[A-Z][a-z]/g, "case break inside a word", "possible"],
];

const DICTIONARY_SAFE = new Set([
  "turn", "turned", "turning", "modern", "concerning", "the", "from", "and",
  "government", "governmental", "attorney", "internal", "external", "alternate",
  "alternative", "return", "returned", "returning", "journal", "journalist",
  "eternal", "paternal", "fraternal", "burn", "burned", "learn", "learned",
]);

export function autoFix(text: string): { text: string; applied: number } {
  let applied = 0;
  let out = text;
  for (const [pattern, replacement] of CERTAIN) {
    out = out.replace(pattern, (match, ...groups) => {
      applied += 1;
      return replacement.replace(/\$(\d)/g, (_, i) => String(groups[Number(i) - 1] ?? ""));
    });
  }
  return { text: out, applied };
}

export function findSuspects(text: string, page: number): Suspect[] {
  const suspects: Suspect[] = [];

  for (const [pattern, label, confidence] of SUSPECT) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      if (DICTIONARY_SAFE.has(value.toLowerCase())) continue;

      const at = match.index ?? 0;
      suspects.push({
        pattern: label,
        match: value,
        context: text.slice(Math.max(0, at - 40), at + value.length + 40).replace(/\s+/g, " "),
        page,
        confidence,
      });
    }
  }

  return suspects;
}

export function rankSuspects(suspects: Suspect[]): Suspect[] {
  const order = { certain: 0, likely: 1, possible: 2 };
  const byMatch = new Map<string, Suspect & { count: number }>();

  for (const suspect of suspects) {
    const key = `${suspect.pattern}::${suspect.match}`;
    const existing = byMatch.get(key);
    if (existing) existing.count += 1;
    else byMatch.set(key, { ...suspect, count: 1 });
  }

  return [...byMatch.values()].sort(
    (a, b) => order[a.confidence] - order[b.confidence] || b.count - a.count
  );
}
