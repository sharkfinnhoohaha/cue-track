import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getClientIpHash, checkAndRecordRateLimit } from './rate-limit';

/**
 * Unit tests for the rate-limit helpers. getClientIpHash is a pure function
 * over Request headers and env vars; checkAndRecordRateLimit needs the
 * dynamic @/lib/db import mocked so we can exercise the fail-open branch
 * without a live Postgres.
 */

const { mockSelectChain, mockInsert } = vi.hoisted(() => ({
  mockSelectChain: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockImplementation(async () => mockSelectChain()),
        }),
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn().mockImplementation(async (...args) => mockInsert(...args)),
    })),
  },
  rateLimits: {
    identifier: 'mock_identifier',
    createdAt: 'mock_created_at',
  },
}));

function makeRequest(headers: Record<string, string>): Request {
  return new Request('https://example.test/api/tracks/generate', {
    method: 'POST',
    headers,
  });
}

describe('getClientIpHash', () => {
  const originalSalt = process.env.RATE_LIMIT_IP_SALT;

  beforeEach(() => {
    process.env.RATE_LIMIT_IP_SALT = 'test-salt-fixed';
  });

  afterEach(() => {
    if (originalSalt === undefined) delete process.env.RATE_LIMIT_IP_SALT;
    else process.env.RATE_LIMIT_IP_SALT = originalSalt;
  });

  it('returns null when neither x-forwarded-for nor x-real-ip is set', () => {
    const req = makeRequest({});
    expect(getClientIpHash(req)).toBeNull();
  });

  it('hashes the first entry in x-forwarded-for', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.5' });
    const result = getClientIpHash(req);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles comma-separated x-forwarded-for, taking the leftmost entry', () => {
    const req1 = makeRequest({ 'x-forwarded-for': '203.0.113.5, 198.51.100.7' });
    const req2 = makeRequest({ 'x-forwarded-for': '203.0.113.5' });
    expect(getClientIpHash(req1)).toBe(getClientIpHash(req2));
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = makeRequest({ 'x-real-ip': '203.0.113.99' });
    const result = getClientIpHash(req);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('prefers x-forwarded-for over x-real-ip when both are present', () => {
    const reqBoth = makeRequest({
      'x-forwarded-for': '203.0.113.5',
      'x-real-ip': '198.51.100.7',
    });
    const reqXffOnly = makeRequest({ 'x-forwarded-for': '203.0.113.5' });
    expect(getClientIpHash(reqBoth)).toBe(getClientIpHash(reqXffOnly));
  });

  it('produces different hashes for different IPs', () => {
    const a = getClientIpHash(makeRequest({ 'x-forwarded-for': '203.0.113.5' }));
    const b = getClientIpHash(makeRequest({ 'x-forwarded-for': '203.0.113.6' }));
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different salts', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.5' });
    process.env.RATE_LIMIT_IP_SALT = 'salt-a';
    const hashA = getClientIpHash(req);
    process.env.RATE_LIMIT_IP_SALT = 'salt-b';
    const hashB = getClientIpHash(req);
    expect(hashA).not.toBe(hashB);
  });

  it('is deterministic for a given IP+salt pair', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.5' });
    expect(getClientIpHash(req)).toBe(getClientIpHash(req));
  });

  it('trims whitespace from x-forwarded-for entries', () => {
    const reqPadded = makeRequest({
      'x-forwarded-for': '  203.0.113.5  , 198.51.100.7',
    });
    const reqClean = makeRequest({ 'x-forwarded-for': '203.0.113.5' });
    expect(getClientIpHash(reqPadded)).toBe(getClientIpHash(reqClean));
  });
});

describe('checkAndRecordRateLimit', () => {
  beforeEach(() => {
    mockSelectChain.mockReset();
    mockInsert.mockReset();
  });

  it('allows the request when under the limit and records an attempt', async () => {
    mockSelectChain.mockResolvedValue([]);
    mockInsert.mockResolvedValue(undefined);
    const result = await checkAndRecordRateLimit('user:abc', 'auth');
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
    expect(result.retryAfterSeconds).toBeNull();
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('returns the auth default limit (50) when env var is unset', async () => {
    delete process.env.GENERATE_RATE_LIMIT_AUTH_PER_HOUR;
    mockSelectChain.mockResolvedValue([]);
    mockInsert.mockResolvedValue(undefined);
    const result = await checkAndRecordRateLimit('user:abc', 'auth');
    expect(result.limit).toBe(50);
  });

  it('returns the anon default limit (5) when env var is unset', async () => {
    delete process.env.GENERATE_RATE_LIMIT_ANON_PER_HOUR;
    mockSelectChain.mockResolvedValue([]);
    mockInsert.mockResolvedValue(undefined);
    const result = await checkAndRecordRateLimit('ip:somehash', 'anon');
    expect(result.limit).toBe(5);
  });

  it('blocks at the limit and computes retryAfterSeconds from the oldest row', async () => {
    const oldest = new Date(Date.now() - 30 * 60 * 1000);
    mockSelectChain.mockResolvedValue([
      { createdAt: oldest },
      { createdAt: new Date() },
      { createdAt: new Date() },
      { createdAt: new Date() },
      { createdAt: new Date() },
    ]);
    const result = await checkAndRecordRateLimit('ip:somehash', 'anon');
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(5);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThan(31 * 60);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('fails open when the rate_limits table read throws', async () => {
    mockSelectChain.mockRejectedValue(
      new Error('relation "rate_limits" does not exist'),
    );
    const result = await checkAndRecordRateLimit('user:abc', 'auth');
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.retryAfterSeconds).toBeNull();
  });

  it('fails open when the insert throws', async () => {
    mockSelectChain.mockResolvedValue([]);
    mockInsert.mockRejectedValue(new Error('connection refused'));
    const result = await checkAndRecordRateLimit('user:abc', 'auth');
    expect(result.allowed).toBe(true);
  });
});
