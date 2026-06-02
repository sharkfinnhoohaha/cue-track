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
import { canonicalizeAudioMime, inferMimeFromName } from '@/lib/audio/mime';

// waitUntil(runAnalyzeJob) runs the analysis after the 202 response, but its
// wall clock is still bounded by this function's maxDuration. A full song's
// in-process decode + Foote detection, or a Cloud Run worker round trip
// including cold start, routinely exceeds 60s, which killed the background job
// mid-run and stranded the row in 'running' until the client poll gave up.
// 300s is the platform maximum and is matched by the client poll ceiling.
export const maxDuration = 300;
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
function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '').trim() || 'Untitled track';
}

function normalizeMime(mime: string, filename: string): string | null {
  const base = mime.toLowerCase().split(';')[0].trim();
  const canonicalBase = canonicalizeAudioMime(base);
  const extMime = inferMimeFromName(filename);
  const isBlank = base.length === 0;
  if (extMime) {
    if (isBlank || base === 'application/octet-stream') return extMime;
    if (!canonicalBase || canonicalBase !== extMime) return extMime;
    return canonicalBase;
  }
  return canonicalBase;
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
  const ipHash = getClientIpHash(request);
  let rateIdentifier: string;
  let rateKind: 'auth' | 'anon';
  if (userId) {
    rateIdentifier = `user:${userId}`;
    rateKind = 'auth';
  } else {
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
    ? [`user:${userId}`, ...(ipHash ? [`ip:${ipHash}`] : [])]
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
  // The V1 funnel is "1 free analysis, then pay": the paywall is ENFORCED by
  // default. Set ENABLE_ANALYZE_PAYWALL=false to disable it (e.g. a growth
  // period). The quota itself fails open on any DB error (see upload-quota.ts),
  // so a missing upload_analyses table can't lock users out of uploading.
  const tier = await resolveUploadTier(userId);
  const quota = await checkUploadQuota(quotaIdentifiers, tier);
  const paywallEnabled = process.env.ENABLE_ANALYZE_PAYWALL !== 'false';
  if (paywallEnabled && !quota.allowed) {
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
  //
  // The worker is preferred (Foote/ML detectors) but optional: when it is
  // unconfigured, the job runs the in-process template analyzer instead of
  // 503-ing. This keeps uploads working even with AUDIO_WORKER_URL unset,
  // matching how /api/tracks/generate already falls back to in-process
  // rendering. runAnalyzeJob also falls back in-process if a configured
  // worker turns out to be unreachable at run time.
  const requestUrl = new URL(request.url);
  let method = pickMethod({ identifier: rateIdentifier, url: requestUrl });
  let workerCfg = workerForMethod(method);
  if (method === 'ml' && (!workerCfg.url || !workerCfg.secret)) {
    method = 'foote';
    workerCfg = workerForMethod(method);
  }
  if (!workerCfg.url || !workerCfg.secret) {
    // No worker available — analyze in-process with the template detector.
    method = 'template';
    workerCfg = { url: undefined, secret: undefined, path: '' };
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
      workerUrl: workerCfg.url ?? '',
      workerSecret: workerCfg.secret ?? '',
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
