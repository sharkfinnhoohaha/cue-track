import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import type { ApiError, TrackRecord } from '@/types';

// ---------------------------------------------------------------------------
// GET /api/tracks/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json<ApiError>(
      { error: 'Track ID is required' },
      { status: 400 },
    );
  }

  // Lightweight UUID format check (v4 hex pattern)
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    return NextResponse.json<ApiError>(
      { error: 'Invalid track ID format' },
      { status: 400 },
    );
  }

  // --- Database lookup ---------------------------------------------------
  if (!process.env.DATABASE_URL) {
    // Demo mode: return a mock record so the frontend can still render
    return NextResponse.json<TrackRecord>({
      id,
      title: 'Demo Track',
      spec: {
        title: 'Demo Track',
        bpm: 120,
        timeSignature: { beats: 4, subdivision: 4 },
        sections: [{ id: 'intro', name: 'Intro', bars: 4 }],
        voiceId: 'en-US-Studio-M',
        clickSound: 'classic',
        format: 'wav',
        enableCountIn: true,
        enableSectionAnnounce: true,
        enableBarCountdown: false,
        countInBars: 1,
      },
      status: 'ready',
      previewUrl: `/api/tracks/${id}/download?preview=true`,
      fullUrl: `/api/tracks/${id}/download`,
      duration: 60,
      createdAt: new Date().toISOString(),
      email: null,
      userId: null,
    });
  }

  try {
    const { db, tracks } = await import('@/lib/db');
    const rows = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);

    if (rows.length === 0) {
      return NextResponse.json<ApiError>(
        { error: 'Track not found' },
        { status: 404 },
      );
    }

    const track = rows[0];

    const record: TrackRecord = {
      id: track.id,
      title: track.title,
      spec: track.spec,
      status: track.status,
      previewUrl: track.previewUrl,
      fullUrl: track.fullUrl,
      duration: track.duration,
      createdAt: track.createdAt.toISOString(),
      email: track.email,
      userId: track.userId,
    };

    return NextResponse.json(record);
  } catch (dbError) {
    console.error('[tracks/[id]] DB read failed:', dbError);
    return NextResponse.json<ApiError>(
      { error: 'Failed to retrieve track' },
      { status: 500 },
    );
  }
}
