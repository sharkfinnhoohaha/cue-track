import { describe, it, expect } from 'vitest';
import { sectionsToSegmentation } from './convert';

describe('sectionsToSegmentation', () => {
  it('converts bars to seconds at the detected bpm (4/4)', () => {
    // 120 bpm → secondsPerBar = 240/120 = 2s.
    const seg = sectionsToSegmentation({
      bpm: 120,
      duration: 28,
      suggestedSections: [
        { name: 'Intro', bars: 4 }, // 0–8s
        { name: 'Verse', bars: 6 }, // 8–20s
        { name: 'Chorus', bars: 4 }, // 20–28s
      ],
    });
    expect(seg.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 8],
      [8, 20],
      [20, 28],
    ]);
    expect(seg.segments.map((s) => s.label)).toEqual(['Intro', 'Verse', 'Chorus']);
  });

  it('clamps the final boundary to the true duration', () => {
    const seg = sectionsToSegmentation({
      bpm: 100,
      duration: 30, // shorter than the bars imply
      suggestedSections: [
        { name: 'Verse', bars: 8 },
        { name: 'Chorus', bars: 8 },
      ],
    });
    expect(seg.segments[seg.segments.length - 1].end).toBe(30);
  });
});
