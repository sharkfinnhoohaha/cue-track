/**
 * Section-detection grader — the anti-cheat scoring core.
 *
 * Design goal: a number the tuning loop cannot game its way to. The defenses:
 *
 *  1. SEMANTIC labels, no relabeling. Scores compare canonical labels
 *     (intro/verse/chorus/...). There is no optimal cluster-id assignment, so
 *     "label everything chorus" only earns chorus's share of the timeline
 *     (~30%), never 100%.
 *  2. ONE-TO-ONE matching with a max(#pred,#ref) denominator. Over-segmenting
 *     (predict 50 tiny sections so something lands near every boundary) blows
 *     up the denominator and tanks the score; under-segmenting misses refs.
 *  3. FRAME accuracy as an independent floor. A boundary that's "close" still
 *     mislabels the frames it's wrong about, so sloppy boundaries cost score.
 *  4. DEGENERACY FLAGS. Wildly wrong segment counts, label collapse, or
 *     boundary spam set hard flags; a flagged result is invalid regardless of
 *     its raw numbers. The tuning loop must treat flagged runs as failures.
 *  5. TRIMMED trivial boundaries. The 0s start and the final end are not
 *     counted, so a detector gets no free credit for "the song starts at 0".
 *
 * Combined with the sealed test split in corpus.ts (the loop never tunes on
 * the test set), hitting the target here means the detector is genuinely that
 * accurate, not overfit to the grader.
 *
 * Pure + dependency-free so it runs under the repo's existing toolchain and is
 * unit-tested in grade.test.ts (including adversarial degenerate predictions).
 */

export interface Segment {
  /** seconds */
  start: number;
  /** seconds */
  end: number;
  label: string;
}

export interface Segmentation {
  segments: Segment[];
  /** total track duration in seconds */
  duration: number;
}

export const CANONICAL_LABELS = [
  'intro',
  'verse',
  'prechorus',
  'chorus',
  'bridge',
  'instrumental',
  'solo',
  'outro',
  'silence',
  'other',
] as const;
export type CanonicalLabel = (typeof CANONICAL_LABELS)[number];

const SYNONYMS: Record<string, CanonicalLabel> = {
  intro: 'intro',
  start: 'intro',
  head: 'intro',
  verse: 'verse',
  vers: 'verse',
  prechorus: 'prechorus',
  'pre-chorus': 'prechorus',
  prechrous: 'prechorus',
  preverse: 'verse',
  chorus: 'chorus',
  refrain: 'chorus',
  hook: 'chorus',
  bridge: 'bridge',
  middle8: 'bridge',
  'middle-8': 'bridge',
  break: 'bridge',
  breakdown: 'bridge',
  inst: 'instrumental',
  instrumental: 'instrumental',
  interlude: 'instrumental',
  solo: 'solo',
  outro: 'outro',
  end: 'outro',
  ending: 'outro',
  coda: 'outro',
  fadeout: 'outro',
  loop: 'verse',
  silence: 'silence',
  'no_function': 'other',
  none: 'other',
};

/**
 * Map an arbitrary detector/dataset label to the canonical vocabulary. Letters
 * (SALAMI uses "A"/"B"/...) and unknowns fall to `other` — which deliberately
 * does NOT match any functional label, so a detector that emits opaque cluster
 * ids cannot score.
 */
export function canonicalizeLabel(raw: string): CanonicalLabel {
  const k = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (k in SYNONYMS) return SYNONYMS[k];
  if ((CANONICAL_LABELS as readonly string[]).includes(k)) return k as CanonicalLabel;
  return 'other';
}

function sortedSegments(seg: Segmentation): Segment[] {
  return [...seg.segments].sort((a, b) => a.start - b.start);
}

/**
 * Inner boundary times (segment transitions), trimming the trivial 0 and the
 * final end so a detector earns no credit for them.
 */
export function innerBoundaries(seg: Segmentation): number[] {
  const segs = sortedSegments(seg);
  const bounds: number[] = [];
  for (let i = 1; i < segs.length; i++) bounds.push(segs[i].start);
  const eps = 1e-6;
  return bounds.filter((b) => b > eps && b < seg.duration - eps);
}

export interface BoundaryScore {
  precision: number;
  recall: number;
  f: number;
  hits: number;
  numRef: number;
  numPred: number;
}

/**
 * Boundary detection F-measure at `tolerance` seconds, with one-to-one
 * (greedy nearest) matching so duplicated predictions near one reference
 * boundary count once.
 */
export function boundaryFMeasure(
  ref: Segmentation,
  pred: Segmentation,
  tolerance: number,
): BoundaryScore {
  const refB = innerBoundaries(ref);
  const predB = innerBoundaries(pred);
  const usedPred = new Set<number>();
  let hits = 0;
  for (const r of refB) {
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < predB.length; j++) {
      if (usedPred.has(j)) continue;
      const d = Math.abs(predB[j] - r);
      if (d <= tolerance && d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    if (best >= 0) {
      usedPred.add(best);
      hits++;
    }
  }
  const precision = predB.length ? hits / predB.length : refB.length === 0 ? 1 : 0;
  const recall = refB.length ? hits / refB.length : 1;
  const f = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f, hits, numRef: refB.length, numPred: predB.length };
}

function labelAt(segs: Segment[], t: number): CanonicalLabel {
  for (const s of segs) {
    if (t >= s.start && t < s.end) return canonicalizeLabel(s.label);
  }
  return 'other';
}

/**
 * Fraction of the timeline (sampled every `hop` seconds) where the predicted
 * canonical label equals the reference canonical label. Independent of the
 * boundary metric and strongly resistant to label collapse.
 */
export function frameLabelAccuracy(
  ref: Segmentation,
  pred: Segmentation,
  hop = 0.1,
): number {
  const refSegs = sortedSegments(ref);
  const predSegs = sortedSegments(pred);
  const duration = Math.max(ref.duration, 0);
  if (duration <= 0) return 0;
  let total = 0;
  let correct = 0;
  for (let t = hop / 2; t < duration; t += hop) {
    total++;
    if (labelAt(refSegs, t) === labelAt(predSegs, t)) correct++;
  }
  return total ? correct / total : 0;
}

export interface PerSectionScore {
  /** matched refs / max(#pred, #ref) — the headline "is each section right" */
  score: number;
  matched: number;
  numRef: number;
  numPred: number;
}

/**
 * Per-section correctness: how many reference sections have a predicted section
 * with the SAME canonical label whose start is within `tolerance` seconds — one
 * pred per ref, max(#pred,#ref) denominator so neither over- nor
 * under-segmentation can inflate it.
 */
export function perSectionCorrectness(
  ref: Segmentation,
  pred: Segmentation,
  tolerance: number,
): PerSectionScore {
  const refSegs = sortedSegments(ref);
  const predSegs = sortedSegments(pred);
  const usedPred = new Set<number>();
  let matched = 0;
  for (const r of refSegs) {
    const rl = canonicalizeLabel(r.label);
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < predSegs.length; j++) {
      if (usedPred.has(j)) continue;
      if (canonicalizeLabel(predSegs[j].label) !== rl) continue;
      const d = Math.abs(predSegs[j].start - r.start);
      if (d <= tolerance && d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    if (best >= 0) {
      usedPred.add(best);
      matched++;
    }
  }
  const denom = Math.max(refSegs.length, predSegs.length, 1);
  return { score: matched / denom, matched, numRef: refSegs.length, numPred: predSegs.length };
}

export interface DegeneracyReport {
  segmentCountRatio: number;
  labelCollapseFraction: number;
  boundariesPerMinute: number;
  refBoundariesPerMinute: number;
  flags: string[];
}

/**
 * Hard guards against gaming. A non-empty `flags` list invalidates the song's
 * score no matter how the raw numbers look.
 */
export function degeneracyFlags(ref: Segmentation, pred: Segmentation): DegeneracyReport {
  const flags: string[] = [];
  const numRef = Math.max(ref.segments.length, 1);
  const numPred = pred.segments.length;
  const ratio = numPred / numRef;
  if (ratio > 2.0) flags.push('over_segmented');
  if (ratio < 0.5) flags.push('under_segmented');

  // Largest share of the PREDICTED timeline held by a single canonical label.
  const byLabel = new Map<CanonicalLabel, number>();
  for (const s of pred.segments) {
    const l = canonicalizeLabel(s.label);
    byLabel.set(l, (byLabel.get(l) ?? 0) + Math.max(0, s.end - s.start));
  }
  const covered = Array.from(byLabel.values()).reduce((a, b) => a + b, 0) || 1;
  const collapse = Math.max(0, ...Array.from(byLabel.values())) / covered;
  if (collapse > 0.8) flags.push('label_collapse');

  // 'other'/opaque labels dominating means the detector isn't naming sections.
  const otherFrac = (byLabel.get('other') ?? 0) / covered;
  if (otherFrac > 0.5) flags.push('unlabeled');

  const minutes = Math.max(ref.duration / 60, 1 / 60);
  const bpm = innerBoundaries(pred).length / minutes;
  const refBpm = innerBoundaries(ref).length / minutes;
  if (bpm > Math.max(4, refBpm * 2.5)) flags.push('boundary_spam');

  return {
    segmentCountRatio: ratio,
    labelCollapseFraction: collapse,
    boundariesPerMinute: bpm,
    refBoundariesPerMinute: refBpm,
    flags,
  };
}

export interface GradeOptions {
  /** seconds; per-section start-boundary tolerance. Default 3. */
  sectionTolerance?: number;
  /** seconds; frame sampling hop. Default 0.1. */
  frameHop?: number;
}

export interface SongScore {
  boundaryF05: number;
  boundaryF3: number;
  frameAccuracy: number;
  perSection: number;
  degeneracy: DegeneracyReport;
  /** valid === false when any degeneracy flag fired; the score is untrustworthy */
  valid: boolean;
}

export function gradeSong(
  ref: Segmentation,
  pred: Segmentation,
  opts: GradeOptions = {},
): SongScore {
  const tol = opts.sectionTolerance ?? 3;
  const degeneracy = degeneracyFlags(ref, pred);
  return {
    boundaryF05: boundaryFMeasure(ref, pred, 0.5).f,
    boundaryF3: boundaryFMeasure(ref, pred, 3).f,
    frameAccuracy: frameLabelAccuracy(ref, pred, opts.frameHop),
    perSection: perSectionCorrectness(ref, pred, tol).score,
    degeneracy,
    valid: degeneracy.flags.length === 0,
  };
}

export interface AggregateScore {
  songs: number;
  /** mean per-section correctness — the headline accuracy */
  headline: number;
  meanBoundaryF05: number;
  meanBoundaryF3: number;
  meanFrameAccuracy: number;
  flaggedFraction: number;
  /** Honest "did we hit the target" gate: headline >= target AND guards clean */
  meetsTarget: boolean;
  target: number;
}

/**
 * Aggregate per-song scores. `meetsTarget` is the only number that should gate
 * a release: it is true only when the headline clears the target AND the
 * frame-accuracy floor is met AND degenerate predictions aren't widespread, so
 * the loop can't trip a single metric to claim success.
 */
export function aggregate(scores: SongScore[], target = 0.9): AggregateScore {
  const n = scores.length || 1;
  const mean = (f: (s: SongScore) => number) => scores.reduce((a, s) => a + f(s), 0) / n;
  const headline = mean((s) => s.perSection);
  const meanFrame = mean((s) => s.frameAccuracy);
  const flaggedFraction = scores.filter((s) => !s.valid).length / n;
  // Guard floor: frame accuracy must independently corroborate the headline,
  // and degenerate songs must be rare. These block the single-metric cheat.
  const FRAME_FLOOR = 0.6;
  const meetsTarget = headline >= target && meanFrame >= FRAME_FLOOR && flaggedFraction <= 0.1;
  return {
    songs: scores.length,
    headline,
    meanBoundaryF05: mean((s) => s.boundaryF05),
    meanBoundaryF3: mean((s) => s.boundaryF3),
    meanFrameAccuracy: meanFrame,
    flaggedFraction,
    meetsTarget,
    target,
  };
}
