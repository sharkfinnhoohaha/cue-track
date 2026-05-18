import { describe, it, expect, beforeEach } from 'vitest';
import { pickMethod, workerForMethod } from './analyze-router';

function ctx(identifier: string, query = ''): { identifier: string; url: URL } {
  const url = new URL(`https://example.test/api/tracks/analyze${query}`);
  return { identifier, url };
}

describe('pickMethod', () => {
  beforeEach(() => {
    delete process.env.ML_WORKER_URL;
    delete process.env.ML_WORKER_SHARED_SECRET;
    delete process.env.ANALYZE_AB_SPLIT_PERCENT;
  });

  it('returns foote when ML worker URL is not configured', () => {
    process.env.ANALYZE_AB_SPLIT_PERCENT = '100';
    expect(pickMethod(ctx('user:1'))).toBe('foote');
  });

  it('returns foote at split 0', () => {
    process.env.ML_WORKER_URL = 'https://ml.example';
    process.env.ANALYZE_AB_SPLIT_PERCENT = '0';
    expect(pickMethod(ctx('user:1'))).toBe('foote');
    expect(pickMethod(ctx('user:2'))).toBe('foote');
  });

  it('returns ml at split 100', () => {
    process.env.ML_WORKER_URL = 'https://ml.example';
    process.env.ANALYZE_AB_SPLIT_PERCENT = '100';
    expect(pickMethod(ctx('user:1'))).toBe('ml');
  });

  it('is stable on identifier (same caller always same method)', () => {
    process.env.ML_WORKER_URL = 'https://ml.example';
    process.env.ANALYZE_AB_SPLIT_PERCENT = '50';
    const first = pickMethod(ctx('user:7'));
    const second = pickMethod(ctx('user:7'));
    expect(first).toBe(second);
  });

  it('distributes ~roughly 50/50 across identifiers at split=50', () => {
    process.env.ML_WORKER_URL = 'https://ml.example';
    process.env.ANALYZE_AB_SPLIT_PERCENT = '50';
    let ml = 0;
    let foote = 0;
    for (let i = 0; i < 1000; i++) {
      if (pickMethod(ctx(`user:${i}`)) === 'ml') ml += 1;
      else foote += 1;
    }
    // Sha256-based bucket should be within ±10% of 500 (3-sigma is ~50)
    expect(Math.abs(ml - 500)).toBeLessThan(80);
    expect(Math.abs(foote - 500)).toBeLessThan(80);
  });

  it('honors ?method=foote override even when split=100', () => {
    process.env.ML_WORKER_URL = 'https://ml.example';
    process.env.ANALYZE_AB_SPLIT_PERCENT = '100';
    expect(pickMethod(ctx('user:1', '?method=foote'))).toBe('foote');
  });

  it('honors ?method=ml override even when split=0', () => {
    process.env.ML_WORKER_URL = 'https://ml.example';
    process.env.ANALYZE_AB_SPLIT_PERCENT = '0';
    expect(pickMethod(ctx('user:1', '?method=ml'))).toBe('ml');
  });

  it('honors ?method=template override', () => {
    process.env.ML_WORKER_URL = 'https://ml.example';
    expect(pickMethod(ctx('user:1', '?method=template'))).toBe('template');
  });

  it('ignores invalid ?method values', () => {
    process.env.ML_WORKER_URL = 'https://ml.example';
    process.env.ANALYZE_AB_SPLIT_PERCENT = '0';
    expect(pickMethod(ctx('user:1', '?method=bogus'))).toBe('foote');
  });

  it('clamps invalid split percent to 0', () => {
    process.env.ML_WORKER_URL = 'https://ml.example';
    process.env.ANALYZE_AB_SPLIT_PERCENT = 'NaN';
    expect(pickMethod(ctx('user:1'))).toBe('foote');
  });

  it('clamps split > 100 to 100', () => {
    process.env.ML_WORKER_URL = 'https://ml.example';
    process.env.ANALYZE_AB_SPLIT_PERCENT = '500';
    expect(pickMethod(ctx('user:1'))).toBe('ml');
  });
});

describe('workerForMethod', () => {
  beforeEach(() => {
    process.env.AUDIO_WORKER_URL = 'https://node.example';
    process.env.AUDIO_WORKER_SHARED_SECRET = 'node-secret';
    process.env.ML_WORKER_URL = 'https://ml.example';
    process.env.ML_WORKER_SHARED_SECRET = 'ml-secret';
  });

  it('routes template to Node worker /analyze', () => {
    const w = workerForMethod('template');
    expect(w.url).toBe('https://node.example');
    expect(w.secret).toBe('node-secret');
    expect(w.path).toBe('/analyze');
  });

  it('routes foote to Node worker /analyze/foote', () => {
    const w = workerForMethod('foote');
    expect(w.url).toBe('https://node.example');
    expect(w.secret).toBe('node-secret');
    expect(w.path).toBe('/analyze/foote');
  });

  it('routes ml to ML worker /analyze', () => {
    const w = workerForMethod('ml');
    expect(w.url).toBe('https://ml.example');
    expect(w.secret).toBe('ml-secret');
    expect(w.path).toBe('/analyze');
  });
});
