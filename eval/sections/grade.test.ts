import { describe, it, expect } from 'vitest';
import {
  gradeSong,
  aggregate,
  canonicalizeLabel,
  boundaryFMeasure,
  perSectionCorrectness,
  frameLabelAccuracy,
  type Segmentation,
} from './grade';

// A realistic 200s reference structure.
const REF: Segmentation = {
  duration: 200,
  segments: [
    { start: 0, end: 16, label: 'Intro' },
    { start: 16, end: 48, label: 'Verse' },
    { start: 48, end: 80, label: 'Chorus' },
    { start: 80, end: 112, label: 'Verse' },
    { start: 112, end: 144, label: 'Chorus' },
    { start: 144, end: 168, label: 'Bridge' },
    { start: 168, end: 192, label: 'Chorus' },
    { start: 192, end: 200, label: 'Outro' },
  ],
};

function shifted(by: number): Segmentation {
  return {
    duration: REF.duration,
    segments: REF.segments.map((s, i) => ({
      start: i === 0 ? 0 : s.start + by,
      end: i === REF.segments.length - 1 ? REF.duration : s.end + by,
      label: s.label,
    })),
  };
}

describe('canonicalizeLabel', () => {
  it('maps synonyms and unknowns', () => {
    expect(canonicalizeLabel('Chorus')).toBe('chorus');
    expect(canonicalizeLabel('refrain')).toBe('chorus');
    expect(canonicalizeLabel('pre-chorus')).toBe('prechorus');
    expect(canonicalizeLabel('Outro')).toBe('outro');
    expect(canonicalizeLabel('A')).toBe('other'); // opaque cluster id
    expect(canonicalizeLabel('Segment 3')).toBe('other');
  });
});

describe('grader on a perfect prediction', () => {
  it('scores ~1.0 and meets target', () => {
    const s = gradeSong(REF, REF);
    expect(s.perSection).toBe(1);
    expect(s.frameAccuracy).toBeCloseTo(1, 5);
    expect(s.boundaryF05).toBeCloseTo(1, 5);
    expect(s.valid).toBe(true);
    const agg = aggregate([s]);
    expect(agg.meetsTarget).toBe(true);
    expect(agg.headline).toBe(1);
  });
});

describe('grader tolerates small boundary error', () => {
  it('still scores high when boundaries are within tolerance', () => {
    const s = gradeSong(REF, shifted(1.5)); // 1.5s off, labels correct
    expect(s.perSection).toBeGreaterThan(0.85);
    expect(s.boundaryF3).toBeGreaterThan(0.85);
    expect(s.valid).toBe(true);
  });
  it('penalizes boundaries beyond tolerance', () => {
    const s = gradeSong(REF, shifted(6)); // 6s off — outside 3s section tol
    expect(s.perSection).toBeLessThan(0.4);
    expect(s.boundaryF05).toBeLessThan(0.3);
  });
});

// --- Adversarial: these are the cheats the grader must NOT reward ---

describe('CHEAT: label everything chorus', () => {
  it('cannot exceed chorus timeline share and is flagged', () => {
    const pred: Segmentation = {
      duration: 200,
      segments: [{ start: 0, end: 200, label: 'Chorus' }],
    };
    const s = gradeSong(REF, pred);
    // Chorus covers ~88/200 = 44% of the timeline; frame acc is capped there.
    expect(s.frameAccuracy).toBeLessThan(0.5);
    expect(s.degeneracy.flags).toContain('label_collapse');
    expect(s.degeneracy.flags).toContain('under_segmented');
    expect(s.valid).toBe(false);
    expect(aggregate([s]).meetsTarget).toBe(false);
  });
});

describe('CHEAT: over-segment to spray boundaries', () => {
  it('blows up the denominator and trips guards', () => {
    // A boundary every 4s, all labeled chorus — tries to "hit" every ref boundary.
    const segments = [];
    for (let t = 0; t < 200; t += 4) {
      segments.push({ start: t, end: Math.min(t + 4, 200), label: 'Chorus' });
    }
    const pred: Segmentation = { duration: 200, segments };
    const s = gradeSong(REF, pred);
    expect(s.perSection).toBeLessThan(0.2); // max(50, 8) denominator
    expect(s.degeneracy.flags).toContain('over_segmented');
    expect(s.degeneracy.flags).toContain('boundary_spam');
    expect(s.valid).toBe(false);
    expect(aggregate([s]).meetsTarget).toBe(false);
  });
});

describe('CHEAT: opaque cluster labels (A/B/C)', () => {
  it('earns nothing on per-section and is flagged unlabeled', () => {
    const pred: Segmentation = {
      duration: 200,
      segments: REF.segments.map((s, i) => ({
        start: s.start,
        end: s.end,
        label: String.fromCharCode(65 + (i % 3)), // A/B/C
      })),
    };
    const s = gradeSong(REF, pred);
    // Boundaries are perfect, but labels are opaque → no section is "correct".
    expect(s.boundaryF05).toBeGreaterThan(0.9);
    expect(s.perSection).toBe(0);
    expect(s.degeneracy.flags).toContain('unlabeled');
    expect(s.valid).toBe(false);
  });
});

describe('CHEAT: one giant segment to maximize frame accuracy', () => {
  it('is caught by under-segmentation + collapse flags', () => {
    const pred: Segmentation = {
      duration: 200,
      segments: [{ start: 0, end: 200, label: 'Verse' }],
    };
    const s = gradeSong(REF, pred);
    expect(s.degeneracy.flags).toContain('under_segmented');
    expect(s.perSection).toBeLessThan(0.2);
    expect(s.valid).toBe(false);
  });
});

describe('boundary F is one-to-one', () => {
  it('duplicate predictions near one ref boundary count once', () => {
    const pred: Segmentation = {
      duration: 200,
      segments: [
        { start: 0, end: 47, label: 'Intro' },
        { start: 47, end: 48, label: 'Verse' }, // three preds clustered at the 48s ref boundary
        { start: 48, end: 49, label: 'Chorus' },
        { start: 49, end: 200, label: 'Chorus' },
      ],
    };
    const b = boundaryFMeasure(REF, pred, 0.5);
    // 3 predicted boundaries near 48 should yield at most 1 hit there.
    expect(b.hits).toBeLessThanOrEqual(b.numRef);
    expect(b.precision).toBeLessThan(0.6);
  });
});

describe('frame accuracy and per-section are independent signals', () => {
  it('a partially-correct prediction scores partially on both', () => {
    // Correct first half, wrong (verse-labeled) second half.
    const pred: Segmentation = {
      duration: 200,
      segments: [
        { start: 0, end: 16, label: 'Intro' },
        { start: 16, end: 48, label: 'Verse' },
        { start: 48, end: 80, label: 'Chorus' },
        { start: 80, end: 200, label: 'Verse' },
      ],
    };
    const fa = frameLabelAccuracy(REF, pred);
    const ps = perSectionCorrectness(REF, pred, 3);
    expect(fa).toBeGreaterThan(0.4);
    expect(fa).toBeLessThan(0.75);
    // intro@0, verse@16, chorus@48, and verse@80 (the pred's long verse start
    // aligns with the reference's second verse) all match one-to-one.
    expect(ps.matched).toBe(4);
  });
});
