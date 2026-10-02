/**
 * Monotone word alignment of two token streams (ours and a reference edition).
 *
 * 1. Anchors: n-grams (default 7 words) that occur exactly once in each stream.
 * 2. Skeleton: the longest increasing subsequence of the anchors, ordered by
 *    our position, increasing in the reference position (a patience-diff
 *    skeleton): repeated boilerplate and moved text cannot pull the alignment
 *    out of order, which is what defeated first-anchor matching on Philip
 *    Morris (reference-editions.md §3.3).
 * 3. Gaps between skeleton runs: equal prefixes and suffixes, then an exact
 *    LCS when the gap is small enough, then words split or joined across the
 *    two ("tue sday" / "tuesday", "transmis sion" / "transmission").
 *    A gap whose LCS covers under a quarter of its longer side is left
 *    unaligned: that is a different text (a version difference, a missing
 *    stretch), not the same text with errors, and matching its stray "the"s
 *    would invent boundaries.
 *
 * Prototyped in docs/design/reference-editions/tools/pbound2.py.
 */

export type Alignment = {
  /** For each token of `a`, the index of its token in `b`, or -1. */
  map: Int32Array;
  /** For each token of `b`, the index of its token in `a`, or -1. */
  inv: Int32Array;
  anchors: number;
};

export type AlignOptions = { n?: number; maxCells?: number; minGapSimilarity?: number };

function intern(a: string[], b: string[]): [Int32Array, Int32Array] {
  const ids = new Map<string, number>();
  const conv = (xs: string[]) => {
    const out = new Int32Array(xs.length);
    for (let i = 0; i < xs.length; i++) {
      let id = ids.get(xs[i]);
      if (id === undefined) {
        id = ids.size + 1;
        ids.set(xs[i], id);
      }
      out[i] = id;
    }
    return out;
  };
  return [conv(a), conv(b)];
}

/** n-gram hash → first position, or -1 when the n-gram repeats. */
function uniqueGrams(xs: Int32Array, n: number): Map<number, number> {
  const seen = new Map<number, number>();
  for (let i = 0; i + n <= xs.length; i++) {
    let h1 = 0;
    let h2 = 0;
    for (let k = 0; k < n; k++) {
      h1 = (Math.imul(h1, 1000003) + xs[i + k]) >>> 0;
      h2 = (Math.imul(h2, 7919) + xs[i + k] * 31 + 17) >>> 0;
    }
    const key = h1 * 2097152 + (h2 & 0x1fffff);
    seen.set(key, seen.has(key) ? -1 : i);
  }
  return seen;
}

function lis(pairs: [number, number][]): [number, number][] {
  const tails: number[] = [];
  const tailIdx: number[] = [];
  const prev = new Int32Array(pairs.length).fill(-1);
  for (let k = 0; k < pairs.length; k++) {
    const r = pairs[k][1];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = r;
    tailIdx[lo] = k;
    prev[k] = lo > 0 ? tailIdx[lo - 1] : -1;
  }
  const out: [number, number][] = [];
  let k = tailIdx.length ? tailIdx[tailIdx.length - 1] : -1;
  while (k >= 0) {
    out.push(pairs[k]);
    k = prev[k];
  }
  return out.reverse();
}

export function align(aWords: string[], bWords: string[], opts: AlignOptions = {}): Alignment {
  const n = opts.n ?? 7;
  const maxCells = opts.maxCells ?? 4_000_000;
  const minSim = opts.minGapSimilarity ?? 0.25;
  const [a, b] = intern(aWords, bWords);
  const map = new Int32Array(a.length).fill(-1);
  const inv = new Int32Array(b.length).fill(-1);

  // 1-2. unique anchors, LIS skeleton
  const ga = uniqueGrams(a, n);
  const gb = uniqueGrams(b, n);
  const pairs: [number, number][] = [];
  for (const [key, i] of ga) {
    if (i < 0) continue;
    const j = gb.get(key);
    if (j === undefined || j < 0) continue;
    let same = true;
    for (let k = 0; k < n && same; k++) same = a[i + k] === b[j + k];
    if (same) pairs.push([i, j]);
  }
  pairs.sort((x, y) => x[0] - y[0]);
  const skeleton = lis(pairs);
  let lastA = -1;
  let lastB = -1;
  for (const [i, j] of skeleton) {
    for (let k = 0; k < n; k++) {
      if (i + k > lastA && j + k > lastB) {
        map[i + k] = j + k;
        inv[j + k] = i + k;
        lastA = i + k;
        lastB = j + k;
      }
    }
  }

  // 3. gaps
  const link = (i: number, j: number) => {
    map[i] = j;
    inv[j] = i;
  };
  let dp = new Uint32Array(0);
  const fillGap = (a0: number, a1: number, b0: number, b1: number) => {
    // [a0, a1) against [b0, b1): equal prefix and suffix, then an LCS of the middle
    let pre = 0;
    while (a0 + pre < a1 && b0 + pre < b1 && a[a0 + pre] === b[b0 + pre]) pre++;
    let suf = 0;
    while (a1 - suf > a0 + pre && b1 - suf > b0 + pre && a[a1 - 1 - suf] === b[b1 - 1 - suf]) suf++;
    const linkEnds = () => {
      for (let k = 0; k < pre; k++) link(a0 + k, b0 + k);
      for (let k = 1; k <= suf; k++) link(a1 - k, b1 - k);
    };
    const ma0 = a0 + pre;
    const ma1 = a1 - suf;
    const mb0 = b0 + pre;
    const mb1 = b1 - suf;
    const la = ma1 - ma0;
    const lb = mb1 - mb0;
    if (!la || !lb) {
      if (Math.max(a1 - a0, b1 - b0) <= 20 || pre + suf >= minSim * Math.max(a1 - a0, b1 - b0)) linkEnds();
      return;
    }
    if (la * lb > maxCells) {
      linkEnds();
      return;
    }
    const w = lb + 1;
    if (dp.length < (la + 1) * w) dp = new Uint32Array((la + 1) * w);
    for (let j = 0; j <= lb; j++) dp[j] = 0;
    for (let i = 1; i <= la; i++) {
      const row = i * w;
      const up = (i - 1) * w;
      dp[row] = 0;
      const ai = a[ma0 + i - 1];
      for (let j = 1; j <= lb; j++) {
        dp[row + j] = ai === b[mb0 + j - 1] ? dp[up + j - 1] + 1 : Math.max(dp[up + j], dp[row + j - 1]);
      }
    }
    const matched: [number, number][] = [];
    let i = la;
    let j = lb;
    while (i > 0 && j > 0) {
      if (a[ma0 + i - 1] === b[mb0 + j - 1] && dp[i * w + j] === dp[(i - 1) * w + j - 1] + 1) {
        matched.push([ma0 + i - 1, mb0 + j - 1]);
        i--;
        j--;
      } else if (dp[(i - 1) * w + j] >= dp[i * w + j - 1]) i--;
      else j--;
    }
    matched.reverse();
    // Same text with errors shows long runs of matched words; two different texts share only
    // scattered function words. Count words in runs of 3+ (the prefix and suffix are runs too).
    const longest = Math.max(a1 - a0, b1 - b0);
    if (longest > 20) {
      let strong = (pre >= 3 ? pre : 0) + (suf >= 3 ? suf : 0);
      let run = 0;
      for (let k = 0; k <= matched.length; k++) {
        const contiguous = k > 0 && k < matched.length && matched[k][0] === matched[k - 1][0] + 1 && matched[k][1] === matched[k - 1][1] + 1;
        if (k < matched.length && (run === 0 || contiguous)) run++;
        else {
          if (run >= 3) strong += run;
          run = k < matched.length ? 1 : 0;
        }
      }
      if (strong < minSim * longest) return;
    }
    linkEnds();
    let pa = ma0;
    let pb = mb0;
    for (const [x, y] of matched) {
      splits(pa, x, pb, y);
      link(x, y);
      pa = x + 1;
      pb = y + 1;
    }
    splits(pa, ma1, pb, mb1);
  };
  // words split in one stream and whole in the other
  const splits = (a0: number, a1: number, b0: number, b1: number) => {
    let i = a0;
    let j = b0;
    while (i < a1 && j < b1) {
      const wa = aWords[i];
      const wb = bWords[j];
      if (i + 1 < a1 && wa + aWords[i + 1] === wb) {
        link(i, j);
        map[i + 1] = j;
        i += 2;
        j++;
      } else if (j + 1 < b1 && wb + bWords[j + 1] === wa) {
        link(i, j);
        inv[j + 1] = i;
        i++;
        j += 2;
      } else if (wa === wb) {
        link(i++, j++);
      } else break;
    }
  };

  let pa = 0;
  let pb = 0;
  const anchorsA: number[] = [];
  for (let i = 0; i < a.length; i++) if (map[i] >= 0) anchorsA.push(i);
  for (const i of anchorsA) {
    const j = map[i];
    if (i > pa || j > pb) fillGap(pa, i, pb, j);
    pa = i + 1;
    pb = j + 1;
  }
  fillGap(pa, a.length, pb, b.length);
  return { map, inv, anchors: skeleton.length };
}
