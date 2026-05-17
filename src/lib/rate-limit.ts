/**
 * Rate limiting for /api/tracks/generate.
 *
 * Tracks attempts in the rate_limits table (see scripts/migrations/) keyed by
 * an identifier string:
 *   "user:<userId>"   for authenticated requests
 *   "ip:<hexsha256>"  for anonymous requests
 *
 * Limits are per-hour rolling window, separate quotas for authenticated and
 * anonymous traffic. Auth users get the higher cap because the identifier is
 * tied to an account; anonymous users get the lower cap because IP is the
 * only signal and IP rotation defeats the limiter trivially.
 *
 * Fail-open semantics: any DB error (including the rate_limits table not
 * existing yet) returns allowed: true and logs the underlying error so the
 * route is not broken by the order of deploys vs migration.
 */

import { createHash } from 'node:crypto';
import { and, eq, gte, asc } from 'drizzle-orm';

const DEFAULT_IP_SALT = 'cuetrack-default-salt-change-via-env';

/**
 * Extract a stable client-IP hash from the request. Uses the first entry in
 * x-forwarded-for (Vercel and most reverse proxies set this), falling back
 * to x-real-ip. Returns null when neither header is present.
 *
 * The IP is salted with RATE_LIMIT_IP_SALT before hashing so the table never
 * contains raw IPs and so two deploys with different salts produce different
 * identifiers (intentional: prevents cross-deploy quota poisoning).
 */
export function getClientIpHash(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const firstFromXff = xff?.split(',')[0]?.trim();
  const ip = firstFromXff || realIp || null;
  if (!ip) return null;
  const salt = process.env.RATE_LIMIT_IP_SALT || DEFAULT_IP_SALT;
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

export type RateLimitKind = 'auth' | 'anon';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  current: number;
  /** Seconds until the oldest in-window row expires; null when allowed. */
  retryAfterSeconds: number | null;
}

function getLimitFor(kind: RateLimitKind): number {
  const raw =
    kind === 'auth'
      ? process.env.GENERATE_RATE_LIMIT_AUTH_PER_HOUR
      : process.env.GENERATE_RATE_LIMIT_ANON_PER_HOUR;
  const defaultLimit = kind === 'auth' ? 50 : 5;
  const parsed = raw ? Number(raw) : defaultLimit;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultLimit;
}

/**
 * Check the identifier's recent attempts and, if within limit, record a new
 * attempt. Returns RateLimitResult describing the outcome.
 *
 * On DB error (including the rate_limits table not yet existing), logs the
 * error and returns allowed: true (fail open). This means the route stays
 * functional even if the migration has not been applied.
 */
export async function checkAndRecordRateLimit(
  identifier: string,
  kind: RateLimitKind,
): Promise<RateLimitResult> {
  const limit = getLimitFor(kind);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  try {
    const { db, rateLimits } = await import('@/lib/db');

    const recentRows = await db
      .select({ createdAt: rateLimits.createdAt })
      .from(rateLimits)
      .where(
        and(
          eq(rateLimits.identifier, identifier),
          gte(rateLimits.createdAt, oneHourAgo),
        ),
      )
      .orderBy(asc(rateLimits.createdAt));

    const current = recentRows.length;

    if (current >= limit) {
      const oldestAt = recentRows[0]?.createdAt;
      const retryAfterSeconds = oldestAt
        ? Math.max(
            1,
            Math.ceil(
              (oldestAt.getTime() + 60 * 60 * 1000 - Date.now()) / 1000,
            ),
          )
        : 60;
      return { allowed: false, limit, current, retryAfterSeconds };
    }

    await db.insert(rateLimits).values({ identifier });
    return {
      allowed: true,
      limit,
      current: current + 1,
      retryAfterSeconds: null,
    };
  } catch (err) {
    console.error('[rate-limit] check failed, failing open:', err);
    return { allowed: true, limit, current: 0, retryAfterSeconds: null };
  }
}
