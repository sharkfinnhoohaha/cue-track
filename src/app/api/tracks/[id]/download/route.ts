import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import type { SongSpec } from '@/types';

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
//
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
    const access = await checkPaymentAccess(id);
    if (!access.allowed) {
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
    .select({ spec: tracks.spec, status: tracks.status, title: tracks.title })
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

  // --- Render audio on demand -----------------------------------------
  let audio: Buffer;
  try {
    const { renderTrack, renderPreviewOnly } = await import('@/lib/audio/engine');
    if (isPreview) {
      audio = await renderPreviewOnly(spec);
    } else {
      const result = await renderTrack(spec);
      audio = result.fullTrack;
    }
  } catch (err) {
    console.error('[tracks/download] Render failed:', err);
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
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFilename(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .replace(/[^a-z0-9_\-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

interface AccessResult {
  allowed: boolean;
}

async function checkPaymentAccess(trackId: string): Promise<AccessResult> {
  // DATABASE_URL is required at the top of GET; if we got here, it is set.
  try {
    const { db, purchases, users, tracks } = await import('@/lib/db');

    // Check 1: paid purchase exists for this track
    const paidPurchase = await db
      .select({ id: purchases.id })
      .from(purchases)
      .where(
        and(
          eq(purchases.trackId, trackId),
          eq(purchases.status, 'paid'),
        ),
      )
      .limit(1);

    if (paidPurchase.length > 0) {
      return { allowed: true };
    }

    // Check 2: track owner is an active Pro subscriber
    const trackRows = await db
      .select({ userId: tracks.userId })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .limit(1);

    if (trackRows.length > 0 && trackRows[0].userId) {
      const userRows = await db
        .select({ subscriptionStatus: users.subscriptionStatus })
        .from(users)
        .where(eq(users.id, trackRows[0].userId))
        .limit(1);

      if (userRows.length > 0 && userRows[0].subscriptionStatus === 'active') {
        return { allowed: true };
      }
    }

    return { allowed: false };
  } catch (dbError) {
    console.error('[download] Payment check failed:', dbError);
    // Fail closed when the DB check itself errors. Previously this failed open,
    // which is permissive but risky once real payments are flowing.
    return { allowed: false };
  }
}
