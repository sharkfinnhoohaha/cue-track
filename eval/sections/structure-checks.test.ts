import { describe, it, expect } from 'vitest';
import { checkStructure } from './structure-checks';
import { applyStructuralConstraints } from './structure-postprocess';
import type { Segmentation } from './grade';

function seg(labels: [string, number][], duration?: number): Segmentation {
  const segments = [];
  let t = 0;
  for (const [label, dur] of labels) {
    segments.push({ start: t, end: t + dur, label });
    t += dur;
  }
  return { segments, duration: duration ?? t };
}

describe('checkStructure', () => {
  it('passes a canonical song', () => {
    const s = seg([
      ['Intro', 16],
      ['Verse', 32],
      ['Chorus', 32],
      ['Verse', 32],
      ['Chorus', 32],
      ['Bridge', 24],
      ['Chorus', 32],
      ['Outro', 12],
    ]);
    const r = checkStructure(s);
    expect(r.plausible).toBe(true);
    expect(r.issues.filter((i) => i.severity === 'high')).toHaveLength(0);
  });

  it('flags 7 verses immediately (high severity, no labels needed)', () => {
    const s = seg(Array.from({ length: 7 }, () => ['Verse', 24] as [string, number]));
    const r = checkStructure(s);
    expect(r.plausible).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain('too_many_verses');
    expect(r.issues.map((i) => i.code)).toContain('repeated_label_run');
  });

  it('flags too many choruses', () => {
    // 6 choruses, 4 verses, long sections (not over-segmented) → isolates the flag.
    const s = seg([
      ['Intro', 16],
      ['Chorus', 24], ['Verse', 24], ['Chorus', 24], ['Verse', 24],
      ['Chorus', 24], ['Verse', 24], ['Chorus', 24], ['Verse', 24],
      ['Chorus', 24], ['Chorus', 24],
    ]);
    const r = checkStructure(s);
    expect(r.issues.map((i) => i.code)).toContain('too_many_choruses');
    expect(r.plausible).toBe(false);
  });

  it('flags over-segmentation', () => {
    // 30 sections in 60s = 30/min.
    const s = seg(Array.from({ length: 30 }, () => ['Verse', 2] as [string, number]), 60);
    const r = checkStructure(s);
    expect(r.issues.map((i) => i.code)).toContain('over_segmented');
  });

  it('flags a long song with no chorus (medium)', () => {
    const s = seg([['Intro', 30], ['Verse', 60], ['Verse', 60]], 150);
    const r = checkStructure(s);
    expect(r.issues.map((i) => i.code)).toContain('no_chorus');
  });
});

describe('applyStructuralConstraints', () => {
  it('merges adjacent same-label sections', () => {
    const s = seg([['Verse', 16], ['Verse', 16], ['Chorus', 16]]);
    const out = applyStructuralConstraints(s);
    expect(out.segments).toHaveLength(2);
    expect(out.segments[0]).toMatchObject({ start: 0, end: 32 });
    expect(out.segments.map((x) => x.label)).toEqual(['Verse', 'Chorus']);
  });

  it('absorbs a too-short spurious section into its neighbor', () => {
    // a 2s "verse" speck between two real choruses
    const s = seg([['Chorus', 32], ['Verse', 2], ['Chorus', 32]]);
    const out = applyStructuralConstraints(s, { minSectionSec: 6 });
    // The speck is absorbed, then the two choruses merge → one chorus.
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].label).toBe('Chorus');
    expect(out.duration).toBe(66);
  });

  it('is a no-op on a clean structure', () => {
    const s = seg([['Intro', 16], ['Verse', 32], ['Chorus', 32], ['Outro', 12]]);
    const out = applyStructuralConstraints(s);
    expect(out.segments).toHaveLength(4);
  });
});
