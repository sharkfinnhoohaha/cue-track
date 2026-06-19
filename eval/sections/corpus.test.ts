import { describe, it, expect } from 'vitest';
import { splitFor, partition, TestSetGuard, DEFAULT_RATIOS, type CorpusEntry } from './corpus';

function fakeEntries(n: number): CorpusEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `song-${String(i).padStart(4, '0')}`,
    audioPath: `audio/song-${i}.mp3`,
    ref: { duration: 100, segments: [] },
    source: 'test',
  }));
}

describe('split determinism', () => {
  it('assigns the same song to the same split every time', () => {
    const a = splitFor('song-42');
    const b = splitFor('song-42');
    expect(a).toBe(b);
  });

  it('a song never changes split across calls (no re-rolling)', () => {
    const ids = fakeEntries(200).map((e) => e.id);
    const first = ids.map((id) => splitFor(id));
    const second = ids.map((id) => splitFor(id));
    expect(second).toEqual(first);
  });

  it('roughly honors the ratios on a large set', () => {
    const parts = partition(fakeEntries(2000), DEFAULT_RATIOS);
    const total = 2000;
    expect(parts.train.length / total).toBeGreaterThan(0.5);
    expect(parts.train.length / total).toBeLessThan(0.7);
    expect(parts.test.length / total).toBeGreaterThan(0.12);
    expect(parts.test.length / total).toBeLessThan(0.28);
  });

  it('partitions are disjoint and cover everything', () => {
    const entries = fakeEntries(500);
    const parts = partition(entries);
    const all = [...parts.train, ...parts.dev, ...parts.test].map((e) => e.id).sort();
    expect(all).toEqual(entries.map((e) => e.id).sort());
    const ids = new Set(all);
    expect(ids.size).toBe(500); // no duplicates across splits
  });
});

describe('TestSetGuard', () => {
  it('allows up to the budget then throws', () => {
    const guard = new TestSetGuard(3);
    expect(guard.evaluate(() => 1)).toBe(1);
    expect(guard.evaluate(() => 2)).toBe(2);
    expect(guard.evaluate(() => 3)).toBe(3);
    expect(guard.remaining).toBe(0);
    expect(() => guard.evaluate(() => 4)).toThrow(/budget/i);
  });
});
