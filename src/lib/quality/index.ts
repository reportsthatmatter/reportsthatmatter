import { SIGNALS, bareMarkerStats, contentsStats, quoteParity, type Finding, type QualityInput, type Signal } from "./signals";

export * from "./signals";
export { toBlocks, endsSentence } from "./blocks";

export type Measurement = {
  findings: Record<string, Finding[]>;
  /** What the budget compares: findings.length, or ceil(value) for metric signals. */
  counts: Record<string, number>;
  /** Derived numbers shown by `pnpm quality report`. */
  stats: { bareMarkerPercent: number; contentsEntries: number; contentsMissingRatio: number; quoteEvenPercent: number; quoteOddPercent: number };
};

export function countOf(signal: Signal, input: QualityInput, findings: Finding[]): number {
  return signal.kind === "metric" ? Math.ceil(Number((signal.value!(input)).toFixed(6))) : findings.length;
}

/** Runs every signal over one report. */
export function measure(input: QualityInput): Measurement {
  const findings: Record<string, Finding[]> = {};
  const counts: Record<string, number> = {};
  for (const signal of SIGNALS) {
    findings[signal.id] = signal.run(input);
    counts[signal.id] = countOf(signal, input, findings[signal.id]);
  }
  const marker = bareMarkerStats(input);
  const contents = contentsStats(input);
  const parity = quoteParity(input);
  return {
    findings,
    counts,
    stats: {
      bareMarkerPercent: marker.bare + marker.definitions ? (marker.bare / (marker.bare + marker.definitions)) * 100 : 0,
      contentsEntries: contents.entries,
      contentsMissingRatio: contents.ratio,
      quoteEvenPercent: parity.even,
      quoteOddPercent: parity.odd,
    },
  };
}
export * from "./numbered-lists";
