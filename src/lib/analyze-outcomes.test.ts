import { describe, it, expect } from 'vitest';
import { computeDeltas } from './analyze-outcomes';

describe('computeDeltas', () => {
  it('returns zeros when snapshot and final match exactly', () => {
    const snap = [
      { id: 'a', name: 'Intro', bars: 4 },
      { id: 'b', name: 'Verse', bars: 8 },
    ];
    const final = [
      { id: 'a', name: 'Intro', bars: 4 },
      { id: 'b', name: 'Verse', bars: 8 },
    ];
    expect(computeDeltas(snap, final)).toEqual({
      numSectionsDelta: 0,
      totalBarsDelta: 0,
      nameEditCount: 0,
    });
  });

  it('counts a section-count mismatch', () => {
    const snap = [{ id: 'a', name: 'Intro', bars: 4 }];
    const final = [
      { id: 'a', name: 'Intro', bars: 4 },
      { id: 'b', name: 'Verse', bars: 8 },
    ];
    expect(computeDeltas(snap, final).numSectionsDelta).toBe(1);
  });

  it('sums absolute bar deltas on the zipped prefix', () => {
    const snap = [
      { id: 'a', name: 'Intro', bars: 4 },
      { id: 'b', name: 'Verse', bars: 16 },
      { id: 'c', name: 'Chorus', bars: 16 },
    ];
    const final = [
      { id: 'a', name: 'Intro', bars: 8 },   // +4
      { id: 'b', name: 'Verse', bars: 12 },  // -4
      { id: 'c', name: 'Chorus', bars: 20 }, // +4
    ];
    expect(computeDeltas(snap, final).totalBarsDelta).toBe(12);
  });

  it('counts name edits on the zipped prefix', () => {
    const snap = [
      { id: 'a', name: 'Intro', bars: 4 },
      { id: 'b', name: 'Verse', bars: 8 },
      { id: 'c', name: 'Chorus', bars: 8 },
    ];
    const final = [
      { id: 'a', name: 'Pre-Intro', bars: 4 },  // edited
      { id: 'b', name: 'Verse', bars: 8 },      // same
      { id: 'c', name: 'Hook', bars: 8 },       // edited
    ];
    expect(computeDeltas(snap, final).nameEditCount).toBe(2);
  });

  it('ignores trailing elements when arrays differ in length', () => {
    const snap = [
      { id: 'a', name: 'Intro', bars: 4 },
      { id: 'b', name: 'Verse', bars: 8 },
      { id: 'c', name: 'Chorus', bars: 8 },
    ];
    const final = [
      { id: 'a', name: 'Intro', bars: 4 },
    ];
    // numSectionsDelta = 2, totalBarsDelta on zipped prefix of 1 = 0
    const d = computeDeltas(snap, final);
    expect(d.numSectionsDelta).toBe(2);
    expect(d.totalBarsDelta).toBe(0);
    expect(d.nameEditCount).toBe(0);
  });

  it('handles empty arrays', () => {
    expect(computeDeltas([], [])).toEqual({
      numSectionsDelta: 0,
      totalBarsDelta: 0,
      nameEditCount: 0,
    });
  });
});
