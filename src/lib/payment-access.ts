import { isDownloadTokenConfigured, verifyDownloadToken } from '@/lib/download-token';

/**
 * Shared entitlement check for a track's full (non-preview) audio.
 *
 * Access is granted when any of these hold:
 *   1. A valid signed download token for the track (the per-track "$3, no
 *      account" buyer's emailed/redirect link — see src/lib/download-token.ts).
 *   2. The *requesting* user is the track's owner AND an active Pro subscriber.
 *   3. A paid purchase exists for the track AND the requester is the buyer
 *      (authenticated email matches the purchase email).
 *
 * `requesterUserId` is the authenticated viewer's id (or null for anon), and
 * `opts.email`/`opts.token` carry the viewer's email and any download token
 * from the request. Gating the purchase path on token/identity closes the hole
 * where anyone who knew a purchased track's UUID could download it.
 *
 * Back-compat: when no signing secret is configured (DOWNLOAD_TOKEN_SECRET /
 * AUTH_SECRET unset) we can't mint or verify tokens, so a paid purchase alone
 * still grants access rather than locking buyers out.
 *
 * Used by the download route (gate the bytes) and the track detail API (tell
 * the client whether to show Download vs Buy). Single source of truth so the
 * two never drift. Fails closed: any DB error returns false.
 */
export async function checkTrackAccess(
  trackId: string,
  requesterUserId: string | null = null,
  opts: { email?: string | null; token?: string | null } = {},
): Promise<boolean> {
  const { email = null, token = null } = opts;

  // Token path works for anonymous buyers (no DB lookup needed) — check it
  // first so a valid link grants access even if the DB is briefly unavailable.
  if (token && verifyDownloadToken(trackId, token)) return true;

  if (!process.env.DATABASE_URL) return false;
  try {
    const { db, purchases, users, tracks } = await import('@/lib/db');
    const { eq, and } = await import('drizzle-orm');

    // 1. Paid one-time purchase for this track.
    const paid = await db
      .select({ email: purchases.email })
      .from(purchases)
      .where(and(eq(purchases.trackId, trackId), eq(purchases.status, 'paid')))
      .limit(5);
    if (paid.length > 0) {
      // When tokens can't be issued, fall back to the legacy "any paid
      // purchase unlocks the track" behavior so buyers aren't locked out.
      if (!isDownloadTokenConfigured()) return true;
      // Otherwise tie access to the buyer: an authenticated viewer whose email
      // matches the purchase. Anonymous buyers use their signed link (above).
      if (email) {
        const norm = email.trim().toLowerCase();
        if (paid.some((p) => (p.email ?? '').trim().toLowerCase() === norm)) {
          return true;
        }
      }
    }

    // 2. The requesting user owns this track AND is an active Pro subscriber.
    if (!requesterUserId) return false;

    const trackRows = await db
      .select({ userId: tracks.userId })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .limit(1);

    const ownerId = trackRows[0]?.userId;
    if (ownerId && ownerId === requesterUserId) {
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
