import { NextRequest, NextResponse } from 'next/server';
import { lt } from 'drizzle-orm';

/**
 * Scheduled cleanup of the rate_limits table.
 *
 * The rate limiter at src/lib/rate-limit.ts only consults rows within the
 * trailing hour, but rows are never deleted on the hot path, so the table
 * grows linearly with traffic. Without this cron, the rate-limit query plan
 * degrades over time and storage costs creep up.
 *
 * Scheduled via vercel.json crons at 03:00 UTC daily. Deletes everything
 * older than 24 hours (4x the largest useful window, in case we ever raise
 * the limiter's lookback) to keep the table tight without making the cron
 * timing-critical.
 *
 * Auth: Vercel Cron injects Authorization: Bearer ${CRON_SECRET} on
 * scheduled invocations when CRON_SECRET is set in project env. We require
 * the secret to be configured in production so the route is not callable by
 * unauthenticated traffic. Locally, requests without CRON_SECRET configured
 * are rejected with 503 so the dev flow never silently no-ops in prod.
 *
 * Fail-soft on missing table: if rate_limits has not been created yet (the
 * 2026-05-17 migration is operator-applied), the delete throws and we
 * return 200 with deletedCount: 0 plus the error string. Same shape as the
 * limiter at src/lib/rate-limit.ts so the table-missing state is consistent
 * across the two callers.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      {
        error: 'CRON_SECRET not configured',
        details:
          'Set CRON_SECRET in Vercel project env and redeploy. Vercel ' +
          'injects this as Authorization: Bearer on scheduled invocations.',
      },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const { db, rateLimits } = await import('@/lib/db');
    const result = await db
      .delete(rateLimits)
      .where(lt(rateLimits.createdAt, cutoff))
      .returning({ id: rateLimits.id });

    return NextResponse.json({
      ok: true,
      deletedCount: result.length,
      cutoff: cutoff.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/cleanup-rate-limits] delete failed:', err);
    return NextResponse.json(
      {
        ok: false,
        deletedCount: 0,
        cutoff: cutoff.toISOString(),
        error: message,
      },
      { status: 200 },
    );
  }
}
