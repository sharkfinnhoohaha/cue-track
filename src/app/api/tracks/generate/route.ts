import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import type { SongSpec, ApiError } from '@/types';

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_CLICK_SOUNDS = ['classic', 'woodblock', 'rimshot', 'hi-hat'] as const;
const VALID_FORMATS = ['wav', 'mp3'] as const;

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

  // countInBars
  if (typeof b.countInBars !== 'number' || ![0, 1, 2].includes(b.countInBars)) {
    errors.push('countInBars must be 0, 1, or 2');
  }

  return { spec: body as SongSpec, errors };
}

// ---------------------------------------------------------------------------
// Storage directory (local filesystem -- will migrate to GCS)
// ---------------------------------------------------------------------------

const TRACKS_DIR = path.join(process.cwd(), '.data', 'tracks');

async function ensureTracksDir(): Promise<void> {
  await fs.mkdir(TRACKS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// POST /api/tracks/generate
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    );
  }

  // --- Validate --------------------------------------------------------
  const { spec, errors } = validateSpec(body);
  if (errors.length > 0) {
    return NextResponse.json<ApiError>(
      { error: 'Validation failed', details: errors },
      { status: 400 },
    );
  }

  const trackId = crypto.randomUUID();

  try {
    // --- Render audio ---------------------------------------------------
    // Dynamic import so we only load the heavy audio engine on this route
    const { renderTrack } = await import('@/lib/audio/engine');
    const result = await renderTrack(spec);

    // --- Persist to local filesystem ------------------------------------
    await ensureTracksDir();
    const ext = spec.format;
    const fullPath = path.join(TRACKS_DIR, `${trackId}.${ext}`);
    const previewPath = path.join(TRACKS_DIR, `${trackId}_preview.${ext}`);

    await Promise.all([
      fs.writeFile(fullPath, result.fullTrack),
      fs.writeFile(previewPath, result.preview),
    ]);

    const previewUrl = `/api/tracks/${trackId}/download?preview=true`;
    const fullUrl = `/api/tracks/${trackId}/download`;

    // --- Save to database (or fall back to in-memory) -------------------
    let savedRecord: {
      id: string;
      previewUrl: string;
      status: string;
      duration: number;
    } | null = null;

    if (process.env.DATABASE_URL) {
      try {
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
            duration: Math.round(result.duration),
          })
          .returning({
            id: tracks.id,
            previewUrl: tracks.previewUrl,
            status: tracks.status,
            duration: tracks.duration,
          });
        savedRecord = rows[0]
          ? { ...rows[0], previewUrl: rows[0].previewUrl ?? previewUrl, status: rows[0].status, duration: rows[0].duration ?? Math.round(result.duration) }
          : null;
      } catch (dbError) {
        console.warn('[tracks/generate] DB write failed, continuing without persistence:', dbError);
      }
    } else {
      console.info('[tracks/generate] DATABASE_URL not set -- skipping DB write');
    }

    return NextResponse.json({
      id: savedRecord?.id ?? trackId,
      previewUrl: savedRecord?.previewUrl ?? previewUrl,
      status: savedRecord?.status ?? 'ready',
      duration: savedRecord?.duration ?? Math.round(result.duration),
    });
  } catch (renderErr) {
    console.error('[tracks/generate] Render failed:', renderErr);
    return NextResponse.json<ApiError>(
      {
        error: 'Track rendering failed',
        details:
          renderErr instanceof Error ? renderErr.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
