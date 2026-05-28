import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for GET /api/tracks/analyze/jobs/[id]. Verifies identifier guard,
 * status payload, and the not-found case (which returns 404 even for
 * jobs that exist but belong to other callers, to avoid existence
 * leakage).
 */

const { mockAuth, mockSelect, mockUpdateReturning } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdateReturning: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mockAuth }));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockSelect(),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => mockUpdateReturning(),
        }),
      }),
    }),
  },
  analyzeJobs: {
    id: 'mock_id',
    identifier: 'mock_identifier',
    method: 'mock_method',
    status: 'mock_status',
    result: 'mock_result',
    errorText: 'mock_error',
    createdAt: 'mock_created',
    startedAt: 'mock_started',
    finishedAt: 'mock_finished',
  },
}));

import { GET } from './route';

function makeRequest(ip = '203.0.113.10'): NextRequest {
  return new NextRequest('https://example.test/api/tracks/analyze/jobs/foo', {
    headers: { 'x-forwarded-for': ip },
  });
}

const ROW = {
  id: 'job-xyz',
  identifier: 'ip:abc123',
  method: 'foote',
  status: 'queued',
  result: null,
  errorText: null,
  // Recent so the in-flight cases are not treated as stale. The stale-job
  // path is exercised explicitly with an old timestamp below.
  createdAt: new Date(),
  startedAt: null,
  finishedAt: null,
};

describe('GET /api/tracks/analyze/jobs/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.RATE_LIMIT_IP_SALT = 'salt';
    mockAuth.mockResolvedValue(null);
    // Default: a stale-job flip claims the row. Overridden where it matters.
    mockUpdateReturning.mockResolvedValue([{ id: 'job-xyz' }]);
  });

  it('returns 404 when no row exists', async () => {
    mockSelect.mockResolvedValue([]);
    const res = await GET(makeRequest(), { params: { id: 'job-xyz' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 when identifier does not match (existence leak guard)', async () => {
    mockSelect.mockResolvedValue([{ ...ROW, identifier: 'ip:someoneelse' }]);
    const res = await GET(makeRequest(), { params: { id: 'job-xyz' } });
    expect(res.status).toBe(404);
  });

  it('returns 200 + queued status for the rightful caller', async () => {
    // The hash mocking is awkward; instead, return a row whose identifier
    // matches whatever the route computes from the request IP.
    mockSelect.mockImplementationOnce(async () => {
      // recompute the identifier the same way the route does
      const ipHash = (await import('@/lib/rate-limit')).getClientIpHash(makeRequest());
      return [{ ...ROW, identifier: `ip:${ipHash}` }];
    });
    const res = await GET(makeRequest(), { params: { id: 'job-xyz' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe('job-xyz');
    expect(body.status).toBe('queued');
    expect(body.method).toBe('foote');
    expect(body.result).toBeNull();
    expect(body.error).toBeNull();
  });

  it('returns result payload for done jobs', async () => {
    mockSelect.mockImplementationOnce(async () => {
      const ipHash = (await import('@/lib/rate-limit')).getClientIpHash(makeRequest());
      return [
        {
          ...ROW,
          identifier: `ip:${ipHash}`,
          status: 'done',
          result: { trackId: 't-1', bpm: 120, suggestedSections: [] },
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      ];
    });
    const res = await GET(makeRequest(), { params: { id: 'job-xyz' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('done');
    expect(body.result.trackId).toBe('t-1');
  });

  it('returns error string for failed jobs', async () => {
    mockSelect.mockImplementationOnce(async () => {
      const ipHash = (await import('@/lib/rate-limit')).getClientIpHash(makeRequest());
      return [
        {
          ...ROW,
          identifier: `ip:${ipHash}`,
          status: 'failed',
          errorText: 'Worker exploded',
          finishedAt: new Date(),
        },
      ];
    });
    const res = await GET(makeRequest(), { params: { id: 'job-xyz' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('failed');
    expect(body.error).toBe('Worker exploded');
  });

  it('fails a stale running job and reports it instead of staying running', async () => {
    const stale = new Date(Date.now() - 600_000); // 10 min ago, past the budget
    mockSelect.mockImplementationOnce(async () => {
      const ipHash = (await import('@/lib/rate-limit')).getClientIpHash(makeRequest());
      return [
        {
          ...ROW,
          identifier: `ip:${ipHash}`,
          status: 'running',
          startedAt: stale,
          createdAt: stale,
        },
      ];
    });
    const res = await GET(makeRequest(), { params: { id: 'job-xyz' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('failed');
    expect(body.error).toMatch(/processing limit/i);
  });

  it('returns 400 when no identifier can be determined', async () => {
    mockSelect.mockResolvedValue([]);
    const req = new NextRequest('https://example.test/api/tracks/analyze/jobs/foo');
    const res = await GET(req, { params: { id: 'job-xyz' } });
    expect(res.status).toBe(400);
  });
});
