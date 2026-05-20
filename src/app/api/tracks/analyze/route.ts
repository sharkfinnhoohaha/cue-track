import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { auth } from '@/auth';
import { checkAndRecordRateLimit, getClientIpHash } from '@/lib/rate-limit';
import {
  checkUploadQuota,
  resolveUploadTier,
} from '@/lib/upload-quota';
import { runAnalyzeJob } from '@/lib/analyze-jobs';
import { pickMethod, workerForMethod } from '@/lib/analyze-router';

export const maxDuration = 60;
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// POST /api/tracks/analyze (Phase D async, blob-uploaded)
// ---------------------------------------------------------------------------
//
// Accepts JSON with the URL of a previously-uploaded Vercel Blob and the
// file's metadata. The client first uploads the audio file directly to
// Vercel Blob via /api/tracks/analyze/upload (handleUpload token broker)
// and posts the resulting URL here. This bypasses Vercel's 4.5 MB
// serverless-function request-body limit, which used to 413 any real-world
// song upload.
//
// On accept, validates the upload + quota, enqueues an analyze_jobs row,
// and returns 202 + { jobId, statusUrl }. The actual worker call runs in
// the background via @vercel/functions waitUntil. The runner downloads
// the blob, forwards to the audio worker, persists a draft tracks row,
// and deletes the blob. The client polls GET /api/tracks/analyze/jobs/[id]
// for { status, result, error }.

interface AnalyzeRequestBody {
  blobUrl?: string;
  contentType?: string;
  filename?: string;
  size?: number;
}

const MAX_FILE_BYTES = 150 * 1024 * 1024;
const ACCEPTED_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
]);

function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '').trim() || 'Untitled track';
}

function normalizeMime(mime: string, filename: string): string | null {
  const base = mime.toLowerCase().split(';')[0].trim();
  const extMime = /\.mp3$/i.test(filename)
    ? 'audio/mpeg'
    : /\.wav$/i.test(filename)
      ? 'audio/wav'
      : null;
  if (extMime) {
    if (!base || base === 'application/octet-stream') return extMime;
    if (ACCEPTED_MIMES.has(base) && base !== extMime) return extMime;
  }
  if (ACCEPTED_MIMES.has(base)) return base;
  return extMime;
}

function isAllowedBlobUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  // Vercel Blob URLs live on *.public.blob.vercel-storage.com (and the
  // legacy *.blob.vercel-storage.com host). Reject everything else so the
  // server-side fetch can't be tricked into pulling arbitrary URLs.
  return /\.blob\.vercel-storage\.com$/.test(parsed.hostname);
}

export async function POST(request: NextRequest) {
  // --- Parse JSON body --------------------------------------------------
  let body: AnalyzeRequestBody;
  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Invalid JSON body',
        details: err instanceof Error ? err.message : 'Could not parse body',
      },
      { status: 400 },
    );
  }

  const blobUrl = body.blobUrl?.trim();
  const filename = body.filename?.trim() ?? '';
  const contentType = body.contentType?.trim() ?? '';
  const size = typeof body.size === 'number' ? body.size : NaN;

  if (!blobUrl || !isAllowedBlobUrl(blobUrl)) {
    return NextResponse.json(
      {
        error: 'Missing or invalid blobUrl',
        details: 'Upload the audio via /api/tracks/analyze/upload first.',
      },
      { status: 400 },
    );
  }

  if (!filename) {
    return NextResponse.json(
      { error: 'Missing filename' },
      { status: 400 },
    );
  }

  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json(
      { error: 'Missing or invalid size' },
      { status: 400 },
    );
  }

  if (size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: 'File too large',
        details: `Max ${MAX_FILE_BYTES} bytes (${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB). Got ${size}.`,
      },
      { status: 413 },
    );
  }

  const mime = normalizeMime(contentType, filename);
  if (!mime) {
    return NextResponse.json(
      {
        error: 'Unsupported file type',
        details: `Expected MP3 or WAV. Got mime="${contentType}", filename="${filename}".`,
      },
      { status: 415 },
    );
  }

  // --- Identify caller --------------------------------------------------
  const session = await auth();
  const userId = session?.user?.id ?? null;
  let rateIdentifier: string;
  let rateKind: 'auth' | 'anon';
  if (userId) {
    rateIdentifier = `user:${userId}`;
    rateKind = 'auth';
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
    rateIdentifier = `ip:${ipHash}`;
    rateKind = 'anon';
  }

  const quotaIdentifiers = userId
    ? [`user:${userId}`, ...(getClientIpHash(request) ? [`ip:${getClientIpHash(request)}`] : [])]
    : [rateIdentifier];

  // --- Rate limit (shared with /generate quota) -------------------------
  const rate = await checkAndRecordRateLimit(rateIdentifier, rateKind);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        details:
          rateKind === 'auth'
            ? `You have submitted ${rate.current} requests in the last hour (limit ${rate.limit}). Try again in about ${Math.ceil((rate.retryAfterSeconds ?? 60) / 60)} minute(s).`
            : `This network has submitted ${rate.current} requests in the last hour (limit ${rate.limit}). Sign in for a higher cap, or try again in about ${Math.ceil((rate.retryAfterSeconds ?? 60) / 60)} minute(s).`,
        code: 'RATE_LIMITED',
        retryAfterSeconds: rate.retryAfterSeconds,
        authBoost: rateKind === 'anon',
      },
      {
        status: 429,
        headers: rate.retryAfterSeconds
          ? { 'Retry-After': String(rate.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  // --- Upload quota gate (Phase C) -------------------------------------
  const tier = await resolveUploadTier(userId);
  const quota = await checkUploadQuota(quotaIdentifiers, tier);
  if (
    process.env.ENABLE_ANALYZE_PAYWALL === 'true' &&
    !quota.allowed
  ) {
    return NextResponse.json(
      {
        error: 'Upload quota exceeded',
        code: 'UPLOAD_QUOTA_EXCEEDED',
        requiredTier: 'paid',
        details: {
          used: quota.used,
          limit: quota.limit,
          documentation: '/pricing',
        },
      },
      { status: 402 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        error: 'Server not configured',
        details: 'DATABASE_URL is required.',
      },
      { status: 500 },
    );
  }

  // --- Pick detector via A/B router + resolve worker URL/secret ---------
  const requestUrl = new URL(request.url);
  let method = pickMethod({ identifier: rateIdentifier, url: requestUrl });
  let workerCfg = workerForMethod(method);
  if (method === 'ml' && (!workerCfg.url || !workerCfg.secret)) {
    method = 'foote';
    workerCfg = workerForMethod(method);
  }
  if (!workerCfg.url || !workerCfg.secret) {
    return NextResponse.json(
      {
        error: 'Audio analysis is not configured',
        details:
          'AUDIO_WORKER_URL and AUDIO_WORKER_SHARED_SECRET must be set.',
      },
      { status: 503 },
    );
  }

  const title = stripExtension(filename);

  const { db, analyzeJobs } = await import('@/lib/db');
  let jobId: string;
  try {
    const rows = await db
      .insert(analyzeJobs)
      .values({
        identifier: rateIdentifier,
        method,
        status: 'queued',
        audioSizeBytes: size,
        mime,
        title,
      })
      .returning({ id: analyzeJobs.id });
    if (!rows[0]) {
      return NextResponse.json(
        {
          error: 'Job persistence failed',
          details: 'Insert returned no rows',
        },
        { status: 500 },
      );
    }
    jobId = rows[0].id;
  } catch (err) {
    console.error('[tracks/analyze] Job enqueue failed:', err);
    return NextResponse.json(
      {
        error: 'Job persistence failed',
        details: err instanceof Error ? err.message : 'Unknown DB error',
      },
      { status: 500 },
    );
  }

  // --- Kick off the background analysis ---------------------------------
  waitUntil(
    runAnalyzeJob({
      jobId,
      blobUrl,
      mime,
      title,
      method,
      identifier: rateIdentifier,
      userId,
      workerUrl: workerCfg.url,
      workerSecret: workerCfg.secret,
      workerPath: workerCfg.path,
    }),
  );

  return NextResponse.json(
    {
      jobId,
      status: 'queued',
      statusUrl: `/api/tracks/analyze/jobs/${jobId}`,
    },
    { status: 202 },
  );
}
