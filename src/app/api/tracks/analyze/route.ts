import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import type { SongSpec } from '@/types';
import { auth } from '@/auth';
import { checkAndRecordRateLimit, getClientIpHash } from '@/lib/rate-limit';

export const maxDuration = 60;
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// POST /api/tracks/analyze
// ---------------------------------------------------------------------------
//
// Accepts a multipart/form-data POST with a single audio file under the
// "file" field (MP3 or WAV, <= 50 MB). Forwards the raw bytes to the
// Cloud Run worker's POST /analyze endpoint, which decodes the audio,
// runs music-tempo for BPM, and returns a suggested SongSpec template.
//
// On success, persists a draft tracks row with status='rendering' and the
// suggested spec, then returns { id } so the client can navigate to
// /tracks/[id]/review for user adjustment. The user finalizes by submitting
// the (possibly edited) spec to /api/tracks/generate with existingTrackId
// set, which flips the row to status='ready'.
//
// Phase C paywall: ENABLE_ANALYZE_PAYWALL gates the 1-free-use cap. Left as
// a no-op in V1; the flag stays unset in production until C ships.

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ACCEPTED_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
]);

interface WorkerAnalyzeResponse {
  bpm: number;
  duration: number;
  sampleRate: number;
  suggestedSections: Array<{ id: string; name: string; bars: number }>;
}

function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '').trim() || 'Untitled track';
}

function normalizeMime(mime: string, filename: string): string | null {
  const base = mime.toLowerCase().split(';')[0].trim();
  if (ACCEPTED_MIMES.has(base)) return base;
  // Fallback: some browsers send audio/octet-stream or empty for drag-drop.
  // Honor the file extension as a last resort.
  if (/\.mp3$/i.test(filename)) return 'audio/mpeg';
  if (/\.wav$/i.test(filename)) return 'audio/wav';
  return null;
}

function buildSuggestedSpec(
  title: string,
  worker: WorkerAnalyzeResponse,
): SongSpec {
  return {
    title,
    bpm: worker.bpm,
    timeSignature: { beats: 4, subdivision: 4 },
    sections: worker.suggestedSections,
    // Standard voice is the free default; users on the review screen can
    // swap to a Studio voice (the voice-tier gate fires on /generate, not
    // here, so the suggestion is voice-tier-agnostic).
    voiceId: 'en-US-Standard-D',
    clickSound: 'classic',
    format: 'wav',
    enableCountIn: true,
    enableSectionAnnounce: true,
    enableBarCountdown: false,
    countInBars: 2,
  };
}

export async function POST(request: NextRequest) {
  // --- Parse multipart form ---------------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Invalid multipart body',
        details: err instanceof Error ? err.message : 'Could not parse form',
      },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing file', details: 'Expected a "file" field of type File' },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: 'Empty file', details: 'Uploaded file is 0 bytes' },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: 'File too large',
        code: 'FILE_TOO_LARGE',
        details: `File is ${file.size} bytes; maximum is ${MAX_FILE_BYTES} bytes (50 MB)`,
      },
      { status: 400 },
    );
  }

  const mime = normalizeMime(file.type, file.name);
  if (!mime) {
    return NextResponse.json(
      {
        error: 'Unsupported file type',
        code: 'INVALID_MIME',
        details: `Got ${file.type || '(empty)'}; expected MP3 or WAV`,
      },
      { status: 400 },
    );
  }

  // --- Identify caller --------------------------------------------------
  const session = await auth();
  const userId = session?.user?.id ?? null;
  let rateIdentifier: string;
  let rateKind: 'auth' | 'anon';
  if (userId) {
    rateIdentifier = `user:${userId}`;
    rateKind = 'auth';
  } else {
    const ipHash = getClientIpHash(request);
    if (!ipHash) {
      return NextResponse.json(
        {
          error: 'Cannot determine client identifier',
          details:
            'No session and no forwarded IP header. Sign in to analyze.',
        },
        { status: 400 },
      );
    }
    rateIdentifier = `ip:${ipHash}`;
    rateKind = 'anon';
  }

  // --- Rate limit (shared with /generate quota) -------------------------
  const rate = await checkAndRecordRateLimit(rateIdentifier, rateKind);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        details:
          rateKind === 'auth'
            ? `You have submitted ${rate.current} requests in the last hour (limit ${rate.limit}). Try again in about ${Math.ceil((rate.retryAfterSeconds ?? 60) / 60)} minute(s).`
            : `This network has submitted ${rate.current} requests in the last hour (limit ${rate.limit}). Sign in for a higher cap, or try again in about ${Math.ceil((rate.retryAfterSeconds ?? 60) / 60)} minute(s).`,
        code: 'RATE_LIMITED',
        retryAfterSeconds: rate.retryAfterSeconds,
        authBoost: rateKind === 'anon',
      },
      {
        status: 429,
        headers: rate.retryAfterSeconds
          ? { 'Retry-After': String(rate.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  // --- Phase C paywall stub (gated off in V1) --------------------------
  if (process.env.ENABLE_ANALYZE_PAYWALL === 'true') {
    // Intentional no-op for Phase B. Wiring lands in Phase C alongside the
    // upload_analyses table and the 402 UPLOAD_QUOTA_EXCEEDED response.
  }

  // --- Forward to worker ------------------------------------------------
  const workerUrl = process.env.AUDIO_WORKER_URL;
  const workerSecret = process.env.AUDIO_WORKER_SHARED_SECRET;
  if (!workerUrl || !workerSecret) {
    return NextResponse.json(
      {
        error: 'Audio analysis is not configured',
        details:
          'AUDIO_WORKER_URL and AUDIO_WORKER_SHARED_SECRET must be set.',
      },
      { status: 503 },
    );
  }

  const audioBytes = await file.arrayBuffer();

  const controller = new AbortController();
  const timeoutMs = 55_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let workerResponse: Response;
  try {
    workerResponse = await fetch(`${workerUrl}/analyze`, {
      method: 'POST',
      headers: {
        'content-type': mime,
        'x-worker-secret': workerSecret,
      },
      body: audioBytes,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const aborted = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      {
        error: aborted ? 'Analysis timed out' : 'Audio worker unreachable',
        details: err instanceof Error ? err.message : 'Unknown fetch error',
      },
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (workerResponse.status === 415 || workerResponse.status === 422) {
    let detail = 'Worker could not decode the audio file';
    try {
      const body = (await workerResponse.json()) as { detail?: string };
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch {
      // ignore body parse errors
    }
    return NextResponse.json(
      {
        error: 'Could not analyze this file',
        code: 'DECODE_FAILED',
        details: detail,
      },
      { status: 422 },
    );
  }

  if (!workerResponse.ok) {
    return NextResponse.json(
      {
        error: 'Audio worker error',
        details: `Worker returned ${workerResponse.status}`,
      },
      { status: 502 },
    );
  }

  let workerBody: WorkerAnalyzeResponse;
  try {
    workerBody = (await workerResponse.json()) as WorkerAnalyzeResponse;
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Worker returned invalid JSON',
        details: err instanceof Error ? err.message : 'Parse error',
      },
      { status: 502 },
    );
  }

  if (
    typeof workerBody.bpm !== 'number' ||
    typeof workerBody.duration !== 'number' ||
    !Array.isArray(workerBody.suggestedSections)
  ) {
    return NextResponse.json(
      {
        error: 'Worker returned malformed payload',
        details: 'Missing bpm, duration, or suggestedSections',
      },
      { status: 502 },
    );
  }

  // --- Persist draft track row -----------------------------------------
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        error: 'Server not configured',
        details: 'DATABASE_URL is required.',
      },
      { status: 500 },
    );
  }

  const trackId = crypto.randomUUID();
  const title = stripExtension(file.name);
  const suggestedSpec = buildSuggestedSpec(title, workerBody);
  const durationSec = Math.max(1, Math.round(workerBody.duration));

  try {
    const { db, tracks } = await import('@/lib/db');
    const rows = await db
      .insert(tracks)
      .values({
        id: trackId,
        title,
        spec: suggestedSpec,
        status: 'rendering',
        previewUrl: null,
        fullUrl: null,
        duration: durationSec,
        userId: userId ?? undefined,
      })
      .returning({ id: tracks.id });

    const saved = rows[0];
    if (!saved) {
      return NextResponse.json(
        {
          error: 'Track persistence failed',
          details: 'Insert returned no rows',
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: saved.id,
      bpm: workerBody.bpm,
      duration: workerBody.duration,
      suggestedSections: workerBody.suggestedSections,
    });
  } catch (err) {
    console.error('[tracks/analyze] Persistence failed:', err);
    return NextResponse.json(
      {
        error: 'Track persistence failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
