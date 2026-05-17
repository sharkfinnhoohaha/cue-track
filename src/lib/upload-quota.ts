/**
 * Upload-analysis quota for /api/tracks/analyze.
 *
 * Implements the V1 funnel rule "anon gets 1 free upload analysis, then
 * paywall". Counts rows in the upload_analyses table for the caller's
 * identifier(s); if the count meets the free cap and the caller is not on
 * a paid plan, the route returns 402.
 *
 * The gate is dormant in production until ENABLE_ANALYZE_PAYWALL=true is
 * set on Vercel; the route still calls into this helper unconditionally
 * (so the recording side stays accurate for analytics) and the route
 * decides whether to enforce based on the flag.
 *
 * Fail-open semantics mirror src/lib/rate-limit.ts: any DB error (including
 * the upload_analyses table not yet existing) returns allowed: true and
 * logs the underlying error. This avoids breaking the route during the
 * window between code deploy and schema migration.
 */

const FREE_UPLOAD_LIMIT = 1;

export type UploadTier = 'free' | 'paid';

export interface UploadQuotaResult {
  allowed: boolean;
  tier: UploadTier;
  /** Number of prior analyses counted across the supplied identifiers. */
  used: number;
  /** Cap for the caller's tier. `null` for paid (effectively unlimited). */
  limit: number | null;
}

/**
 * Resolve whether the caller has paid access. Today this means an active
 * Pro subscription on the users table; per-track-purchase access is per
 * specific track and does not blanket-unlock further uploads, so it is
 * intentionally excluded here.
 */
export async function resolveUploadTier(
  userId: string | null,
): Promise<UploadTier> {
  if (!userId) return 'free';
  try {
    const { db, users } = await import('@/lib/db');
    const { eq } = await import('drizzle-orm');
    const rows = await db
      .select({ subscriptionStatus: users.subscriptionStatus })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const status = rows[0]?.subscriptionStatus;
    return status === 'active' || status === 'past_due' ? 'paid' : 'free';
  } catch (err) {
    console.error('[upload-quota] subscription lookup failed:', err);
    // Conservative: a DB hiccup should not silently unlock the paid tier.
    return 'free';
  }
}

/**
 * Check the caller's upload-analysis count against their tier cap. Pass
 * one or more identifiers (e.g. both `user:<id>` and `ip:<hash>` for auth
 * callers, so a sign-up does not silently reset the free cap when the user
 * stays on the same network).
 */
export async function checkUploadQuota(
  identifiers: string[],
  tier: UploadTier,
): Promise<UploadQuotaResult> {
  if (tier === 'paid') {
    return { allowed: true, tier, used: 0, limit: null };
  }
  if (identifiers.length === 0) {
    return { allowed: true, tier, used: 0, limit: FREE_UPLOAD_LIMIT };
  }
  try {
    const { db, uploadAnalyses } = await import('@/lib/db');
    const { inArray } = await import('drizzle-orm');
    const rows = await db
      .select({ id: uploadAnalyses.id })
      .from(uploadAnalyses)
      .where(inArray(uploadAnalyses.identifier, identifiers));
    const used = rows.length;
    return {
      allowed: used < FREE_UPLOAD_LIMIT,
      tier,
      used,
      limit: FREE_UPLOAD_LIMIT,
    };
  } catch (err) {
    console.error('[upload-quota] check failed, failing open:', err);
    return { allowed: true, tier, used: 0, limit: FREE_UPLOAD_LIMIT };
  }
}

/**
 * Record a successful analysis. Called by the route AFTER the worker
 * returns 200 and the draft track has been persisted, so failed analyses
 * do not consume the user's free use. Best-effort: a DB error here is
 * logged but does not fail the route.
 */
export async function recordUploadAnalysis(
  identifier: string,
  trackId: string | null,
): Promise<void> {
  try {
    const { db, uploadAnalyses } = await import('@/lib/db');
    await db.insert(uploadAnalyses).values({
      identifier,
      trackId: trackId ?? undefined,
    });
  } catch (err) {
    console.error('[upload-quota] record failed:', err);
  }
}
