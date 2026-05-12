/**
 * Next.js instrumentation hook. Called once per runtime at boot.
 * Wires Sentry for the Node and Edge runtimes. The client SDK loads from
 * sentry.client.config.ts via withSentryConfig in next.config.mjs.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
