import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { eq, and } from 'drizzle-orm';
import type { ApiError } from '@/types';

// ---------------------------------------------------------------------------
// Local storage path (mirrors generate route; will migrate to GCS in P2)
// ---------------------------------------------------------------------------

const TRACKS_DIR = path.join(process.cwd(), '.data', 'tracks');

// ---------------------------------------------------------------------------
// GET /api/tracks/[id]/download?preview=true
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const { searchParams } = new URL(request.url);
  const isPreview = searchParams.get('preview') === 'true';

  if (!id || typeof id !== 'string') {
    return NextResponse.json<ApiError>(
      { error: 'Track ID is required' },
      { status: 400 },
    );
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    return NextResponse.json<ApiError>(
      { error: 'Invalid track ID format' },
      { status: 400 },
    );
  }

  // --- Payment gate (skip for previews) --------------------------------
  if (!isPreview) {
    const authResult = await checkPaymentAccess(id);
    if (!authResult.allowed) {
      return NextResponse.json<ApiError>(
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

  // --- Determine file format from DB or fall back to wav ----------------
  let ext = 'wav';
  if (process.env.DATABASE_URL) {
    try {
      const { db, tracks } = await import('@/lib/db');
      const rows = await db.select({ spec: tracks.spec }).from(tracks).where(eq(tracks.id, id)).limit(1);
      if (rows.length > 0 && rows[0].spec?.format) {
        ext = rows[0].spec.format;
      }
    } catch {
      // Fall through; use default ext.
    }
  }

  // --- Resolve file path ------------------------------------------------
  const suffix = isPreview ? `_preview.${ext}` : `.${ext}`;
  const filePath = path.join(TRACKS_DIR, `${id}${suffix}`);

  // Try both extensions if the default is not found
  let resolvedPath = filePath;
  try {
    await fs.access(resolvedPath);
  } catch {
    // Try the other format
    const altExt = ext === 'wav' ? 'mp3' : 'wav';
    const altSuffix = isPreview ? `_preview.${altExt}` : `.${altExt}`;
    const altPath = path.join(TRACKS_DIR, `${id}${altSuffix}`);
    try {
      await fs.access(altPath);
      resolvedPath = altPath;
      ext = altExt;
    } catch {
      return NextResponse.json<ApiError>(
        { error: 'Track file not found' },
        { status: 404 },
      );
    }
  }

  // --- Stream the file --------------------------------------------------
  const fileBuffer = await fs.readFile(resolvedPath);
  const contentType = ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';
  const disposition = isPreview ? 'inline' : 'attachment';
  const filename = isPreview
    ? `preview_${id}.${ext}`
    : `cuetrack_${id}.${ext}`;

  // Cast buf.buffer to ArrayBuffer so the Uint8Array generic resolves to
  // Uint8Array<ArrayBuffer> (not Uint8Array<ArrayBufferLike>), which is
  // what BufferSource/BodyInit expects under TS 5.7 + @types/node 22.
  // Node Buffer is always ArrayBuffer-backed at runtime (never
  // SharedArrayBuffer), so the cast is safe. View, no copy.
  const body = new Uint8Array(
    fileBuffer.buffer as ArrayBuffer,
    fileBuffer.byteOffset,
    fileBuffer.byteLength,
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Content-Length': String(fileBuffer.length),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

// ---------------------------------------------------------------------------
// Payment / subscription check
// ---------------------------------------------------------------------------

interface AccessResult {
  allowed: boolean;
}

async function checkPaymentAccess(trackId: string): Promise<AccessResult> {
  if (!process.env.DATABASE_URL) {
    // Demo mode: allow all downloads when DB is not configured
    console.info('[download] DATABASE_URL not set; allowing download in demo mode');
    return { allowed: true };
  }

  try {
    const { db, purchases, users, tracks } = await import('@/lib/db');

    // Check 1: Does a paid purchase exist for this track?
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

    // Check 2: Is the track owner a Pro subscriber?
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
    // Fail open on DB errors; log for investigation.
    // In production you may prefer fail-closed.
    return { allowed: true };
  }
}
