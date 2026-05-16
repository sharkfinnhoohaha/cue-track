'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

/**
 * App Router top-level error boundary. Captures React render errors to Sentry
 * when SENTRY_DSN is set; falls back to Next's default error page UI.
 *
 * Required by @sentry/nextjs 8.x to silence the build-time warning:
 *   "It seems like you don't have a global error handler set up. It is
 *    recommended that you add a global-error.js file with Sentry
 *    instrumentation so that React rendering errors are reported to Sentry."
 *
 * Sentry.init is DSN-gated in sentry.client.config.ts; if no DSN is set,
 * captureException is a silent no-op.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
