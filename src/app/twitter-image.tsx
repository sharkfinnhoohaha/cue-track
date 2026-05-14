/**
 * Default Twitter card image for Cue Track.
 *
 * Identical to the OG image but uses the twitter-image.tsx convention
 * so Twitter/X picks it up via twitter:image meta tag.
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

        <div
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            backgroundColor: '#6e6e73',
            margin: '24px 0',
          }}
        />

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
