import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { auth } from '@/auth';
import { getClientIpHash } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// POST /api/tracks/analyze/upload
// ---------------------------------------------------------------------------
//
// Vercel Blob client-upload token broker.
//
// Vercel Serverless Functions cap request bodies at 4.5 MB at the edge,
// which would 413 every real-world song upload (10 MB MP3 is easy to hit
// with a 4-minute track at 320 kbps). The fix is to upload files directly
// from the browser to Vercel Blob, then POST the resulting blob URL to
// /api/tracks/analyze. This endpoint mints the upload token after running
// auth/IP-identifier checks; the actual quota + rate-limit gate stays on
// /api/tracks/analyze where the analyze job is enqueued.
//
// The token authorizes uploading at most MAX_UPLOAD_BYTES with one of the
// audio MIME types we forward to the worker. Browser-transcoded WAVs from
// M4A/AAC uploads can grow 5-10x the original, so the limit matches the
// upload-form cap rather than the raw source-file size.

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error: 'Upload storage is not configured',
        details:
          'BLOB_READ_WRITE_TOKEN must be set on the deployment. See README for setup.',
      },
      { status: 503 },
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  let identifier: string;
  if (userId) {
    identifier = `user:${userId}`;
  } else {
    const ipHash = getClientIpHash(request);
    if (!ipHash) {
      return NextResponse.json(
        {
          error: 'Cannot determine client identifier',
          details:
            'No session and no forwarded IP header. Sign in to analyze.',
        },
        { status: 400 },
      );
    }
    identifier = `ip:${ipHash}`;
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ identifier, userId }),
      }),
      onUploadCompleted: async ({ blob }) => {
        // The actual analyze job is kicked off when the client POSTs the
        // blob URL to /api/tracks/analyze. We just log here; runAnalyzeJob
        // is responsible for cleaning up the blob after processing.
        console.log(
          `[analyze/upload] Blob upload completed: ${blob.url} (${blob.pathname})`,
        );
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    console.error('[analyze/upload] handleUpload failed:', err);
    return NextResponse.json(
      {
        error: 'Upload token generation failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 400 },
    );
  }
}
