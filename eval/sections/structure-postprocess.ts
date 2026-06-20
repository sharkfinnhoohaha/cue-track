/**
 * Conservative structural constraints applied to a detector's output. These are
 * the "hard-coded restrictions" that clean up obvious errors — but kept SAFE
 * (only operations that can't turn a right answer into a wrong one), and always
 * MEASURED against the grader rather than assumed to help. run-eval applies
 * these with --postprocess so you can A/B their effect on accuracy before
 * shipping any of them to the worker.
 *
 * What's here (safe):
 *   - merge adjacent sections with the same canonical label (a boundary the
 *     detector inserted between two "verse"s with no label change is spurious);
 *   - absorb a too-short section into its neighbor (kills the "extra verse where
 *     there isn't one" specks from over-segmentation).
 *
 * What's deliberately NOT here: forcing a canonical template, capping choruses,
 * or relabeling by count. Those need the acoustic repetition signal (which
 * recurring part is the chorus) and can corrupt a correct-but-unusual song — so
 * they belong in the detector (foote-analyze's labeler), gated by the grader.
 */
import { canonicalizeLabel, type Segmentation, type Segment } from './grade';

export interface PostprocessOptions {
  /** sections shorter than this (seconds) get absorbed into a neighbor */
  minSectionSec?: number;
}

export function applyStructuralConstraints(
  seg: Segmentation,
  opts: PostprocessOptions = {},
): Segmentation {
  const minSec = opts.minSectionSec ?? 6;
  let segs = seg.segments
    .map((s) => ({ ...s }))
    .sort((a, b) => a.start - b.start);

  segs = mergeAdjacentSameLabel(segs);
  segs = absorbShort(segs, minSec);
  segs = mergeAdjacentSameLabel(segs); // re-merge in case absorption created neighbors

  return { segments: segs, duration: seg.duration };
}

function mergeAdjacentSameLabel(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && canonicalizeLabel(prev.label) === canonicalizeLabel(s.label)) {
      prev.end = s.end; // extend previous over this one
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

function absorbShort(segs: Segment[], minSec: number): Segment[] {
  if (segs.length <= 1) return segs;
  const out: Segment[] = segs.map((s) => ({ ...s }));
  let i = 0;
  while (i < out.length && out.length > 1) {
    const dur = out[i].end - out[i].start;
    if (dur >= minSec) {
      i++;
      continue;
    }
    // Absorb into the longer adjacent neighbor (extend that neighbor's span).
    const prev = out[i - 1];
    const next = out[i + 1];
    if (prev && (!next || prev.end - prev.start >= next.end - next.start)) {
      prev.end = out[i].end;
      out.splice(i, 1);
      i = Math.max(0, i - 1);
    } else if (next) {
      next.start = out[i].start;
      out.splice(i, 1);
      // stay at i (now the former next)
    } else {
      i++;
    }
  }
  return out;
}
