import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for POST /api/tracks/analyze (Phase D async contract).
 *
 * The route now returns 202 + jobId after enqueueing an analyze_jobs row
 * and kicking off the worker call via @vercel/functions waitUntil. The
 * actual worker fetch + tracks insert happen in src/lib/analyze-jobs.ts
 * (covered by its own tests, not duplicated here).
 *
 * Pre-async sync-contract tests for this route lived at 434 lines; the
 * async refactor replaces them. See PR-B description for the contract
 * change. Background job behavior is covered indirectly by asserting
 * waitUntil was called with the runAnalyzeJob promise.
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

function makeAudioFile(
  name = 'song.wav',
  type = 'audio/wav',
  bytes = 4096,
): File {
  const buf = new Uint8Array(bytes).fill(1);
  return new File([buf], name, { type });
}

function makeRequest(file: File | null, ip = '203.0.113.10'): NextRequest {
  const form = new FormData();
  if (file) form.append('file', file);
  return new NextRequest('https://example.test/api/tracks/analyze', {
    method: 'POST',
    body: form,
    headers: { 'x-forwarded-for': ip },
  });
}

describe('POST /api/tracks/analyze (async)', () => {
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
    const res = await POST(makeRequest(makeAudioFile()));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe('job-abc-123');
    expect(body.status).toBe('queued');
    expect(body.statusUrl).toBe('/api/tracks/analyze/jobs/job-abc-123');
    expect(mockWaitUntil).toHaveBeenCalledTimes(1);
    expect(mockRunAnalyzeJob).toHaveBeenCalledTimes(1);
    const runArgs = mockRunAnalyzeJob.mock.calls[0]?.[0];
    expect(runArgs?.jobId).toBe('job-abc-123');
    // Router defaults to 'foote' when ML_WORKER_URL is unset (PR-D)
    expect(runArgs?.method).toBe('foote');
    expect(runArgs?.workerPath).toBe('/analyze/foote');
    expect(runArgs?.mime).toBe('audio/wav');
    expect(runArgs?.identifier).toMatch(/^ip:/);
  });

  it('returns 400 when no file is supplied', async () => {
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(400);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('returns 413 when the file exceeds 50 MB', async () => {
    const big = makeAudioFile('big.wav', 'audio/wav', 51 * 1024 * 1024);
    const res = await POST(makeRequest(big));
    expect(res.status).toBe(413);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('returns 415 on unsupported mime + extension', async () => {
    const res = await POST(makeRequest(makeAudioFile('song.flac', 'audio/flac')));
    expect(res.status).toBe(415);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('returns 429 when the rate limiter rejects', async () => {
    mockCheckAndRecord.mockResolvedValue({
      allowed: false,
      current: 50,
      limit: 50,
      retryAfterSeconds: 1800,
    });
    const res = await POST(makeRequest(makeAudioFile()));
    expect(res.status).toBe(429);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('returns 402 when paywall is enabled and quota is exhausted', async () => {
    process.env.ENABLE_ANALYZE_PAYWALL = 'true';
    mockCheckUploadQuota.mockResolvedValue({ allowed: false, used: 1, limit: 1 });
    const res = await POST(makeRequest(makeAudioFile()));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('UPLOAD_QUOTA_EXCEEDED');
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('returns 503 when worker env vars are missing', async () => {
    delete process.env.AUDIO_WORKER_URL;
    const res = await POST(makeRequest(makeAudioFile()));
    expect(res.status).toBe(503);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('returns 500 when the DB insert returns no rows', async () => {
    mockReturning.mockResolvedValue([]);
    const res = await POST(makeRequest(makeAudioFile()));
    expect(res.status).toBe(500);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it('uses user:<id> identifier when the caller is authenticated', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-42' } });
    await POST(makeRequest(makeAudioFile()));
    const runArgs = mockRunAnalyzeJob.mock.calls[0]?.[0];
    expect(runArgs?.identifier).toBe('user:u-42');
    expect(runArgs?.userId).toBe('u-42');
  });
});
