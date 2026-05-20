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
// POST /api/tracks/analyze (Phase D async)
// ---------------------------------------------------------------------------
//
// Accepts multipart/form-data with a "file" field (MP3 or WAV, <= 50 MB),
// validates the upload + quota, then enqueues an analyze_jobs row and
// returns 202 + { jobId, statusUrl }. The actual worker call runs in
// the background via @vercel/functions waitUntil; the client polls
// GET /api/tracks/analyze/jobs/[id] for { status, result, error }.
//
// When the job completes the worker, the background pipeline inserts a
// draft tracks row (status='rendering', spec derived from worker output)
// and writes its id into analyze_jobs.result.trackId so the client can
// navigate to /tracks/[id]/review.
//
// Method selection: hard-coded to 'template' here in PR-B. PR-D introduces
// the A/B router that picks 'foote' or 'ml' per caller-stable hash.

// 150 MB matches the client cap (see src/components/upload-form.tsx). Browser-
// transcoded WAVs from M4A/AAC uploads can grow 5-10x the original, so the
// limit needs to cover both raw WAV uploads and re-encoded mobile recordings.
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
  if (ACCEPTED_MIMES.has(base)) return base;
  if (/\.mp3$/i.test(filename)) return 'audio/mpeg';
  if (/\.wav$/i.test(filename)) return 'audio/wav';
  return null;
}


export async function POST(request: NextRequest) {
  // --- Parse multipart form ---------------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Invalid multipart body',
        details: err instanceof Error ? err.message : 'Could not parse form',
      },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing file', details: 'Expected a "file" field of type File' },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: 'Empty file', details: 'Uploaded file is 0 bytes' },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: 'File too large',
        details: `Max ${MAX_FILE_BYTES} bytes (${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB). Got ${file.size}.`,
      },
      { status: 413 },
    );
  }

  const mime = normalizeMime(file.type, file.name);
  if (!mime) {
    return NextResponse.json(
      {
        error: 'Unsupported file type',
        details: `Expected MP3 or WAV. Got mime="${file.type}", filename="${file.name}".`,
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
  // If the router picked ML but its env is missing, fall through to Foote.
  // Lets us merge router code before the ML worker exists in prod.
  if (method === 'ml' && (!workerCfg.url || !workerCfg.secret)) {
    method = 'foote';
    workerCfg = workerForMethod(method);
  }
  // Final guard: the Foote/template path must have the Node worker
  // configured. Without it, analyze cannot run at all.
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

  // --- Buffer the upload + enqueue the job ------------------------------
  let audioBytes: ArrayBuffer;
  try {
    audioBytes = await file.arrayBuffer();
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Could not read upload',
        details: err instanceof Error ? err.message : 'Unknown read error',
      },
      { status: 400 },
    );
  }

  const title = stripExtension(file.name);

  const { db, analyzeJobs } = await import('@/lib/db');
  let jobId: string;
  try {
    const rows = await db
      .insert(analyzeJobs)
      .values({
        identifier: rateIdentifier,
        method,
        status: 'queued',
        audioSizeBytes: file.size,
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
      audioBytes: Buffer.from(audioBytes),
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
