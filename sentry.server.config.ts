/**
 * Sentry Node runtime init. Loaded from instrumentation.ts.
 * No-ops without SENTRY_DSN so local dev and preview deploys without Sentry
 * credentials stay clean.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    debug: false,
  });
}
