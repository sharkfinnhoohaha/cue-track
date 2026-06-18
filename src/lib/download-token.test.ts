import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signDownloadToken, verifyDownloadToken, isDownloadTokenConfigured } from './download-token';

const TRACK = '12345678-1234-1234-1234-123456789012';
const OTHER = '00000000-0000-0000-0000-000000000000';

describe('download-token', () => {
  const original = process.env.DOWNLOAD_TOKEN_SECRET;
  const originalAuth = process.env.AUTH_SECRET;
  const originalNextAuth = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    process.env.DOWNLOAD_TOKEN_SECRET = 'test-secret-value';
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.DOWNLOAD_TOKEN_SECRET;
    else process.env.DOWNLOAD_TOKEN_SECRET = original;
    if (originalAuth === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuth;
    if (originalNextAuth === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = originalNextAuth;
  });

  it('round-trips a freshly signed token', () => {
    const token = signDownloadToken(TRACK, 3600);
    expect(token).toBeTruthy();
    expect(verifyDownloadToken(TRACK, token)).toBe(true);
  });

  it('rejects a token for a different track (binding)', () => {
    const token = signDownloadToken(TRACK, 3600);
    expect(verifyDownloadToken(OTHER, token)).toBe(false);
  });

  it('rejects an expired token', () => {
    const token = signDownloadToken(TRACK, -1); // already expired
    expect(verifyDownloadToken(TRACK, token)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const token = signDownloadToken(TRACK, 3600)!;
    const [exp] = token.split('.');
    expect(verifyDownloadToken(TRACK, `${exp}.deadbeef`)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signDownloadToken(TRACK, 3600);
    process.env.DOWNLOAD_TOKEN_SECRET = 'a-different-secret';
    expect(verifyDownloadToken(TRACK, token)).toBe(false);
  });

  it('falls back to AUTH_SECRET when DOWNLOAD_TOKEN_SECRET is unset', () => {
    delete process.env.DOWNLOAD_TOKEN_SECRET;
    process.env.AUTH_SECRET = 'auth-secret';
    expect(isDownloadTokenConfigured()).toBe(true);
    const token = signDownloadToken(TRACK, 3600);
    expect(verifyDownloadToken(TRACK, token)).toBe(true);
  });

  it('cannot issue or verify without any secret', () => {
    delete process.env.DOWNLOAD_TOKEN_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    expect(isDownloadTokenConfigured()).toBe(false);
    expect(signDownloadToken(TRACK, 3600)).toBeNull();
    expect(verifyDownloadToken(TRACK, 'anything')).toBe(false);
  });

  it('rejects empty/garbage tokens', () => {
    expect(verifyDownloadToken(TRACK, null)).toBe(false);
    expect(verifyDownloadToken(TRACK, '')).toBe(false);
    expect(verifyDownloadToken(TRACK, 'no-dot')).toBe(false);
    expect(verifyDownloadToken(TRACK, '.sig')).toBe(false);
  });
});
