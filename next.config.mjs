/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  serverExternalPackages: ['@google-cloud/text-to-speech', 'lamejs'],
};

export default nextConfig;
