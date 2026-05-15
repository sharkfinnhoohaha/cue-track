/**
 * Default Open Graph image for Cue Track.
 *
 * Uses Next.js file-based metadata (opengraph-image.tsx) to generate a
 * 1200x630 PNG at build time. Every page inherits this unless it defines
 * its own opengraph-image in its route segment.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */

import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Cue Track: custom click and cue tracks for live musicians';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f7',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: '#1d1d1f',
            letterSpacing: '-0.04em',
            lineHeight: 1,
          }}
        >
          Cue Track
        </div>

        {/* Separator dot */}
        <div
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            backgroundColor: '#6e6e73',
            margin: '24px 0',
          }}
        />

        {/* Tagline */}
        <div
          style={{
            fontSize: 24,
            fontWeight: 400,
            color: '#6e6e73',
            letterSpacing: '0.02em',
          }}
        >
          Your song. Your tempo. Their cue.
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
