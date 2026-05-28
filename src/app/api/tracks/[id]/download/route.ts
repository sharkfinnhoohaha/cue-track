import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import type { SongSpec } from '@/types';
import { checkTrackAccess } from '@/lib/payment-access';

export const maxDuration = 60;
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET /api/tracks/[id]/download?preview=true
// ---------------------------------------------------------------------------
//
// P0-2 fix: this route no longer reads audio files from the filesystem. The
// generate route persists only the SongSpec; this route re-renders the audio
// on demand from that spec via the existing renderTrack engine.
//
// Re-rendering on download is acceptable at V1 volume:
//   - Click placement is sample-accurate and deterministic
//   - Click synthesis is deterministic for classic and woodblock
//   - Rimshot and hi-hat use Math.random() for noise; audibly indistinguishable
//     across renders, but not byte-identical
//   - TTS results are cached in-process by voiceId:text, so subsequent renders
//     in the same warm Lambda reuse cached audio
//   - Encoder is deterministic given input
//
// Render cost for a typical 4-minute track is 3-8s on Vercel Pro, well inside
// the 60s function limit. Hobby tier (10s) will be tight for longer tracks;
// the audit recommends staying on Pro.
/**
 * Serves a rendered audio track (preview or full) by validating the request, enforcing access rules, loading the persisted SongSpec, rendering audio on demand, and streaming the resulting bytes with appropriate headers.
 *
 * @param request - The incoming NextRequest; the `preview` query parameter is read from its URL.
 * @param params - Object containing route parameters.
 * @param params.id - UUID of the track to load and render.
 * @returns An HTTP response with the rendered audio bytes and headers (200 on success). Error responses use appropriate status codes and JSON bodies (400, 402, 404, 410, 500) depending on validation, access, loading, or rendering failures.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const { searchParams } = new URL(request.url);
  const isPreview = searchParams.get('preview') === 'true';

  if (!id || typeof id !== 'string') {
    return NextResponse.json(
      { error: 'Track ID is required' },
      { status: 400 },
    );
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    return NextResponse.json(
      { error: 'Invalid track ID format' },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        error: 'Server not configured',
        details: 'DATABASE_URL is required for track download',
      },
      { status: 500 },
    );
  }

  // --- Payment gate (skip for previews) --------------------------------
  if (!isPreview) {
    const allowed = await checkTrackAccess(id);
    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Payment required',
          code: 'PAYMENT_REQUIRED',
          details: {
            checkoutUrl: `/api/stripe/checkout`,
            trackId: id,
          },
        },
        { status: 402 },
      );
    }
  }

  // --- Load spec from DB ----------------------------------------------
  const { db, tracks } = await import('@/lib/db');
  const rows = await db
    .select({
      spec: tracks.spec,
      status: tracks.status,
      title: tracks.title,
      duration: tracks.duration,
    })
    .from(tracks)
    .where(eq(tracks.id, id))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Track not found' },
      { status: 404 },
    );
  }

  const row = rows[0];
  if (row.status === 'failed') {
    return NextResponse.json(
      { error: 'Track is in failed state', details: 'Re-generate the track' },
      { status: 410 },
    );
  }

  const spec = row.spec as SongSpec;
  const ext = spec.format;
  const durationSec = row.duration ?? 0;

  // --- Render audio on demand -----------------------------------------
  // Routing rule:
  //   - Previews always render in-process (~15s of audio, fast)
  //   - Full tracks render in-process by default
  //   - Full tracks offload to the Cloud Run worker when:
  //       AUDIO_WORKER_URL is set, AND
  //       track duration >= AUDIO_WORKER_THRESHOLD_SECONDS (default 240)
  let audio: Buffer;
  try {
    if (!isPreview && shouldOffloadToWorker(durationSec)) {
      audio = await renderViaWorker(id, spec, false);
    } else if (isPreview) {
      const { renderPreviewOnly } = await import('@/lib/audio/engine');
      audio = await renderPreviewOnly(spec);
    } else {
      const { renderTrack } = await import('@/lib/audio/engine');
      const result = await renderTrack(spec);
      audio = result.fullTrack;
    }
  } catch (err) {
    console.error('[tracks/download] Render failed:', err);

    // Worker infra/network errors are transient; surface as 503 without
    // marking the track as 'failed' so retries can succeed and so a worker
    // outage does not cascade into permanent data state. Render errors
    // (in-process exceptions, or worker-rejected specs) fall through to
    // the 'failed' update below.
    if (err instanceof WorkerUnavailableError) {
      return NextResponse.json(
        {
          error: 'Audio worker temporarily unavailable',
          details: err.message,
        },
        { status: 503 },
      );
    }

    // Best-effort: mark the track as failed so the 410 path above (line
    // ~103) becomes reachable on subsequent downloads of the same id.
    // Wrapped in its own try/catch so a DB write failure does not mask
    // the original render error; we still return the 500 below either way.
    //
    // Accepted trade-off: false-positive failures (transient TTS rate
    // limits, in-process network blips) will mark the track as 'failed' too.
    // The operator can manually flip status back to 'ready' to allow re-
    // render. For configuration errors (e.g. TTS_STRICT=true with no creds),
    // every attempted render will set 'failed' until config is fixed; this
    // is acceptable because the failure surface is loud rather than silent.
    try {
      await db
        .update(tracks)
        .set({ status: 'failed' })
        .where(eq(tracks.id, id));
    } catch (updateErr) {
      console.error(
        '[tracks/download] Failed to mark track as failed:',
        updateErr,
      );
    }

    return NextResponse.json(
      {
        error: 'Track rendering failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 },
    );
  }

  // --- Stream the audio bytes -----------------------------------------
  const contentType = ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';
  const disposition = isPreview ? 'inline' : 'attachment';
  const safeTitle = sanitizeFilename(row.title) || id;
  const filename = isPreview
    ? `preview_${safeTitle}.${ext}`
    : `cuetrack_${safeTitle}.${ext}`;

  const body = new Uint8Array(
    audio.buffer as ArrayBuffer,
    audio.byteOffset,
    audio.byteLength,
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Content-Length': String(audio.length),
      // Previews can be cached more aggressively since they're deterministic.
      // Full downloads are private (per-purchase) and should not be shared.
      'Cache-Control': isPreview ? 'public, max-age=3600' : 'private, max-age=0, must-revalidate',
    },
  });
}

// ---------------------------------------------------------------------------
// Worker offload
// ---------------------------------------------------------------------------

/**
 * Network/infra-level failure talking to the Cloud Run audio worker
 * (timeout, fetch error, 401/403, 5xx). Distinguished from a real render
 * failure so the route can return 503 (transient) without marking the
 * track as 'failed' in the DB. Worker-side validation errors (4xx other
 * than 401/403) throw a regular Error so they are treated as render
 * failures and surface as 500 + 'failed' status.
 */
class WorkerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerUnavailableError';
  }
}

/**
 * True when AUDIO_WORKER_URL is set and the track duration crosses the
 * configured offload threshold (default 240 seconds of audio). Falls
 * through to in-process render when env is unset or threshold is invalid.
 */
function shouldOffloadToWorker(durationSeconds: number): boolean {
  if (!process.env.AUDIO_WORKER_URL) return false;
  const raw = process.env.AUDIO_WORKER_THRESHOLD_SECONDS;
  const threshold = raw ? Number(raw) : 240;
  if (!Number.isFinite(threshold) || threshold < 0) return false;
  return durationSeconds >= threshold;
}

/**
 * Render a track on the Cloud Run audio worker and return the requested
 * variant (full or preview) as raw bytes. POSTs to /render with a shared
 * secret; the worker responds with both fullTrackBase64 and previewBase64.
 *
 * Throws WorkerUnavailableError for network/infra issues (caller treats
 * as 503 transient); throws regular Error for worker-rejected specs
 * (caller treats as 500 render failure and marks track 'failed').
 */
async function renderViaWorker(
  trackId: string,
  spec: SongSpec,
  isPreview: boolean,
): Promise<Buffer> {
  const workerUrl = process.env.AUDIO_WORKER_URL;
  if (!workerUrl) {
    throw new WorkerUnavailableError('AUDIO_WORKER_URL is not set');
  }
  const secret = process.env.AUDIO_WORKER_SHARED_SECRET;
  if (!secret) {
    throw new WorkerUnavailableError(
      'AUDIO_WORKER_URL is set but AUDIO_WORKER_SHARED_SECRET is missing',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);

  let response: Response;
  try {
    response = await fetch(`${workerUrl.replace(/\/$/, '')}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': secret,
      },
      body: JSON.stringify({ trackId, spec }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const name = (err as { name?: string }).name;
    if (name === 'AbortError') {
      throw new WorkerUnavailableError(
        'Audio worker request timed out after 55s',
      );
    }
    throw new WorkerUnavailableError(
      `Audio worker fetch failed: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
  clearTimeout(timer);

  // 401/403 = wrong/missing shared secret (our config), 5xx = worker infra.
  // Treat both as worker-unavailable so we don't mark the track failed
  // for what is fundamentally an operator/infrastructure problem.
  if (response.status === 401 || response.status === 403 || response.status >= 500) {
    const errText = await response.text().catch(() => '');
    throw new WorkerUnavailableError(
      `Audio worker returned ${response.status}: ${errText.slice(0, 500)}`,
    );
  }

  // Other 4xx = worker rejected the spec. That's a real render failure
  // that should mark the track 'failed' (caller's catch block does this).
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Audio worker rejected spec (${response.status}): ${errText.slice(0, 500)}`,
    );
  }

  const json = (await response.json()) as {
    fullTrackBase64?: string;
    previewBase64?: string;
  };

  const b64 = isPreview ? json.previewBase64 : json.fullTrackBase64;
  if (!b64) {
    throw new Error('Audio worker returned empty audio payload');
  }

  return Buffer.from(b64, 'base64');
}

// ---------------------------------------------------------------------------
// Helpers
/**
 * Produces a filesystem- and HTTP-safe filename component from a title.
 *
 * @param name - Original title to sanitize; when falsy an empty string is returned.
 * @returns A sanitized filename segment containing only letters, digits, underscores, and hyphens, trimmed of leading/trailing underscores and truncated to 80 characters.
 */

function sanitizeFilename(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .replace(/[^a-z0-9_\-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}
