import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      '@google-cloud/text-to-speech',
      'lamejs',
      'mpg123-decoder',
      'music-tempo',
      'wavefile',
    ],
  },
};

/** @type {Parameters<typeof withSentryConfig>[1]} */
const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
  // Never let source-map upload break the production build. An invalid/expired
  // SENTRY_AUTH_TOKEN (or a Sentry outage) otherwise hard-fails `next build`
  // with an unhandled "Invalid org token (401)" rejection from sentry-cli —
  // i.e. a telemetry hiccup takes down the deploy. Swallow plugin errors so
  // the worst case is "no source maps this build", not "no deploy".
  errorHandler: (err) => {
    console.warn(
      '[sentry] source-map upload failed; continuing build without it:',
      err?.message ?? err,
    );
  },
  // Skip release creation/finalization during build. `sentry-cli releases new`
  // throws an *unhandled* rejection on a bad/expired token (the errorHandler
  // above does not catch it), so it alone can fail the deploy. Source maps
  // still upload (when the token is valid) without a release association, and a
  // bad token now only triggers the caught, non-fatal upload warning.
  release: {
    create: false,
    finalize: false,
  },
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
