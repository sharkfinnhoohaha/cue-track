import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@google-cloud/text-to-speech', 'lamejs'],
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
  // Sentry upload only runs when SENTRY_AUTH_TOKEN is set; otherwise build is unaffected.
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
