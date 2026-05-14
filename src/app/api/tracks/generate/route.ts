import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import type { SongSpec } from '@/types';
import { buildTimeGrid } from '@/lib/audio/grid';
import { DEFAULT_SAMPLE_RATE } from '@/lib/audio/types';

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

  // --- Validate --------------------------------------------------------
  const { spec, errors } = validateSpec(body);
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

  const trackId = crypto.randomUUID();

  try {
    // --- Compute duration from the grid (no audio render) -------------
    const grid = buildTimeGrid(spec, DEFAULT_SAMPLE_RATE);
    const durationSec = Math.round(grid.totalDuration);

    // --- Persist spec to DB ------------------------------------------
    const previewUrl = `/api/tracks/${trackId}/download?preview=true`;
    const fullUrl = `/api/tracks/${trackId}/download`;

    const { db, tracks } = await import('@/lib/db');
    const rows = await db
      .insert(tracks)
      .values({
        id: trackId,
        title: spec.title,
        spec,
        status: 'ready',
        previewUrl,
        fullUrl,
        duration: durationSec,
      })
      .returning({
        id: tracks.id,
        previewUrl: tracks.previewUrl,
        status: tracks.status,
        duration: tracks.duration,
      });

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
