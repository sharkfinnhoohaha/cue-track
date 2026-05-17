import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import type { SongSpec } from '@/types';
import { buildTimeGrid } from '@/lib/audio/grid';
import { DEFAULT_SAMPLE_RATE } from '@/lib/audio/types';
import { auth } from '@/auth';
import { checkAndRecordRateLimit, getClientIpHash } from '@/lib/rate-limit';
import { getVoiceTier } from '@/lib/audio/types';
import { eq } from 'drizzle-orm';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const maxDuration = 60;
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_CLICK_SOUNDS = ['classic', 'woodblock', 'rimshot', 'hi-hat'] as const;
const VALID_FORMATS = ['wav', 'mp3'] as const;
const VALID_COUNT_IN_BARS = [0, 1, 2, 3, 4] as const;

/**
 * Validate an arbitrary value as a SongSpec and collect any validation errors.
 *
 * Validates required song-spec fields (title, bpm, timeSignature, sections, voiceId,
 * clickSound, format, boolean flags, and countInBars) and returns the original value
 * cast to `SongSpec` together with any validation messages.
 *
 * @param body - The parsed JSON request body to validate
 * @returns An object with `spec` set to the input cast as `SongSpec` (only meaningful when `errors` is empty) and `errors` containing any validation error messages
 */
function validateSpec(body: unknown): { spec: SongSpec; errors: string[] } {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { spec: null as unknown as SongSpec, errors: ['Request body must be a JSON object'] };
  }

  const b = body as Record<string, unknown>;

  // title
  if (typeof b.title !== 'string' || b.title.trim().length === 0) {
    errors.push('title is required and must be a non-empty string');
  }
  if (typeof b.title === 'string' && b.title.length > 200) {
    errors.push('title must be 200 characters or fewer');
  }

  // bpm
  if (typeof b.bpm !== 'number' || !Number.isFinite(b.bpm)) {
    errors.push('bpm is required and must be a number');
  } else if (b.bpm < 30 || b.bpm > 300) {
    errors.push('bpm must be between 30 and 300');
  }

  // timeSignature
  if (!b.timeSignature || typeof b.timeSignature !== 'object') {
    errors.push('timeSignature is required');
  } else {
    const ts = b.timeSignature as Record<string, unknown>;
    if (typeof ts.beats !== 'number' || ts.beats < 1 || ts.beats > 12) {
      errors.push('timeSignature.beats must be a number between 1 and 12');
    }
    if (typeof ts.subdivision !== 'number' || ![2, 4, 8, 16].includes(ts.subdivision)) {
      errors.push('timeSignature.subdivision must be one of 2, 4, 8, 16');
    }
  }

  // sections
  if (!Array.isArray(b.sections) || b.sections.length === 0) {
    errors.push('sections must be a non-empty array');
  } else {
    for (let i = 0; i < b.sections.length; i++) {
      const sec = b.sections[i] as Record<string, unknown>;
      if (!sec || typeof sec !== 'object') {
        errors.push(`sections[${i}] must be an object`);
        continue;
      }
      if (typeof sec.id !== 'string' || sec.id.trim().length === 0) {
        errors.push(`sections[${i}].id is required`);
      }
      if (typeof sec.name !== 'string' || sec.name.trim().length === 0) {
        errors.push(`sections[${i}].name is required`);
      }
      if (typeof sec.bars !== 'number' || sec.bars < 1 || sec.bars > 999) {
        errors.push(`sections[${i}].bars must be between 1 and 999`);
      }
      if (sec.bpmOverride !== undefined) {
        if (typeof sec.bpmOverride !== 'number' || sec.bpmOverride < 30 || sec.bpmOverride > 300) {
          errors.push(`sections[${i}].bpmOverride must be between 30 and 300`);
        }
      }
    }
  }

  // voiceId
  if (typeof b.voiceId !== 'string' || b.voiceId.trim().length === 0) {
    errors.push('voiceId is required');
  }

  // clickSound
  if (!VALID_CLICK_SOUNDS.includes(b.clickSound as typeof VALID_CLICK_SOUNDS[number])) {
    errors.push(`clickSound must be one of: ${VALID_CLICK_SOUNDS.join(', ')}`);
  }

  // format
  if (!VALID_FORMATS.includes(b.format as typeof VALID_FORMATS[number])) {
    errors.push(`format must be one of: ${VALID_FORMATS.join(', ')}`);
  }

  // booleans
  if (typeof b.enableCountIn !== 'boolean') {
    errors.push('enableCountIn must be a boolean');
  }
  if (typeof b.enableSectionAnnounce !== 'boolean') {
    errors.push('enableSectionAnnounce must be a boolean');
  }
  if (typeof b.enableBarCountdown !== 'boolean') {
    errors.push('enableBarCountdown must be a boolean');
  }

  // countInBars — P0-1 fix: widen from [0, 1, 2] to [0, 1, 2, 3, 4] to match the
  // /create UI which surfaces buttons for 1, 2, 3, 4. The default in the form is
  // 2 (which previously passed), but any user clicking 3 or 4 hit a 400.
  if (
    typeof b.countInBars !== 'number' ||
    !VALID_COUNT_IN_BARS.includes(b.countInBars as typeof VALID_COUNT_IN_BARS[number])
  ) {
    errors.push(`countInBars must be one of: ${VALID_COUNT_IN_BARS.join(', ')}`);
  }

  return { spec: body as SongSpec, errors };
}

// ---------------------------------------------------------------------------
// POST /api/tracks/generate
// ---------------------------------------------------------------------------
//
// P0-2 fix: this route no longer writes audio to the filesystem. On Vercel
// serverless, process.cwd() resolves to /var/task which is read-only, so the
// previous fs.mkdir/.writeFile calls failed with EROFS and surfaced as the
// opaque "Track rendering failed" message.
//
// New design: the route persists ONLY the SongSpec to the database. The
// download route re-renders the audio on demand from that spec, which is
// safe because rendering is deterministic in everything that matters (sample
// placement, beat grid, TTS via cache, encoder). The noise textures used by
// the rimshot and hi-hat click sounds use Math.random() and are not byte-
// identical across renders, but the audible result is indistinguishable.
//
// Duration is computed from the time grid alone, which is cheap. Audio is
// NOT rendered at generate time, so this route is now O(grid) regardless of
// song length, and "Track rendering failed" can only mean a DB write failed.
/**
 * Handle POST requests to create a new track entry from a SongSpec payload, compute its duration from the time grid, persist the spec to the database, and return the saved track metadata.
 *
 * @param request - Next.js request whose JSON body must be a valid `SongSpec`
 * @returns JSON response with either the saved track metadata (`id`, `previewUrl`, `status`, `duration`) or an error object containing `error` and optional `details`
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    );
  }

  // Pull existingTrackId off the body before validation so it does not end
  // up persisted into the spec jsonb. When present, the route UPDATEs the
  // existing draft (created by /api/tracks/analyze) rather than INSERTing
  // a new row.
  let existingTrackId: string | undefined;
  let specCandidate: unknown = body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const { existingTrackId: rawId, ...rest } = body as Record<string, unknown>;
    if (rawId !== undefined) {
      if (typeof rawId !== 'string' || !UUID_REGEX.test(rawId)) {
        return NextResponse.json(
          {
            error: 'Validation failed',
            details: ['existingTrackId must be a UUID'],
          },
          { status: 400 },
        );
      }
      existingTrackId = rawId;
    }
    specCandidate = rest;
  }

  // --- Validate --------------------------------------------------------
  const { spec, errors } = validateSpec(specCandidate);
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', details: errors },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        error: 'Server not configured',
        details:
          'DATABASE_URL is required. Set DATABASE_URL in your environment ' +
          '(Neon Postgres connection string) and redeploy.',
      },
      { status: 500 },
    );
  }

  // --- Manual-mode signup gate -----------------------------------------
  // Per the V1 funnel: manual mode (filling out the form directly) is
  // signup-only. The upload-analysis flow remains anon-friendly because
  // the user is finalizing a draft they already created via /analyze,
  // identified by a server-issued existingTrackId. So anon callers can
  // hit /generate only when they have an existingTrackId; without one,
  // it is a manual-mode submission and must be authenticated.
  //
  // The TrackForm client component renders a signup modal before reaching
  // this branch in the normal flow, but this gate is the authoritative
  // backstop for anyone bypassing the UI (curl, scripts, replayed
  // requests after sign-out).
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId && !existingTrackId) {
    return NextResponse.json(
      {
        error: 'Sign in to use manual mode',
        details:
          'Manual track generation requires an account. Upload a song instead to try Cue Track without signing up.',
        code: 'SIGNUP_REQUIRED',
      },
      { status: 401 },
    );
  }

  // --- Rate limit --------------------------------------------------------
  // Authenticated users are throttled per userId at GENERATE_RATE_LIMIT_AUTH_
  // PER_HOUR (default 200). Anonymous users finalizing an upload draft are
  // throttled per salted IP hash at GENERATE_RATE_LIMIT_ANON_PER_HOUR
  // (default 5). The "sign up to lift the cap" UX is surfaced by the
  // frontend; here we just return 429 with authBoost: true so the client
  // can render a useful message.
  //
  // Fail-open by design: if the rate_limits table is missing (migration not
  // run yet) or the DB errors out, the limiter logs and allows the request.
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
            'No session and no forwarded IP header. Sign in to generate.',
        },
        { status: 400 },
      );
    }
    rateIdentifier = `ip:${ipHash}`;
    rateKind = 'anon';
  }
  const rate = await checkAndRecordRateLimit(rateIdentifier, rateKind);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        details:
          rateKind === 'auth'
            ? `You have generated ${rate.current} tracks in the last hour (limit ${rate.limit}). Try again in about ${Math.ceil((rate.retryAfterSeconds ?? 60) / 60)} minute(s).`
            : `This network has generated ${rate.current} tracks in the last hour (limit ${rate.limit}). Sign in for a higher cap, or try again in about ${Math.ceil((rate.retryAfterSeconds ?? 60) / 60)} minute(s).`,
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

  // --- Voice tier gate -------------------------------------------------
  // Studio voices cost 40x more per character than Standard (Google TTS
  // pricing: $160/M vs $4/M). Free users get Standard; Studio requires
  // an active Pro subscription. The form surfaces a (PRO) suffix on the
  // option label so the upsell is visible before submit, but the route
  // is the source of truth so anyone bypassing the UI also hits this.
  if (getVoiceTier(spec.voiceId) === 'studio') {
    let hasActiveSub = false;
    if (userId) {
      try {
        const { db, users } = await import('@/lib/db');
        const rows = await db
          .select({ subscriptionStatus: users.subscriptionStatus })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        hasActiveSub = rows[0]?.subscriptionStatus === 'active';
      } catch (err) {
        console.error('[tracks/generate] subscription lookup failed:', err);
        // Fail closed: if we cannot verify the subscription, treat as
        // unpaid. Avoids the cost-leak path where a transient DB error
        // unlocks Studio voices for free.
        hasActiveSub = false;
      }
    }
    if (!hasActiveSub) {
      return NextResponse.json(
        {
          error: 'Premium voice requires Pro subscription',
          details:
            'Studio voices are part of the Pro plan. Pick a Standard voice, or subscribe at /pricing.',
          code: 'VOICE_TIER_REQUIRED',
          requiredTier: 'studio',
          voiceId: spec.voiceId,
        },
        { status: 402 },
      );
    }
  }

  const trackId = existingTrackId ?? crypto.randomUUID();

  try {
    // --- Compute duration from the grid (no audio render) -------------
    const grid = buildTimeGrid(spec, DEFAULT_SAMPLE_RATE);
    const durationSec = Math.round(grid.totalDuration);

    // --- Enforce duration cap ----------------------------------------
    // Reject specs that compute to a track longer than the configured
    // ceiling so users do not save specs the system cannot render. The
    // cap is set via MAX_TRACK_DURATION_SECONDS (default 1800, i.e.
    // 30 minutes). The frontend mirrors the same value via
    // NEXT_PUBLIC_MAX_TRACK_DURATION_SECONDS for the UI warning.
    const maxDurationRaw = process.env.MAX_TRACK_DURATION_SECONDS;
    const maxDurationSec = maxDurationRaw ? Number(maxDurationRaw) : 1800;
    if (
      Number.isFinite(maxDurationSec) &&
      maxDurationSec > 0 &&
      durationSec > maxDurationSec
    ) {
      return NextResponse.json(
        {
          error: 'Track duration exceeds the configured maximum',
          details: `Requested duration ${durationSec}s exceeds limit ${maxDurationSec}s. Reduce bars or sections.`,
          maxSeconds: maxDurationSec,
          requestedSeconds: durationSec,
        },
        { status: 400 },
      );
    }

    // --- Persist spec to DB ------------------------------------------
    const previewUrl = `/api/tracks/${trackId}/download?preview=true`;
    const fullUrl = `/api/tracks/${trackId}/download`;

    const { db, tracks } = await import('@/lib/db');

    let rows: Array<{
      id: string;
      previewUrl: string | null;
      status: string;
      duration: number | null;
    }>;

    if (existingTrackId) {
      // Finalize a draft created by /api/tracks/analyze. For authenticated
      // callers, verify that either the draft has no owner (anon upload) or
      // the owner matches the current session, so users cannot finalize
      // someone else's draft by guessing UUIDs. Anonymous callers rely on
      // UUID-as-bearer (the URL is the secret).
      if (userId) {
        const owners = await db
          .select({ userId: tracks.userId })
          .from(tracks)
          .where(eq(tracks.id, existingTrackId))
          .limit(1);
        const ownerRow = owners[0];
        if (!ownerRow) {
          return NextResponse.json(
            { error: 'Track not found', details: `No track with id ${existingTrackId}` },
            { status: 404 },
          );
        }
        if (ownerRow.userId !== null && ownerRow.userId !== userId) {
          return NextResponse.json(
            { error: 'Forbidden', details: 'Track belongs to another user' },
            { status: 403 },
          );
        }
      }

      rows = await db
        .update(tracks)
        .set({
          title: spec.title,
          spec,
          status: 'ready',
          previewUrl,
          fullUrl,
          duration: durationSec,
          // Attribute the row to the finalizing user if they have signed in
          // since the draft was created. Anon drafts keep userId null.
          ...(userId ? { userId } : {}),
        })
        .where(eq(tracks.id, existingTrackId))
        .returning({
          id: tracks.id,
          previewUrl: tracks.previewUrl,
          status: tracks.status,
          duration: tracks.duration,
        });

      if (rows.length === 0) {
        return NextResponse.json(
          { error: 'Track not found', details: `No track with id ${existingTrackId}` },
          { status: 404 },
        );
      }
    } else {
      rows = await db
        .insert(tracks)
        .values({
          id: trackId,
          title: spec.title,
          spec,
          status: 'ready',
          previewUrl,
          fullUrl,
          duration: durationSec,
          userId: userId ?? undefined,
        })
        .returning({
          id: tracks.id,
          previewUrl: tracks.previewUrl,
          status: tracks.status,
          duration: tracks.duration,
        });
    }

    const saved = rows[0];
    if (!saved) {
      return NextResponse.json(
        { error: 'Track persistence failed', details: 'Insert returned no rows' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: saved.id,
      previewUrl: saved.previewUrl ?? previewUrl,
      status: saved.status,
      duration: saved.duration ?? durationSec,
    });
  } catch (err) {
    console.error('[tracks/generate] Persistence failed:', err);
    return NextResponse.json(
      {
        error: 'Track persistence failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
