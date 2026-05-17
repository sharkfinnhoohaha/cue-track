import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SongSpec } from '@/types';

/**
 * Tests for the POST /api/tracks/generate route. Mocks the auth() session,
 * the dynamic @/lib/db import, and the rate-limit module so we can exercise
 * the validation, duration-cap, rate-limit, and persistence branches in
 * isolation.
 *
 * The route's buildTimeGrid / DEFAULT_SAMPLE_RATE imports are NOT mocked,
 * since they are pure functions over the spec and exercising them gives
 * realistic duration values for the cap test.
 */

const {
  mockAuth,
  mockInsert,
  mockValues,
  mockReturning,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdateReturning,
  mockCheckAndRecord,
  mockSubscriptionLookup,
  mockOwnerLookup,
} = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  const mockUpdateReturning = vi.fn();
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    mockAuth: vi.fn(),
    mockInsert,
    mockValues,
    mockReturning,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockUpdateReturning,
    mockCheckAndRecord: vi.fn(),
    // Resolves db.select({subscriptionStatus}).from(users).where().limit(1).
    // Returning [] = no row, returning [{ subscriptionStatus }] = found.
    mockSubscriptionLookup: vi.fn(),
    // Resolves db.select({userId}).from(tracks).where().limit(1) when
    // /generate is called with existingTrackId and an auth session.
    mockOwnerLookup: vi.fn(),
  };
});

vi.mock('@/auth', () => ({ auth: mockAuth }));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    select: vi.fn((cols: Record<string, unknown>) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(async () => {
            // Dispatch on the requested columns to the right mock. The
            // subscription gate selects users.subscriptionStatus; the
            // ownership check on the UPDATE path selects tracks.userId.
            if (cols && 'subscriptionStatus' in cols) {
              return mockSubscriptionLookup();
            }
            if (cols && 'userId' in cols) {
              return mockOwnerLookup();
            }
            return [];
          }),
        }),
      }),
    })),
  },
  tracks: {
    id: 'mock_id_column',
    previewUrl: 'mock_preview_column',
    status: 'mock_status_column',
    duration: 'mock_duration_column',
    userId: 'mock_user_id_column',
  },
  users: {
    id: 'mock_user_id',
    subscriptionStatus: 'mock_subscription_status',
  },
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

import { POST } from './route';

// Default to a Standard voice so existing happy-path tests don't trip the
// Pro-tier gate at submit. Voice-tier behavior is covered separately below.
const VALID_SPEC: SongSpec = {
  title: 'Test',
  bpm: 120,
  timeSignature: { beats: 4, subdivision: 4 },
  sections: [
    { id: '1', name: 'Intro', bars: 4 },
    { id: '2', name: 'Verse', bars: 4 },
  ],
  voiceId: 'en-US-Standard-D',
  clickSound: 'classic',
  format: 'wav',
  enableCountIn: true,
  enableSectionAnnounce: true,
  enableBarCountdown: false,
  countInBars: 1,
};

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('https://example.test/api/tracks/generate', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.5',
      ...headers,
    },
  });
}

describe('POST /api/tracks/generate', () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalMaxDuration = process.env.MAX_TRACK_DURATION_SECONDS;
  const originalSalt = process.env.RATE_LIMIT_IP_SALT;

  beforeEach(() => {
    mockAuth.mockReset();
    mockReturning.mockReset();
    mockValues.mockClear();
    mockInsert.mockClear();
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
    mockUpdateWhere.mockClear();
    mockUpdateReturning.mockReset();
    mockCheckAndRecord.mockReset();
    mockSubscriptionLookup.mockReset();
    mockOwnerLookup.mockReset();
    mockSubscriptionLookup.mockResolvedValue([]);
    mockOwnerLookup.mockResolvedValue([]);

    process.env.DATABASE_URL = 'postgres://mock';
    process.env.RATE_LIMIT_IP_SALT = 'test-salt';
    delete process.env.MAX_TRACK_DURATION_SECONDS;

    // Defaults: anon session, rate limit allows, insert returns the row
    mockAuth.mockResolvedValue(null);
    mockCheckAndRecord.mockResolvedValue({
      allowed: true,
      limit: 5,
      current: 1,
      retryAfterSeconds: null,
    });
    mockReturning.mockResolvedValue([
      {
        id: 'fake-uuid',
        previewUrl: '/api/tracks/fake-uuid/download?preview=true',
        status: 'ready',
        duration: 10,
      },
    ]);
  });

  afterEach(() => {
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
    if (originalMaxDuration === undefined) {
      delete process.env.MAX_TRACK_DURATION_SECONDS;
    } else {
      process.env.MAX_TRACK_DURATION_SECONDS = originalMaxDuration;
    }
    if (originalSalt === undefined) delete process.env.RATE_LIMIT_IP_SALT;
    else process.env.RATE_LIMIT_IP_SALT = originalSalt;
  });

  describe('validation', () => {
    it('rejects non-JSON body with 400', async () => {
      const req = makeRequest('not-json{');
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid JSON in request body');
    });

    it('rejects non-object body with 400', async () => {
      const res = await POST(makeRequest('"just-a-string"'));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation failed');
      expect(body.details).toEqual(['Request body must be a JSON object']);
    });

    it('rejects spec missing required title', async () => {
      const { title: _omit, ...rest } = VALID_SPEC;
      const res = await POST(makeRequest(rest));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.details).toEqual(
        expect.arrayContaining([expect.stringContaining('title')]),
      );
    });

    it('rejects bpm below 30 or above 300', async () => {
      const tooLow = await POST(makeRequest({ ...VALID_SPEC, bpm: 10 }));
      expect(tooLow.status).toBe(400);
      expect((await tooLow.json()).details).toEqual(
        expect.arrayContaining([expect.stringContaining('bpm')]),
      );

      const tooHigh = await POST(makeRequest({ ...VALID_SPEC, bpm: 999 }));
      expect(tooHigh.status).toBe(400);
    });

    it('rejects invalid timeSignature subdivision', async () => {
      const res = await POST(
        makeRequest({
          ...VALID_SPEC,
          timeSignature: { beats: 4, subdivision: 7 },
        }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).details).toEqual(
        expect.arrayContaining([expect.stringContaining('subdivision')]),
      );
    });

    it('rejects empty sections array', async () => {
      const res = await POST(makeRequest({ ...VALID_SPEC, sections: [] }));
      expect(res.status).toBe(400);
      expect((await res.json()).details).toEqual(
        expect.arrayContaining([expect.stringContaining('sections')]),
      );
    });

    it('rejects invalid clickSound enum value', async () => {
      const res = await POST(
        makeRequest({ ...VALID_SPEC, clickSound: 'notreal' }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).details).toEqual(
        expect.arrayContaining([expect.stringContaining('clickSound')]),
      );
    });

    it('rejects invalid format enum value', async () => {
      const res = await POST(makeRequest({ ...VALID_SPEC, format: 'flac' }));
      expect(res.status).toBe(400);
      expect((await res.json()).details).toEqual(
        expect.arrayContaining([expect.stringContaining('format')]),
      );
    });

    it('rejects non-boolean enableCountIn', async () => {
      const res = await POST(
        makeRequest({ ...VALID_SPEC, enableCountIn: 'yes' }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).details).toEqual(
        expect.arrayContaining([expect.stringContaining('enableCountIn')]),
      );
    });

    it('rejects countInBars outside the allowed set', async () => {
      const res = await POST(makeRequest({ ...VALID_SPEC, countInBars: 5 }));
      expect(res.status).toBe(400);
      expect((await res.json()).details).toEqual(
        expect.arrayContaining([expect.stringContaining('countInBars')]),
      );
    });
  });

  describe('environment guards', () => {
    it('returns 500 when DATABASE_URL is unset', async () => {
      delete process.env.DATABASE_URL;
      const res = await POST(makeRequest(VALID_SPEC));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Server not configured');
    });

    it('returns 400 when anon caller has no forwarded IP', async () => {
      const req = new NextRequest(
        'https://example.test/api/tracks/generate',
        {
          method: 'POST',
          body: JSON.stringify(VALID_SPEC),
          headers: { 'content-type': 'application/json' },
        },
      );
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Cannot determine client identifier');
    });
  });

  describe('rate limiting', () => {
    it('uses user:<id> identifier for authenticated callers', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      await POST(makeRequest(VALID_SPEC));
      expect(mockCheckAndRecord).toHaveBeenCalledWith('user:user-abc', 'auth');
    });

    it('uses ip:<hash> identifier for anonymous callers', async () => {
      await POST(makeRequest(VALID_SPEC));
      expect(mockCheckAndRecord).toHaveBeenCalledTimes(1);
      const [identifier, kind] = mockCheckAndRecord.mock.calls[0]!;
      expect(identifier).toMatch(/^ip:[0-9a-f]{64}$/);
      expect(kind).toBe('anon');
    });

    it('returns 429 with authBoost true for anon over-limit', async () => {
      mockCheckAndRecord.mockResolvedValue({
        allowed: false,
        limit: 5,
        current: 5,
        retryAfterSeconds: 1800,
      });
      const res = await POST(makeRequest(VALID_SPEC));
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.code).toBe('RATE_LIMITED');
      expect(body.authBoost).toBe(true);
      expect(res.headers.get('Retry-After')).toBe('1800');
    });

    it('returns 429 with authBoost false for auth user over-limit', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      mockCheckAndRecord.mockResolvedValue({
        allowed: false,
        limit: 50,
        current: 50,
        retryAfterSeconds: 600,
      });
      const res = await POST(makeRequest(VALID_SPEC));
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.authBoost).toBe(false);
    });
  });

  describe('voice tier gate', () => {
    it('returns 402 when an anon caller requests a Studio voice', async () => {
      const res = await POST(
        makeRequest({ ...VALID_SPEC, voiceId: 'en-US-Studio-M' }),
      );
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('VOICE_TIER_REQUIRED');
      expect(body.requiredTier).toBe('studio');
      expect(body.voiceId).toBe('en-US-Studio-M');
    });

    it('returns 402 when an auth user without Pro requests a Studio voice', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      mockSubscriptionLookup.mockResolvedValue([
        { subscriptionStatus: 'none' },
      ]);
      const res = await POST(
        makeRequest({ ...VALID_SPEC, voiceId: 'en-US-Neural2-D' }),
      );
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('VOICE_TIER_REQUIRED');
    });

    it('allows a Pro subscriber to use a Studio voice', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      mockSubscriptionLookup.mockResolvedValue([
        { subscriptionStatus: 'active' },
      ]);
      const res = await POST(
        makeRequest({ ...VALID_SPEC, voiceId: 'en-US-Studio-M' }),
      );
      expect(res.status).toBe(200);
    });

    it('allows anon to use a Standard voice', async () => {
      const res = await POST(
        makeRequest({ ...VALID_SPEC, voiceId: 'en-US-Standard-D' }),
      );
      expect(res.status).toBe(200);
    });

    it('fails closed when the subscription lookup throws', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      mockSubscriptionLookup.mockRejectedValue(new Error('db down'));
      const res = await POST(
        makeRequest({ ...VALID_SPEC, voiceId: 'en-US-Studio-M' }),
      );
      expect(res.status).toBe(402);
    });
  });

  describe('duration cap', () => {
    it('returns 400 when computed duration exceeds the configured cap', async () => {
      // VALID_SPEC computes to ~10 seconds; set the cap to 5s to trigger.
      process.env.MAX_TRACK_DURATION_SECONDS = '5';
      const res = await POST(makeRequest(VALID_SPEC));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Track duration exceeds the configured maximum');
      expect(body.maxSeconds).toBe(5);
      expect(typeof body.requestedSeconds).toBe('number');
    });

    it('does not enforce the cap when MAX_TRACK_DURATION_SECONDS is unset', async () => {
      const res = await POST(makeRequest(VALID_SPEC));
      expect(res.status).toBe(200);
    });
  });

  describe('happy path', () => {
    it('persists the spec and returns the saved track metadata', async () => {
      const res = await POST(makeRequest(VALID_SPEC));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('fake-uuid');
      expect(body.status).toBe('ready');
      expect(typeof body.duration).toBe('number');
      expect(mockInsert).toHaveBeenCalledTimes(1);
      const insertedRow = (mockValues.mock.calls[0] as unknown as [Record<string, unknown>])[0];
      expect(insertedRow.title).toBe(VALID_SPEC.title);
      expect(insertedRow.status).toBe('ready');
      expect(insertedRow.spec).toEqual(VALID_SPEC);
    });

    it('attributes the row to the userId when authenticated', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      await POST(makeRequest(VALID_SPEC));
      const insertedRow = (mockValues.mock.calls[0] as unknown as [Record<string, unknown>])[0];
      expect(insertedRow.userId).toBe('user-abc');
    });

    it('leaves userId undefined for anon callers', async () => {
      await POST(makeRequest(VALID_SPEC));
      const insertedRow = (mockValues.mock.calls[0] as unknown as [Record<string, unknown>])[0];
      expect(insertedRow.userId).toBeUndefined();
    });
  });

  describe('persistence failure', () => {
    it('returns 500 when the insert returns no rows', async () => {
      mockReturning.mockResolvedValue([]);
      const res = await POST(makeRequest(VALID_SPEC));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Track persistence failed');
    });

    it('returns 500 when the insert throws', async () => {
      mockReturning.mockRejectedValue(new Error('db down'));
      const res = await POST(makeRequest(VALID_SPEC));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Track persistence failed');
      expect(body.details).toBe('db down');
    });
  });

  describe('existingTrackId UPDATE path', () => {
    const EXISTING_ID = '11111111-2222-3333-4444-555555555555';

    beforeEach(() => {
      mockUpdateReturning.mockResolvedValue([
        {
          id: EXISTING_ID,
          previewUrl: `/api/tracks/${EXISTING_ID}/download?preview=true`,
          status: 'ready',
          duration: 10,
        },
      ]);
    });

    it('rejects a non-UUID existingTrackId with 400', async () => {
      const res = await POST(
        makeRequest({ ...VALID_SPEC, existingTrackId: 'not-a-uuid' }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.details).toEqual(
        expect.arrayContaining(['existingTrackId must be a UUID']),
      );
    });

    it('UPDATEs the existing row and skips INSERT when id matches', async () => {
      const res = await POST(
        makeRequest({ ...VALID_SPEC, existingTrackId: EXISTING_ID }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(EXISTING_ID);
      expect(body.status).toBe('ready');

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockInsert).not.toHaveBeenCalled();
      const setArg = (mockUpdateSet.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ])[0];
      expect(setArg.status).toBe('ready');
      expect(setArg.spec).toEqual(VALID_SPEC);
      expect(setArg.title).toBe(VALID_SPEC.title);
    });

    it('does NOT include existingTrackId in the persisted spec', async () => {
      await POST(
        makeRequest({ ...VALID_SPEC, existingTrackId: EXISTING_ID }),
      );
      const setArg = (mockUpdateSet.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ])[0];
      const persistedSpec = setArg.spec as Record<string, unknown>;
      expect(persistedSpec.existingTrackId).toBeUndefined();
    });

    it('returns 404 when the UPDATE finds no row', async () => {
      mockUpdateReturning.mockResolvedValue([]);
      const res = await POST(
        makeRequest({ ...VALID_SPEC, existingTrackId: EXISTING_ID }),
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Track not found');
    });

    it('returns 404 when ownership lookup finds no row for auth user', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      mockOwnerLookup.mockResolvedValue([]);
      const res = await POST(
        makeRequest({ ...VALID_SPEC, existingTrackId: EXISTING_ID }),
      );
      expect(res.status).toBe(404);
    });

    it('returns 403 when the draft belongs to a different user', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      mockOwnerLookup.mockResolvedValue([{ userId: 'user-different' }]);
      const res = await POST(
        makeRequest({ ...VALID_SPEC, existingTrackId: EXISTING_ID }),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Forbidden');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('allows the owning user to finalize their own draft', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      mockOwnerLookup.mockResolvedValue([{ userId: 'user-abc' }]);
      const res = await POST(
        makeRequest({ ...VALID_SPEC, existingTrackId: EXISTING_ID }),
      );
      expect(res.status).toBe(200);
    });

    it('allows an auth user to claim an anon draft (userId null)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      mockOwnerLookup.mockResolvedValue([{ userId: null }]);
      const res = await POST(
        makeRequest({ ...VALID_SPEC, existingTrackId: EXISTING_ID }),
      );
      expect(res.status).toBe(200);
      const setArg = (mockUpdateSet.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ])[0];
      expect(setArg.userId).toBe('user-abc');
    });

    it('still uses INSERT (not UPDATE) when no existingTrackId is supplied', async () => {
      const res = await POST(makeRequest(VALID_SPEC));
      expect(res.status).toBe(200);
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
