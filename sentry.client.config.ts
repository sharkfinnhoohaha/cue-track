/**
 * Sentry browser SDK init. Loaded by withSentryConfig at build time.
 * No-ops in environments without NEXT_PUBLIC_SENTRY_DSN so local dev and
 * preview deploys without Sentry credentials stay clean.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    debug: false,
  });
}
