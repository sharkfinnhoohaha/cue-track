import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for POST /api/tracks/analyze. Mocks the worker fetch, auth, rate
 * limit, and DB insert so we can exercise validation, identification,
 * worker-error mapping, and persistence in isolation.
 */

const {
  mockAuth,
  mockInsert,
  mockValues,
  mockReturning,
  mockCheckAndRecord,
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
  };
});

vi.mock('@/auth', () => ({ auth: mockAuth }));

vi.mock('@/lib/db', () => ({
  db: { insert: mockInsert },
  tracks: { id: 'mock_id_column' },
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

const WORKER_OK_BODY = {
  bpm: 120,
  duration: 180,
  sampleRate: 44100,
  suggestedSections: [
    { id: 's1', name: 'Intro', bars: 4 },
    { id: 's2', name: 'Verse', bars: 16 },
    { id: 's3', name: 'Chorus', bars: 16 },
    { id: 's4', name: 'Outro', bars: 4 },
  ],
};

function makeAudioFile(
  name = 'song.wav',
  type = 'audio/wav',
  bytes = 4096,
): File {
  const buf = new Uint8Array(bytes).fill(1);
  return new File([buf], name, { type });
}

function makeFormRequest(
  formData: FormData,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('https://example.test/api/tracks/analyze', {
    method: 'POST',
    body: formData,
    headers: {
      'x-forwarded-for': '203.0.113.5',
      ...headers,
    },
  });
}

describe('POST /api/tracks/analyze', () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalSalt = process.env.RATE_LIMIT_IP_SALT;
  const originalWorkerUrl = process.env.AUDIO_WORKER_URL;
  const originalWorkerSecret = process.env.AUDIO_WORKER_SHARED_SECRET;
  const originalPaywall = process.env.ENABLE_ANALYZE_PAYWALL;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockAuth.mockReset();
    mockReturning.mockReset();
    mockValues.mockClear();
    mockInsert.mockClear();
    mockCheckAndRecord.mockReset();

    process.env.DATABASE_URL = 'postgres://mock';
    process.env.RATE_LIMIT_IP_SALT = 'test-salt';
    process.env.AUDIO_WORKER_URL = 'https://worker.example';
    process.env.AUDIO_WORKER_SHARED_SECRET = 'test-secret';
    delete process.env.ENABLE_ANALYZE_PAYWALL;

    mockAuth.mockResolvedValue(null);
    mockCheckAndRecord.mockResolvedValue({
      allowed: true,
      limit: 5,
      current: 1,
      retryAfterSeconds: null,
    });
    mockReturning.mockResolvedValue([{ id: 'fake-uuid' }]);

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(WORKER_OK_BODY), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
    if (originalSalt === undefined) delete process.env.RATE_LIMIT_IP_SALT;
    else process.env.RATE_LIMIT_IP_SALT = originalSalt;
    if (originalWorkerUrl === undefined) delete process.env.AUDIO_WORKER_URL;
    else process.env.AUDIO_WORKER_URL = originalWorkerUrl;
    if (originalWorkerSecret === undefined) delete process.env.AUDIO_WORKER_SHARED_SECRET;
    else process.env.AUDIO_WORKER_SHARED_SECRET = originalWorkerSecret;
    if (originalPaywall === undefined) delete process.env.ENABLE_ANALYZE_PAYWALL;
    else process.env.ENABLE_ANALYZE_PAYWALL = originalPaywall;
  });

  describe('validation', () => {
    it('returns 400 when the file field is missing', async () => {
      const fd = new FormData();
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Missing file');
    });

    it('returns 400 when the file is empty', async () => {
      const fd = new FormData();
      fd.append('file', makeAudioFile('song.wav', 'audio/wav', 0));
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Empty file');
    });

    it('returns 400 with FILE_TOO_LARGE when file exceeds 50MB', async () => {
      const fd = new FormData();
      fd.append(
        'file',
        makeAudioFile('big.wav', 'audio/wav', 51 * 1024 * 1024),
      );
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('FILE_TOO_LARGE');
    });

    it('returns 400 with INVALID_MIME when type and extension are both wrong', async () => {
      const fd = new FormData();
      fd.append('file', makeAudioFile('song.flac', 'audio/flac'));
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('INVALID_MIME');
    });

    it('accepts a file by extension when the browser sends application/octet-stream', async () => {
      const fd = new FormData();
      fd.append('file', makeAudioFile('song.mp3', 'application/octet-stream'));
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0]!;
      expect((init as RequestInit).headers).toMatchObject({
        'content-type': 'audio/mpeg',
      });
    });
  });

  describe('environment guards', () => {
    it('returns 503 when AUDIO_WORKER_URL is unset', async () => {
      delete process.env.AUDIO_WORKER_URL;
      const fd = new FormData();
      fd.append('file', makeAudioFile());
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe('Audio analysis is not configured');
    });

    it('returns 400 when anon caller has no forwarded IP', async () => {
      const fd = new FormData();
      fd.append('file', makeAudioFile());
      const req = new NextRequest('https://example.test/api/tracks/analyze', {
        method: 'POST',
        body: fd,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Cannot determine client identifier');
    });
  });

  describe('rate limiting', () => {
    it('uses user:<id> identifier for authenticated callers', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      const fd = new FormData();
      fd.append('file', makeAudioFile());
      await POST(makeFormRequest(fd));
      expect(mockCheckAndRecord).toHaveBeenCalledWith('user:user-abc', 'auth');
    });

    it('returns 429 with authBoost true for anon over-limit', async () => {
      mockCheckAndRecord.mockResolvedValue({
        allowed: false,
        limit: 5,
        current: 5,
        retryAfterSeconds: 1800,
      });
      const fd = new FormData();
      fd.append('file', makeAudioFile());
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.code).toBe('RATE_LIMITED');
      expect(body.authBoost).toBe(true);
    });
  });

  describe('worker error mapping', () => {
    it('returns 422 DECODE_FAILED when worker rejects the audio', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'decode_failed', detail: 'bad mpeg sync' }),
          { status: 422, headers: { 'content-type': 'application/json' } },
        ),
      );
      const fd = new FormData();
      fd.append('file', makeAudioFile('weird.mp3', 'audio/mpeg'));
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('DECODE_FAILED');
      expect(body.details).toBe('bad mpeg sync');
    });

    it('returns 502 when the worker returns a 5xx', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('boom', { status: 500 }),
      );
      const fd = new FormData();
      fd.append('file', makeAudioFile());
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(502);
    });

    it('returns 502 when fetch throws', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('network down'));
      const fd = new FormData();
      fd.append('file', makeAudioFile());
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(502);
    });
  });

  describe('happy path', () => {
    it('persists a draft track with status=rendering and returns id + worker results', async () => {
      const fd = new FormData();
      fd.append('file', makeAudioFile('My Song.wav', 'audio/wav'));
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe('fake-uuid');
      expect(body.bpm).toBe(120);
      expect(body.duration).toBe(180);
      expect(body.suggestedSections).toHaveLength(4);

      expect(mockInsert).toHaveBeenCalledTimes(1);
      const insertedRow = (mockValues.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ])[0];
      expect(insertedRow.title).toBe('My Song');
      expect(insertedRow.status).toBe('rendering');
      expect(insertedRow.previewUrl).toBeNull();
      expect(insertedRow.fullUrl).toBeNull();
      expect(insertedRow.duration).toBe(180);
      const spec = insertedRow.spec as Record<string, unknown>;
      expect(spec.bpm).toBe(120);
      expect(spec.sections).toHaveLength(4);
      expect(spec.voiceId).toBe('en-US-Standard-D');
    });

    it('attributes the row to the userId when authenticated', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-abc' } });
      const fd = new FormData();
      fd.append('file', makeAudioFile());
      await POST(makeFormRequest(fd));
      const insertedRow = (mockValues.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ])[0];
      expect(insertedRow.userId).toBe('user-abc');
    });

    it('forwards the audio bytes to the worker with the secret header', async () => {
      const fd = new FormData();
      fd.append('file', makeAudioFile('clip.mp3', 'audio/mpeg'));
      await POST(makeFormRequest(fd));
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('https://worker.example/analyze');
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['x-worker-secret']).toBe('test-secret');
      expect(headers['content-type']).toBe('audio/mpeg');
    });
  });

  describe('persistence failure', () => {
    it('returns 500 when insert throws', async () => {
      mockReturning.mockRejectedValue(new Error('db down'));
      const fd = new FormData();
      fd.append('file', makeAudioFile());
      const res = await POST(makeFormRequest(fd));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Track persistence failed');
    });
  });
});
