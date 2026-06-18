import type { MetadataRoute } from 'next';

/**
 * Web app manifest, served at /manifest.webmanifest. Replaces the previously
 * referenced static /site.webmanifest (which did not exist).
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cue Track',
    short_name: 'Cue Track',
    description:
      'Click & cue tracks for live musicians. Upload a song, get a click track with spoken section cues.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f5f7',
    theme_color: '#f5f5f7',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
