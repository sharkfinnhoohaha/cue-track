import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for runAnalyzeJob's worker-vs-in-process resolution.
 *
 * The analyze pipeline must keep working without the Cloud Run worker:
 *   - worker unconfigured        -> analyze in-process (method 'template')
 *   - worker unreachable/5xx/401 -> fall back to in-process
 *   - worker rejects the file    -> fail the job (in-process would too)
 *   - worker healthy             -> use the worker result (method 'foote')
 */

const {
  mockAnalyzeAudio,
  mockDel,
  mockRecordUploadAnalysis,
  claimReturning,
  insertReturning,
  doneOrFailWhere,
  mockUpdate,
  mockInsert,
} = vi.hoisted(() => ({
  mockAnalyzeAudio: vi.fn(),
  mockDel: vi.fn(),
  mockRecordUploadAnalysis: vi.fn(),
  claimReturning: vi.fn(),
  insertReturning: vi.fn(),
  doneOrFailWhere: vi.fn(),
  mockUpdate: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { update: mockUpdate, insert: mockInsert },
  analyzeJobs: { id: 'analyze_jobs_id', status: 'analyze_jobs_status' },
  tracks: { id: 'tracks_id' },
}));
vi.mock('@vercel/blob', () => ({ del: mockDel }));
vi.mock('@/lib/audio/analyze', () => ({ analyzeAudio: mockAnalyzeAudio }));
vi.mock('@/lib/upload-quota', () => ({
  recordUploadAnalysis: mockRecordUploadAnalysis,
}));

import { runAnalyzeJob } from './analyze-jobs';

const IN_PROCESS_RESULT = {
  bpm: 128,
  duration: 200,
  sampleRate: 44100,
  suggestedSections: [{ id: 's1', name: 'Loop', bars: 4 }],
};

const WORKER_RESULT = {
  bpm: 90,
  duration: 180,
  sampleRate: 48000,
  suggestedSections: [{ id: 'w1', name: 'Intro', bars: 2 }],
};

function baseArgs(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job-1',
    blobUrl: 'https://x.public.blob.vercel-storage.com/a.mp3',
    mime: 'audio/mpeg',
    title: 'Song',
    method: 'foote' as const,
    identifier: 'ip:hash',
    userId: null,
    workerUrl: 'https://worker.example',
    workerSecret: 'secret',
    workerPath: '/analyze/foote',
    ...overrides,
  };
}

/** Capture the result payload written when the job is marked done. */
let lastDoneSet: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  lastDoneSet = null;

  // db.update(...).set(...).where(...) — used for both the queued->running
  // claim (chained .returning) and the terminal done/failed write (awaited).
  mockUpdate.mockImplementation(() => ({
    set: (payload: Record<string, unknown>) => {
      if (payload.status === 'done' || payload.status === 'failed') {
        lastDoneSet = payload;
      }
      return {
        where: (...whereArgs: unknown[]) => {
          const p = doneOrFailWhere(...whereArgs) as Promise<unknown>;
          // Claim path calls .returning(); terminal path awaits directly.
          return Object.assign(Promise.resolve(p), {
            returning: claimReturning,
          });
        },
      };
    },
  }));
  mockInsert.mockImplementation(() => ({
    values: () => ({ returning: insertReturning }),
  }));

  claimReturning.mockResolvedValue([{ id: 'job-1' }]); // claim succeeds
  insertReturning.mockResolvedValue([{ id: 'track-1' }]);
  doneOrFailWhere.mockResolvedValue(undefined);
  mockDel.mockResolvedValue(undefined);
  mockRecordUploadAnalysis.mockResolvedValue(undefined);
  mockAnalyzeAudio.mockResolvedValue(IN_PROCESS_RESULT);
});

describe('runAnalyzeJob worker fallback', () => {
  it('analyzes in-process when no worker is configured', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      );

    await runAnalyzeJob(baseArgs({ workerUrl: '', workerSecret: '' }));

    expect(mockAnalyzeAudio).toHaveBeenCalledTimes(1);
    // Only the blob download should have been fetched, never a worker URL.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('blob.vercel-storage.com');
    expect(lastDoneSet?.status).toBe('done');
    expect((lastDoneSet?.result as { method?: string })?.method).toBe('template');
    expect(mockDel).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('falls back to in-process when the worker fetch throws', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const u = String(input);
        if (u.includes('worker.example')) throw new Error('ECONNREFUSED');
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      });

    await runAnalyzeJob(baseArgs());

    expect(mockAnalyzeAudio).toHaveBeenCalledTimes(1);
    expect(lastDoneSet?.status).toBe('done');
    expect((lastDoneSet?.result as { method?: string })?.method).toBe('template');
    fetchSpy.mockRestore();
  });

  it('falls back to in-process on a worker 5xx', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const u = String(input);
        if (u.includes('worker.example')) {
          return new Response('upstream down', { status: 503 });
        }
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      });

    await runAnalyzeJob(baseArgs());

    expect(mockAnalyzeAudio).toHaveBeenCalledTimes(1);
    expect(lastDoneSet?.status).toBe('done');
    fetchSpy.mockRestore();
  });

  it('fails the job (no fallback) when the worker rejects the file', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const u = String(input);
        if (u.includes('worker.example')) {
          return new Response(
            JSON.stringify({ error: 'decode_failed', detail: 'bad mp3' }),
            { status: 422 },
          );
        }
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      });

    await runAnalyzeJob(baseArgs());

    expect(mockAnalyzeAudio).not.toHaveBeenCalled();
    expect(lastDoneSet?.status).toBe('failed');
    expect(String(lastDoneSet?.errorText)).toContain('bad mp3');
    fetchSpy.mockRestore();
  });

  it('uses the worker result when the worker is healthy', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const u = String(input);
        if (u.includes('worker.example')) {
          return new Response(JSON.stringify(WORKER_RESULT), { status: 200 });
        }
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      });

    await runAnalyzeJob(baseArgs());

    expect(mockAnalyzeAudio).not.toHaveBeenCalled();
    expect(lastDoneSet?.status).toBe('done');
    expect((lastDoneSet?.result as { method?: string })?.method).toBe('foote');
    expect((lastDoneSet?.result as { bpm?: number })?.bpm).toBe(90);
    fetchSpy.mockRestore();
  });
});
