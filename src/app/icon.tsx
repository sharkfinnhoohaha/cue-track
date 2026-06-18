/**
 * Favicon, generated at the edge so no static /public/favicon file is needed.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons
 */
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1d1d1f',
          color: '#f5f5f7',
          fontSize: 22,
          fontWeight: 800,
          borderRadius: 7,
        }}
      >
        C
      </div>
    ),
    { ...size },
  );
}
