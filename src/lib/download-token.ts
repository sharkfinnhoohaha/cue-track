/**
 * Stateless, signed download tokens for single-track ("$3, no account")
 * purchases.
 *
 * The per-track purchase flow has no user account, so the buyer needs a
 * credential that proves they paid without signing in. We mint an HMAC-signed
 * token (bound to the trackId + an expiry) at checkout and email it to the
 * buyer; the download route accepts it. This ties entitlement to the buyer's
 * link instead of granting the file to anyone who happens to know the track
 * UUID.
 *
 * Stateless by design: validation is a pure HMAC check, so no DB table or
 * lookup is needed. The signing secret is DOWNLOAD_TOKEN_SECRET, falling back
 * to the NextAuth secret so a typical deployment needs no extra config.
 */
import { createHmac, timingSafeEqual } from 'crypto';

function getSecret(): string {
  return (
    process.env.DOWNLOAD_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ''
  );
}

/**
 * Whether token issuing/verification is available. When no secret is set we
 * can't sign tokens, so callers fall back to the legacy purchase-based access
 * check rather than locking everyone out.
 */
export function isDownloadTokenConfigured(): boolean {
  return getSecret().length > 0;
}

/** Mint a token for `trackId` that expires `ttlSeconds` from now. */
export function signDownloadToken(trackId: string, ttlSeconds: number): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac('sha256', secret).update(`${trackId}.${exp}`).digest('base64url');
  return `${exp}.${sig}`;
}

/** True when `token` is a valid, unexpired signature for `trackId`. */
export function verifyDownloadToken(trackId: string, token: string | null | undefined): boolean {
  const secret = getSecret();
  if (!secret || !token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = createHmac('sha256', secret).update(`${trackId}.${exp}`).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
