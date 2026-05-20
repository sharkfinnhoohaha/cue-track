import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for POST /api/tracks/analyze (Phase D async, blob-uploaded).
 *
 * The route accepts JSON with the URL of an audio blob the client has
 * already uploaded to Vercel Blob via /api/tracks/analyze/upload. It
 * enqueues an analyze_jobs row, returns 202 + { jobId }, and kicks off
 * the worker call via @vercel/functions waitUntil. The actual worker
 * fetch + tracks insert + blob cleanup happen in src/lib/analyze-jobs.ts.
 */

const {
  mockAuth,
  mockInsert,
  mockValues,
  mockReturning,
  mockCheckAndRecord,
  mockResolveUploadTier,
  mockCheckUploadQuota,
  mockWaitUntil,
  mockRunAnalyzeJob,
} = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  return {
    mockAuth: vi.fn(),
    mockInsert,
    mockValues,
    mockReturning,
    mockCheckAndRecord: vi.fn(),
    mockResolveUploadTier: vi.fn(),
    mockCheckUploadQuota: vi.fn(),
    mockWaitUntil: vi.fn(),
    mockRunAnalyzeJob: vi.fn(),
  };
});

vi.mock('@/auth', () => ({ auth: mockAuth }));

vi.mock('@/lib/db', () => ({
  db: { insert: mockInsert },
  analyzeJobs: { id: 'mock_analyze_jobs_id_column' },
  tracks: { id: 'mock_tracks_id_column' },
}));

vi.mock('@/lib/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rate-limit')>(
    '@/lib/rate-limit',
  );
  return {
    ...actual,
    checkAndRecordRateLimit: mockCheckAndRecord,
  };
});

vi.mock('@/lib/upload-quota', () => ({
  resolveUploadTier: mockResolveUploadTier,
  checkUploadQuota: mockCheckUploadQuota,
  recordUploadAnalysis: vi.fn(),
}));

vi.mock('@vercel/functions', () => ({ waitUntil: mockWaitUntil }));

vi.mock('@/lib/analyze-jobs', () => ({ runAnalyzeJob: mockRunAnalyzeJob }));

import { POST } from './route';

interface RequestOverrides {
  blobUrl?: string | null;
  contentType?: string;
  filename?: string;
  size?: number | null;
}

function makeRequest(
  overrides: RequestOverrides = {},
  ip = '203.0.113.10',
): NextRequest {
  const payload: Record<string, unknown> = {
    blobUrl:
      overrides.blobUrl === undefined
        ? 'https://example.public.blob.vercel-storage.com/track-abc.mp3'
        : overrides.blobUrl,
    contentType: overrides.contentType ?? 'audio/mpeg',
    filename: overrides.filename ?? 'song.mp3',
    size: overrides.size === undefined ? 1024 * 1024 : overrides.size,
  };
  if (payload.blobUrl === null) delete payload.blobUrl;
  if (payload.size === null) delete payload.size;
  return new NextRequest('https://example.test/api/tracks/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'x-forwarded-for': ip,
      'content-type': 'application/json',
    },
  });
}

describe('POST /api/tracks/analyze (async, blob-uploaded)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.AUDIO_WORKER_URL = 'https://worker.example';
    process.env.AUDIO_WORKER_SHARED_SECRET = 'shh';
    process.env.DATABASE_URL = 'postgres://stub';
    process.env.RATE_LIMIT_IP_SALT = 'salt';
    delete process.env.ENABLE_ANALYZE_PAYWALL;

    mockAuth.mockResolvedValue(null);
    mockCheckAndRecord.mockResolvedValue({ allowed: true, current: 1, limit: 50 });
    mockResolveUploadTier.mockResolvedValue('anon');
    mockCheckUploadQuota.mockResolvedValue({ allowed: true, used: 0, limit: 1 });
    mockReturning.mockResolvedValue([{ id: 'job-abc-123' }]);
    mockRunAnalyzeJob.mockResolvedValue(undefined);
  });

  it('returns 202 + jobId on the happy path', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe('job-abc-123');
    expect(body.status).toBe('queued');
    expect(body.statusUrl).toBe('/api/tracks/analyze/jobs/job-abc-123');
    expect(mockWaitUntil).toHaveBeenCalledTimes(1);
    expect(mockRunAnalyzeJob).toHaveBeenCalledTimes(1);
    const runArgs = mockRunAnalyzeJob.mock.calls[0]?.[0];
    expect(runArgs?.jobId).toBe('job-abc-123');
    expect(runArgs?.method).toBe('foote');
    expect(runArgs?.workerPath).toBe('/analyze/foote');
    expect(runArgs?.mime).toBe('audio/mpeg');
    expect(runArgs?.blobUrl).toBe(
      'https://example.public.blob.vercel-storage.com/track-abc.mp3',
    );
    expect(runArgs?.identifier).toMatch(/^ip:/);
  });

  it('returns 400 when blobUrl is missing', async () => {
    const res = await POST(makeRequest({ blobUrl: null }));
    expect(res.status).toBe(400);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('rejects blobUrl from an external host', async () => {
    const res = await POST(makeRequest({ blobUrl: 'https://evil.example/song.mp3' }));
    expect(res.status).toBe(400);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('returns 413 when the size exceeds 150 MB', async () => {
    const res = await POST(makeRequest({ size: 151 * 1024 * 1024 }));
    expect(res.status).toBe(413);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('returns 415 on unsupported mime + extension', async () => {
    const res = await POST(
      makeRequest({ contentType: 'audio/flac', filename: 'song.flac' }),
    );
    expect(res.status).toBe(415);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('infers mime from the filename when contentType is missing', async () => {
    const res = await POST(
      makeRequest({ contentType: '', filename: 'song.mp3' }),
    );
    expect(res.status).toBe(202);
    const runArgs = mockRunAnalyzeJob.mock.calls[0]?.[0];
    expect(runArgs?.mime).toBe('audio/mpeg');
  });

  it('prefers the filename when contentType conflicts with the extension', async () => {
    const res = await POST(
      makeRequest({ contentType: 'audio/wav', filename: 'song.mp3' }),
    );
    expect(res.status).toBe(202);
    const runArgs = mockRunAnalyzeJob.mock.calls[0]?.[0];
    expect(runArgs?.mime).toBe('audio/mpeg');
  });

  it('returns 429 when the rate limiter rejects', async () => {
    mockCheckAndRecord.mockResolvedValue({
      allowed: false,
      current: 50,
      limit: 50,
      retryAfterSeconds: 1800,
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('returns 402 when paywall is enabled and quota is exhausted', async () => {
    process.env.ENABLE_ANALYZE_PAYWALL = 'true';
    mockCheckUploadQuota.mockResolvedValue({ allowed: false, used: 1, limit: 1 });
    const res = await POST(makeRequest());
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('UPLOAD_QUOTA_EXCEEDED');
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('returns 503 when worker env vars are missing', async () => {
    delete process.env.AUDIO_WORKER_URL;
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('returns 500 when the DB insert returns no rows', async () => {
    mockReturning.mockResolvedValue([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('uses user:<id> identifier when the caller is authenticated', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-42' } });
    await POST(makeRequest());
    const runArgs = mockRunAnalyzeJob.mock.calls[0]?.[0];
    expect(runArgs?.identifier).toBe('user:u-42');
    expect(runArgs?.userId).toBe('u-42');
  });
});
