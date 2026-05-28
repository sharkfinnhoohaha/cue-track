import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import type { ApiError, TracksListResponse, TrackRecord } from '@/types';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET /api/tracks
// ---------------------------------------------------------------------------
//
// Returns the signed-in user's tracks (newest first) plus their subscription
// state. Used by /dashboard. Auth-required: anonymous callers cannot list
// other people's tracks, and dashboards have no anonymous mode.
//
// Track detail (with hasAccess) lives on /api/tracks/[id]; this route does
// not compute per-track access because dashboard cards do not gate on it —
// a Pro subscriber implicitly has access to all of their own tracks anyway.

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json<ApiError>(
      { error: 'Sign in required', code: 'AUTH_REQUIRED' },
      { status: 401 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json<TracksListResponse>({
      tracks: [],
      isPro: false,
      stripeCustomerId: null,
    });
  }

  try {
    const { db, tracks, users } = await import('@/lib/db');

    const [trackRows, userRows] = await Promise.all([
      db
        .select()
        .from(tracks)
        .where(eq(tracks.userId, userId))
        .orderBy(desc(tracks.createdAt)),
      db
        .select({
          subscriptionStatus: users.subscriptionStatus,
          stripeCustomerId: users.stripeCustomerId,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    ]);

    const isPro = userRows[0]?.subscriptionStatus === 'active';
    const stripeCustomerId = userRows[0]?.stripeCustomerId ?? null;

    const list: TrackRecord[] = trackRows.map((row) => ({
      id: row.id,
      title: row.title,
      spec: row.spec,
      status: row.status,
      previewUrl: row.previewUrl,
      fullUrl: row.fullUrl,
      duration: row.duration,
      createdAt: row.createdAt.toISOString(),
      email: row.email,
      userId: row.userId,
    }));

    return NextResponse.json<TracksListResponse>({
      tracks: list,
      isPro,
      stripeCustomerId,
    });
  } catch (err) {
    console.error('[api/tracks] list failed:', err);
    return NextResponse.json<ApiError>(
      { error: 'Failed to load tracks' },
      { status: 500 },
    );
  }
}
