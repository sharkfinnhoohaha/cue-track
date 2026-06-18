import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SongSpec } from '@/types';

/**
 * Tests for GET /api/tracks/[id]/download. Mocks the dynamic @/lib/db
 * import, the audio engine (renderTrack, renderPreviewOnly), and global
 * fetch so the worker-offload branches are reachable without a live
 * Cloud Run instance.
 *
 * The route runs five DB selects in the same request (track row,
 * purchase, track-owner lookup, user subscription), plus one update on
 * the failure path. We feed those via a programmable queue rather than a
 * scripted chain, so tests stay focused on the route's branching logic
 * instead of Drizzle's fluent surface.
 */

const { dbState, mockSelect, mockUpdate, mockRenderTrack, mockRenderPreview } =
  vi.hoisted(() => {
    const dbState = {
      selectResults: [] as unknown[][],
      updateCalls: [] as Array<{ status?: string }>,
    };
    const mockSelect = vi.fn(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(async () => {
            const rows = dbState.selectResults.shift();
            return rows ?? [];
          }),
        }),
      }),
    }));
    const mockUpdate = vi.fn(() => ({
      set: vi.fn((value: { status?: string }) => {
        dbState.updateCalls.push(value);
        return {
          where: vi.fn().mockResolvedValue([]),
        };
      }),
    }));
    return {
      dbState,
      mockSelect,
      mockUpdate,
      mockRenderTrack: vi.fn(),
      mockRenderPreview: vi.fn(),
    };
  });

vi.mock('@/lib/db', () => ({
  db: { select: mockSelect, update: mockUpdate },
  tracks: { id: 'mock_id', spec: 'mock_spec', status: 'mock_status', title: 'mock_title', duration: 'mock_duration', userId: 'mock_userId' },
  purchases: { id: 'mock_id', trackId: 'mock_trackId', status: 'mock_status' },
  users: { id: 'mock_id', subscriptionStatus: 'mock_subscription' },
}));

vi.mock('@/lib/audio/engine', () => ({
  renderTrack: mockRenderTrack,
  renderPreviewOnly: mockRenderPreview,
}));

// The route now resolves the requesting user via auth() to scope Pro-owner
// access to the owner. Mock it as anonymous; the access tests here exercise
// the paid-purchase and no-access paths, neither of which needs a session.
vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));

import { GET } from './route';

const VALID_UUID = '12345678-1234-1234-1234-123456789012';
const SAMPLE_SPEC: SongSpec = {
  title: 'Sample',
  bpm: 120,
  timeSignature: { beats: 4, subdivision: 4 },
  sections: [{ id: '1', name: 'Intro', bars: 4 }],
  voiceId: 'en-US-Studio-M',
  clickSound: 'classic',
  format: 'wav',
  enableCountIn: true,
  enableSectionAnnounce: false,
  enableBarCountdown: false,
  countInBars: 1,
};

function makeRequest(id: string, preview = false): NextRequest {
  const url = preview
    ? `https://example.test/api/tracks/${id}/download?preview=true`
    : `https://example.test/api/tracks/${id}/download`;
  return new NextRequest(url, { method: 'GET' });
}

function queueSelectResults(...resultsInOrder: unknown[][]): void {
  dbState.selectResults.push(...resultsInOrder);
}

describe('GET /api/tracks/[id]/download', () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalWorkerUrl = process.env.AUDIO_WORKER_URL;
  const originalWorkerSecret = process.env.AUDIO_WORKER_SHARED_SECRET;
  const originalThreshold = process.env.AUDIO_WORKER_THRESHOLD_SECONDS;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockSelect.mockClear();
    mockUpdate.mockClear();
    mockRenderTrack.mockReset();
    mockRenderPreview.mockReset();
    dbState.selectResults = [];
    dbState.updateCalls = [];

    process.env.DATABASE_URL = 'postgres://mock';
    delete process.env.AUDIO_WORKER_URL;
    delete process.env.AUDIO_WORKER_SHARED_SECRET;
    delete process.env.AUDIO_WORKER_THRESHOLD_SECONDS;
  });

  afterEach(() => {
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
    if (originalWorkerUrl === undefined) delete process.env.AUDIO_WORKER_URL;
    else process.env.AUDIO_WORKER_URL = originalWorkerUrl;
    if (originalWorkerSecret === undefined) {
      delete process.env.AUDIO_WORKER_SHARED_SECRET;
    } else {
      process.env.AUDIO_WORKER_SHARED_SECRET = originalWorkerSecret;
    }
    if (originalThreshold === undefined) {
      delete process.env.AUDIO_WORKER_THRESHOLD_SECONDS;
    } else {
      process.env.AUDIO_WORKER_THRESHOLD_SECONDS = originalThreshold;
    }
    globalThis.fetch = originalFetch;
  });

  describe('input validation', () => {
    it('returns 400 for non-UUID id', async () => {
      const res = await GET(makeRequest('not-a-uuid'), {
        params: { id: 'not-a-uuid' },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid track ID format');
    });

    it('returns 500 when DATABASE_URL is unset', async () => {
      delete process.env.DATABASE_URL;
      const res = await GET(makeRequest(VALID_UUID, true), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Server not configured');
    });
  });

  describe('track-row lookups', () => {
    it('returns 404 when the track does not exist (preview path)', async () => {
      // Preview skips the payment gate, so the only select is the track row.
      queueSelectResults([]);
      const res = await GET(makeRequest(VALID_UUID, true), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Track not found');
    });

    it('returns 410 when the track is in failed status', async () => {
      queueSelectResults([
        { spec: SAMPLE_SPEC, status: 'failed', title: 'Sample', duration: 30 },
      ]);
      const res = await GET(makeRequest(VALID_UUID, true), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(410);
      const body = await res.json();
      expect(body.error).toBe('Track is in failed state');
    });
  });

  describe('payment gate (full download)', () => {
    it('returns 402 when no paid purchase and no Pro owner', async () => {
      // checkPaymentAccess: paid purchase lookup empty, track row lookup
      // returns row with no userId so the user-sub branch is skipped.
      queueSelectResults([], [{ userId: null }]);
      const res = await GET(makeRequest(VALID_UUID, false), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('PAYMENT_REQUIRED');
      expect(body.details.trackId).toBe(VALID_UUID);
    });

    it('allows access when a paid purchase exists', async () => {
      mockRenderTrack.mockResolvedValue({
        fullTrack: Buffer.from([0x52, 0x49, 0x46, 0x46]),
        preview: Buffer.from([0x52]),
        duration: 30,
        format: 'wav',
      });
      // payment gate: paid purchase exists; then track-row select; no update.
      queueSelectResults(
        [{ id: 'purchase-1' }],
        [
          {
            spec: SAMPLE_SPEC,
            status: 'ready',
            title: 'Sample',
            duration: 30,
          },
        ],
      );
      const res = await GET(makeRequest(VALID_UUID, false), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(
        'private, max-age=0, must-revalidate',
      );
      expect(res.headers.get('Content-Type')).toBe('audio/wav');
    });
  });

  describe('preview rendering', () => {
    it('renders in-process and sets public cache headers', async () => {
      mockRenderPreview.mockResolvedValue(
        Buffer.from([0x52, 0x49, 0x46, 0x46]),
      );
      queueSelectResults([
        { spec: SAMPLE_SPEC, status: 'ready', title: 'Sample', duration: 30 },
      ]);
      const res = await GET(makeRequest(VALID_UUID, true), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
      expect(res.headers.get('Content-Disposition')).toContain('inline');
      expect(mockRenderPreview).toHaveBeenCalledTimes(1);
      expect(mockRenderTrack).not.toHaveBeenCalled();
    });
  });

  describe('worker offload decision', () => {
    it('does not offload when AUDIO_WORKER_URL is unset, even for long tracks', async () => {
      mockRenderTrack.mockResolvedValue({
        fullTrack: Buffer.from([0x52]),
        preview: Buffer.from([0x52]),
        duration: 600,
        format: 'wav',
      });
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;
      queueSelectResults(
        [{ id: 'purchase-1' }],
        [{ spec: SAMPLE_SPEC, status: 'ready', title: 'Sample', duration: 600 }],
      );
      const res = await GET(makeRequest(VALID_UUID, false), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockRenderTrack).toHaveBeenCalledTimes(1);
    });

    it('does not offload short tracks even when AUDIO_WORKER_URL is set', async () => {
      process.env.AUDIO_WORKER_URL = 'https://worker.example';
      process.env.AUDIO_WORKER_SHARED_SECRET = 'secret';
      mockRenderTrack.mockResolvedValue({
        fullTrack: Buffer.from([0x52]),
        preview: Buffer.from([0x52]),
        duration: 30,
        format: 'wav',
      });
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;
      queueSelectResults(
        [{ id: 'purchase-1' }],
        [{ spec: SAMPLE_SPEC, status: 'ready', title: 'Sample', duration: 30 }],
      );
      const res = await GET(makeRequest(VALID_UUID, false), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockRenderTrack).toHaveBeenCalledTimes(1);
    });

    it('offloads long tracks to the worker when URL+secret are set', async () => {
      process.env.AUDIO_WORKER_URL = 'https://worker.example';
      process.env.AUDIO_WORKER_SHARED_SECRET = 'secret';
      const fullB64 = Buffer.from([0x52, 0x49, 0x46, 0x46]).toString('base64');
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            trackId: VALID_UUID,
            duration: 300,
            format: 'wav',
            fullTrackBase64: fullB64,
            previewBase64: '',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      globalThis.fetch = fetchSpy;
      queueSelectResults(
        [{ id: 'purchase-1' }],
        [
          {
            spec: SAMPLE_SPEC,
            status: 'ready',
            title: 'Sample',
            duration: 300,
          },
        ],
      );
      const res = await GET(makeRequest(VALID_UUID, false), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl, calledOpts] = fetchSpy.mock.calls[0]!;
      expect(calledUrl).toBe('https://worker.example/render');
      expect(calledOpts.method).toBe('POST');
      expect(calledOpts.headers['X-Worker-Secret']).toBe('secret');
      expect(mockRenderTrack).not.toHaveBeenCalled();
    });
  });

  describe('worker failure paths', () => {
    beforeEach(() => {
      process.env.AUDIO_WORKER_URL = 'https://worker.example';
      process.env.AUDIO_WORKER_SHARED_SECRET = 'secret';
    });

    it('returns 503 and does NOT mark failed on worker 5xx', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response('boom', { status: 502 }),
      );
      globalThis.fetch = fetchSpy;
      queueSelectResults(
        [{ id: 'purchase-1' }],
        [
          {
            spec: SAMPLE_SPEC,
            status: 'ready',
            title: 'Sample',
            duration: 300,
          },
        ],
      );
      const res = await GET(makeRequest(VALID_UUID, false), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe('Audio worker temporarily unavailable');
      expect(dbState.updateCalls).toEqual([]);
    });

    it('returns 503 and does NOT mark failed on worker 401 (bad secret)', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response('unauthorized', { status: 401 }),
      );
      globalThis.fetch = fetchSpy;
      queueSelectResults(
        [{ id: 'purchase-1' }],
        [
          {
            spec: SAMPLE_SPEC,
            status: 'ready',
            title: 'Sample',
            duration: 300,
          },
        ],
      );
      const res = await GET(makeRequest(VALID_UUID, false), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(503);
      expect(dbState.updateCalls).toEqual([]);
    });

    it('returns 500 and MARKS failed when worker rejects the spec (4xx other than auth)', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response('bad spec', { status: 400 }),
      );
      globalThis.fetch = fetchSpy;
      queueSelectResults(
        [{ id: 'purchase-1' }],
        [
          {
            spec: SAMPLE_SPEC,
            status: 'ready',
            title: 'Sample',
            duration: 300,
          },
        ],
      );
      const res = await GET(makeRequest(VALID_UUID, false), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Track rendering failed');
      expect(dbState.updateCalls).toEqual([{ status: 'failed' }]);
    });

    it('returns 503 when fetch itself throws (network error)', async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      globalThis.fetch = fetchSpy;
      queueSelectResults(
        [{ id: 'purchase-1' }],
        [
          {
            spec: SAMPLE_SPEC,
            status: 'ready',
            title: 'Sample',
            duration: 300,
          },
        ],
      );
      const res = await GET(makeRequest(VALID_UUID, false), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(503);
      expect(dbState.updateCalls).toEqual([]);
    });
  });

  describe('in-process render failures', () => {
    it('returns 500 and MARKS failed when renderTrack throws', async () => {
      mockRenderTrack.mockRejectedValue(new Error('engine boom'));
      queueSelectResults(
        [{ id: 'purchase-1' }],
        [
          {
            spec: SAMPLE_SPEC,
            status: 'ready',
            title: 'Sample',
            duration: 30,
          },
        ],
      );
      const res = await GET(makeRequest(VALID_UUID, false), {
        params: { id: VALID_UUID },
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.details).toBe('engine boom');
      expect(dbState.updateCalls).toEqual([{ status: 'failed' }]);
    });
  });
});
