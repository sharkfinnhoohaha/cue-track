import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getClientIpHash, checkAndRecordRateLimit } from '@/lib/rate-limit';
import { signDownloadToken, isDownloadTokenConfigured } from '@/lib/download-token';
import { sendPurchaseEmail } from '@/lib/purchase-email';
import type { ApiError } from '@/types';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FREE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Postgres unique-violation SQLSTATE — a second claim from the same identifier.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
}

/**
 * POST /api/tracks/[id]/claim-free
 *
 * Grants the caller their one free cue track and emails them a durable signed
 * download link. "One free per caller" is enforced by the UNIQUE identifier on
 * free_track_claims (user:<id> when authed, ip:<hash> when anonymous). Access
 * is via the returned/emailed token, so this never touches the purchases table.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json<ApiError>({ error: 'Invalid track ID format' }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json<ApiError>({ error: 'Server not configured' }, { status: 500 });
  }
  if (!isDownloadTokenConfigured()) {
    // Without a signing secret we can't issue the download link the offer
    // depends on. Fail loudly rather than recording a claim the buyer can't use.
    return NextResponse.json<ApiError>(
      { error: 'Free download links are not configured on this deployment' },
      { status: 503 },
    );
  }

  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json<ApiError>({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  // Honor the address they typed; fall back to the signed-in email if blank.
  const bodyEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const email = EMAIL_RE.test(bodyEmail) ? bodyEmail : (session?.user?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json<ApiError>({ error: 'Enter the email address to send your free track to' }, { status: 400 });
  }

  // Identifier mirrors rate_limits / upload_analyses so the cap can't be reset
  // by signing out on the same network.
  let identifier: string;
  if (userId) {
    identifier = `user:${userId}`;
  } else {
    const ipHash = getClientIpHash(request);
    if (!ipHash) {
      return NextResponse.json<ApiError>(
        { error: 'Could not identify the request', details: 'Sign in to claim your free track.' },
        { status: 400 },
      );
    }
    identifier = `ip:${ipHash}`;
  }

  // Light rate limit so the endpoint can't be hammered (the UNIQUE constraint
  // is the real cap; this just blunts abuse/races).
  const rate = await checkAndRecordRateLimit(`claim:${identifier}`, userId ? 'auth' : 'anon', 10);
  if (!rate.allowed) {
    return NextResponse.json<ApiError>(
      { error: 'Too many attempts', details: 'Try again in a little while.' },
      { status: 429 },
    );
  }

  const { db, freeTrackClaims, tracks } = await import('@/lib/db');
  const { eq } = await import('drizzle-orm');

  // Track must exist and be finalized.
  const trackRows = await db
    .select({ status: tracks.status, title: tracks.title })
    .from(tracks)
    .where(eq(tracks.id, id))
    .limit(1);
  const track = trackRows[0];
  if (!track) {
    return NextResponse.json<ApiError>({ error: 'Track not found' }, { status: 404 });
  }
  if (track.status !== 'ready') {
    return NextResponse.json<ApiError>(
      { error: 'Track is not ready yet', details: 'Finalize the track before claiming it.' },
      { status: 409 },
    );
  }

  // Has this caller already used their free track?
  const existing = await db
    .select({ trackId: freeTrackClaims.trackId })
    .from(freeTrackClaims)
    .where(eq(freeTrackClaims.identifier, identifier))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json<ApiError>(
      {
        error: "You've already claimed your free track",
        code: 'FREE_TRACK_USED',
        details: 'Each person gets one free cue track. Additional tracks are $3 each, or go Pro.',
      },
      { status: 409 },
    );
  }

  // Record the claim. The UNIQUE identifier makes this the atomic gate against
  // a concurrent double-claim.
  try {
    await db.insert(freeTrackClaims).values({ identifier, trackId: id, email });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json<ApiError>(
        { error: "You've already claimed your free track", code: 'FREE_TRACK_USED' },
        { status: 409 },
      );
    }
    console.error('[claim-free] insert failed:', err);
    return NextResponse.json<ApiError>({ error: 'Could not record your claim' }, { status: 500 });
  }

  const token = signDownloadToken(id, FREE_TOKEN_TTL_SECONDS);

  // Email the durable link (best-effort: a mail outage must not fail the claim
  // — the caller already gets the token in the response for immediate download).
  if (token) {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cuetrack.app';
      const base = /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;
      await sendPurchaseEmail({
        to: email,
        trackTitle: track.title,
        downloadUrl: `${base}/tracks/${id}?token=${token}`,
      });
    } catch (emailErr) {
      console.error('[claim-free] email failed (non-fatal):', emailErr);
    }
  }

  return NextResponse.json({ ok: true, token, email });
}
