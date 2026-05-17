import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Mocks the @/lib/db dynamic import so tests can control db.delete().where()
 * .returning() without spinning up Postgres. We re-mock per test because
 * vitest's vi.mock hoisting interacts with the dynamic import() inside the
 * route under test.
 */
const mockReturning = vi.fn();
const mockWhere = vi.fn(() => ({ returning: mockReturning }));
const mockDelete = vi.fn(() => ({ where: mockWhere }));

vi.mock('@/lib/db', () => ({
  db: { delete: mockDelete },
  rateLimits: { createdAt: 'mock_created_at_column', id: 'mock_id_column' },
}));

import { GET } from './route';

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://example.test/api/cron/cleanup-rate-limits', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/cron/cleanup-rate-limits', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mockReturning.mockReset();
    mockWhere.mockClear();
    mockDelete.mockClear();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('returns 503 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('CRON_SECRET not configured');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is missing', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization bearer does not match', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const res = await GET(makeRequest({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization is malformed (no Bearer prefix)', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const res = await GET(makeRequest({ authorization: 'test-secret' }));
    expect(res.status).toBe(401);
  });

  it('deletes rows and returns 200 with deletedCount on success', async () => {
    process.env.CRON_SECRET = 'test-secret';
    mockReturning.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deletedCount).toBe(3);
    expect(typeof body.cutoff).toBe('string');
    expect(new Date(body.cutoff).toString()).not.toBe('Invalid Date');
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('returns 200 with deletedCount 0 when no rows match', async () => {
    process.env.CRON_SECRET = 'test-secret';
    mockReturning.mockResolvedValue([]);
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deletedCount).toBe(0);
  });

  it('fails soft (200, ok=false, error message) when the delete throws', async () => {
    process.env.CRON_SECRET = 'test-secret';
    mockReturning.mockRejectedValue(new Error('relation "rate_limits" does not exist'));
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.deletedCount).toBe(0);
    expect(body.error).toMatch(/rate_limits/);
  });

  it('cutoff is roughly 24 hours before now', async () => {
    process.env.CRON_SECRET = 'test-secret';
    mockReturning.mockResolvedValue([]);
    const before = Date.now();
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }));
    const body = await res.json();
    const cutoffMs = new Date(body.cutoff).getTime();
    const expectedCutoffMs = before - 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoffMs - expectedCutoffMs)).toBeLessThan(5_000);
  });
});
