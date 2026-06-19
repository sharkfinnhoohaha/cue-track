/**
 * Structural plausibility checks — "does this look like a real song?"
 *
 * Most pop/worship songs follow a small set of canonical shapes, so an output
 * with seven verses, a dozen choruses, or no chorus at all is almost certainly
 * a detector error you can catch INSTANTLY, with no ground-truth labels. The
 * loop uses this as a cheap first-pass filter: implausible outputs get flagged
 * for retry/constraint-tightening immediately, before any human grades them.
 *
 * IMPORTANT — plausibility is NOT correctness. A perfectly canonical
 * intro/verse/chorus/verse/chorus/bridge/chorus/outro can still be completely
 * misaligned with the actual song. So this NEVER feeds the accuracy score
 * (that stays vs ground truth in grade.ts) — otherwise the detector could
 * "cheat" by always emitting a textbook structure. This is a sanity gate, not
 * a grade. Use both: plausibility to auto-reject obvious failures, accuracy to
 * measure real correctness.
 */
import { canonicalizeLabel, type CanonicalLabel, type Segmentation } from './grade';

export interface StructureLimits {
  /** real songs rarely have more than this many chorus instances */
  maxChorus: number;
  /** ...or this many distinct verses */
  maxVerse: number;
  /** a run of the same label longer than this is suspicious (7 verses in a row) */
  maxConsecutiveSame: number;
  /** bridges are usually 0–1, occasionally 2 */
  maxBridge: number;
  /** sections per minute above this = over-segmented */
  maxSectionsPerMinute: number;
  /** below this duration we don't expect a chorus (short clip / intro) */
  requireChorusAboveSec: number;
}

export const DEFAULT_LIMITS: StructureLimits = {
  maxChorus: 5,
  maxVerse: 4,
  maxConsecutiveSame: 2,
  maxBridge: 2,
  maxSectionsPerMinute: 3,
  requireChorusAboveSec: 90,
};

export interface StructureIssue {
  code: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
}

export interface StructureReport {
  counts: Partial<Record<CanonicalLabel, number>>;
  issues: StructureIssue[];
  /** plausible === false when any HIGH-severity issue fired (very likely wrong) */
  plausible: boolean;
}

export function checkStructure(
  seg: Segmentation,
  limits: StructureLimits = DEFAULT_LIMITS,
): StructureReport {
  const labels = seg.segments.map((s) => canonicalizeLabel(s.label));
  const counts: Partial<Record<CanonicalLabel, number>> = {};
  for (const l of labels) counts[l] = (counts[l] ?? 0) + 1;

  const issues: StructureIssue[] = [];
  const add = (code: string, message: string, severity: StructureIssue['severity']) =>
    issues.push({ code, message, severity });

  if ((counts.chorus ?? 0) > limits.maxChorus) {
    add('too_many_choruses', `${counts.chorus} choruses (> ${limits.maxChorus})`, 'high');
  }
  if ((counts.verse ?? 0) > limits.maxVerse) {
    add('too_many_verses', `${counts.verse} verses (> ${limits.maxVerse})`, 'high');
  }
  if ((counts.bridge ?? 0) > limits.maxBridge) {
    add('too_many_bridges', `${counts.bridge} bridges (> ${limits.maxBridge})`, 'medium');
  }

  // Longest run of the same label.
  let run = 1;
  let worstRun = 1;
  let worstLabel: CanonicalLabel = labels[0] ?? 'other';
  for (let i = 1; i < labels.length; i++) {
    run = labels[i] === labels[i - 1] ? run + 1 : 1;
    if (run > worstRun) {
      worstRun = run;
      worstLabel = labels[i];
    }
  }
  if (worstRun > limits.maxConsecutiveSame) {
    add('repeated_label_run', `${worstRun} ${worstLabel}s in a row (> ${limits.maxConsecutiveSame})`, 'high');
  }

  const minutes = Math.max(seg.duration / 60, 1 / 60);
  const perMin = seg.segments.length / minutes;
  if (perMin > limits.maxSectionsPerMinute) {
    add('over_segmented', `${perMin.toFixed(1)} sections/min (> ${limits.maxSectionsPerMinute})`, 'high');
  }

  if (seg.duration > limits.requireChorusAboveSec && !(counts.chorus ?? 0)) {
    add('no_chorus', `no chorus in a ${Math.round(seg.duration)}s song`, 'medium');
  }

  // Position priors: intro should open, outro should close.
  if (labels.length > 1) {
    if (labels.lastIndexOf('intro') > 0) add('intro_not_first', 'an intro appears after the start', 'low');
    if (labels.indexOf('outro') >= 0 && labels.indexOf('outro') < labels.length - 1) {
      add('outro_not_last', 'an outro appears before the end', 'low');
    }
  }

  return {
    counts,
    issues,
    plausible: !issues.some((i) => i.severity === 'high'),
  };
}
