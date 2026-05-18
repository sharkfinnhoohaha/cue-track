import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { getClientIpHash } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET /api/tracks/analyze/jobs/[id] (Phase D async)
// ---------------------------------------------------------------------------
//
// Polled by the upload UI after POST /api/tracks/analyze returns 202.
// Returns the analyze_jobs row state plus, when status='done', the
// result payload (trackId + bpm + suggestedSections) so the client can
// navigate to /tracks/[id]/review.
//
// Auth: identifier (user:id or ip:hash) on the row must match the
// caller's identifier. Anon callers see only jobs they enqueued from
// the same network; auth users see only their own. Anyone hitting a
// jobId they did not create gets 404 (not 403, so we don't leak the
// existence of other users' jobs).

interface JobStatusBody {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  method: 'template' | 'foote' | 'ml';
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: unknown;
  error: string | null;
}

export async function GET(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const { id } = context.params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json(
      { error: 'Missing jobId' },
      { status: 400 },
    );
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  let callerIdentifier: string | null;
  if (userId) {
    callerIdentifier = `user:${userId}`;
  } else {
    const ipHash = getClientIpHash(request);
    callerIdentifier = ipHash ? `ip:${ipHash}` : null;
  }

  if (!callerIdentifier) {
    return NextResponse.json(
      {
        error: 'Cannot determine client identifier',
        details:
          'No session and no forwarded IP header. Sign in to poll job status.',
      },
      { status: 400 },
    );
  }

  const { db, analyzeJobs } = await import('@/lib/db');
  const rows = await db
    .select({
      id: analyzeJobs.id,
      identifier: analyzeJobs.identifier,
      method: analyzeJobs.method,
      status: analyzeJobs.status,
      result: analyzeJobs.result,
      errorText: analyzeJobs.errorText,
      createdAt: analyzeJobs.createdAt,
      startedAt: analyzeJobs.startedAt,
      finishedAt: analyzeJobs.finishedAt,
    })
    .from(analyzeJobs)
    .where(eq(analyzeJobs.id, id))
    .limit(1);

  const job = rows[0];
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (job.identifier !== callerIdentifier) {
    // 404 instead of 403 to avoid leaking job existence across callers.
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const body: JobStatusBody = {
    jobId: job.id,
    status: job.status,
    method: job.method,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    result: job.status === 'done' ? job.result : null,
    error: job.status === 'failed' ? (job.errorText ?? 'Unknown error') : null,
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
