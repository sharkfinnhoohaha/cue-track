/**
 * Shared entitlement check for a track's full (non-preview) audio.
 *
 * A track is accessible when either:
 *   1. a paid one-time purchase exists for that track, OR
 *   2. the track's owner is an active Pro subscriber.
 *
 * Used by the download route (gate the bytes) and the track detail API
 * (tell the client whether to show Download vs Buy). Single source of
 * truth so the two never drift.
 *
 * Fails closed: any DB error returns false. Callers must have DATABASE_URL
 * set; without it this returns false rather than throwing.
 */
export async function checkTrackAccess(trackId: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { db, purchases, users, tracks } = await import('@/lib/db');
    const { eq, and } = await import('drizzle-orm');

    // 1. Paid one-time purchase for this track.
    const paid = await db
      .select({ id: purchases.id })
      .from(purchases)
      .where(and(eq(purchases.trackId, trackId), eq(purchases.status, 'paid')))
      .limit(1);
    if (paid.length > 0) return true;

    // 2. Track owner is an active Pro subscriber.
    const trackRows = await db
      .select({ userId: tracks.userId })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .limit(1);

    const ownerId = trackRows[0]?.userId;
    if (ownerId) {
      const userRows = await db
        .select({ subscriptionStatus: users.subscriptionStatus })
        .from(users)
        .where(eq(users.id, ownerId))
        .limit(1);
      if (userRows[0]?.subscriptionStatus === 'active') return true;
    }

    return false;
  } catch (err) {
    console.error('[payment-access] check failed, denying:', err);
    return false;
  }
}
