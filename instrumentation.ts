/**
 * Next.js instrumentation hook. Called once per runtime at boot.
 * Wires Sentry for the Node and Edge runtimes. The client SDK loads from
 * sentry.client.config.ts via withSentryConfig in next.config.mjs.
 *
 * onRequestError captures errors thrown in Server Components, Route Handlers,
 * and middleware. Pairs with src/app/global-error.tsx which covers
 * client-render errors. Both are DSN-gated, silent no-ops without SENTRY_DSN.
 */

import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
