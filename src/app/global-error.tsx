'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * App Router top-level error boundary. Captures React render errors to Sentry
 * when SENTRY_DSN is set, and shows a branded recovery screen (with a working
 * "try again" / "go home") instead of Next's bare statusCode-0 error page.
 *
 * Required by @sentry/nextjs 8.x to silence the build-time warning:
 *   "It seems like you don't have a global error handler set up. It is
 *    recommended that you add a global-error.js file with Sentry
 *    instrumentation so that React rendering errors are reported to Sentry."
 *
 * Sentry.init is DSN-gated in sentry.client.config.ts; if no DSN is set,
 * captureException is a silent no-op.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f5f5f7', color: '#1d1d1f', fontFamily: 'Inter, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6e6e73', marginBottom: 16 }}>
            Something went wrong
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 12 }}>
            We hit an unexpected error.
          </h1>
          <p style={{ fontSize: 15, color: '#6e6e73', lineHeight: 1.6, marginBottom: 32 }}>
            The issue has been logged. You can try again, or head back home.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => reset()}
              style={{ borderRadius: 999, background: '#1d1d1f', color: '#fff', border: 'none', padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{ borderRadius: 999, border: '1px solid rgba(0,0,0,0.13)', color: '#1d1d1f', padding: '12px 28px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
