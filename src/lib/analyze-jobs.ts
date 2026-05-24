/**
 * Background runner for /api/tracks/analyze jobs.
 *
 * Invoked via @vercel/functions waitUntil from the POST route. Walks a
 * single analyze_jobs row through queued -> running -> done|failed,
 * downloading the audio from Vercel Blob, forwarding to the audio worker,
 * and persisting the resulting draft tracks row when the worker returns.
 *
 * Idempotency: if the same jobId is processed twice (e.g. retry on
 * function restart) the row state machine prevents double-processing —
 * the second run sees status != 'queued' and exits.
 *
 * Blob lifecycle: the client uploads the source audio directly to Vercel
 * Blob before calling the analyze enqueue route. The runner downloads the
 * blob bytes, forwards them to the audio worker, and deletes the blob on
 * completion (success or failure) so the bucket does not accumulate
 * stale uploads.
 */

import { eq, and } from 'drizzle-orm';
import { del } from '@vercel/blob';
import { db, analyzeJobs, tracks } from '@/lib/db';
import type { AnalyzeJobResult } from '@/lib/db/schema';
import { recordUploadAnalysis } from '@/lib/upload-quota';
import { analyzeAudio } from '@/lib/audio/analyze';
import type { SongSpec } from '@/types';

export type AnalyzeMethod = 'template' | 'foote' | 'ml';

interface RunArgs {
  jobId: string;
  blobUrl: string;
  mime: string;
  title: string;
  method: AnalyzeMethod;
  identifier: string;
  userId: string | null;
  // Empty when no Cloud Run worker is configured — the runner then analyzes
  // in-process instead of calling out.
  workerUrl: string;
  workerSecret: string;
  workerPath: string;
}

/**
 * Worker failure that is NOT the user's fault — network/DNS/timeout, a 5xx,
 * or an auth/secret mismatch. These are recoverable by analyzing in-process,
 * so the runner falls back rather than failing the job. A bad-file error
 * (decode failure, 415, malformed) is a plain Error and fails the job, since
 * the in-process decoder would reject the same bytes.
 */
class WorkerInfraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerInfraError';
  }
}

interface WorkerAnalyzeResponse {
  bpm: number;
  duration: number;
  sampleRate: number;
  suggestedSections: Array<{ id: string; name: string; bars: number }>;
}

const WORKER_TIMEOUT_MS = 90_000;
const BLOB_FETCH_TIMEOUT_MS = 60_000;

function buildSpec(title: string, worker: WorkerAnalyzeResponse): SongSpec {
  return {
    title,
    bpm: worker.bpm,
    timeSignature: { beats: 4, subdivision: 4 },
    sections: worker.suggestedSections,
    voiceId: 'en-US-Standard-D',
    clickSound: 'classic',
    format: 'wav',
    enableCountIn: true,
    enableSectionAnnounce: true,
    enableBarCountdown: true,
    countInBars: 1,
  };
}

async function downloadBlob(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BLOB_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`Blob download failed (${resp.status})`);
    }
    const ab = await resp.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new Error(`Blob download timed out after ${BLOB_FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callWorker(
  args: RunArgs,
  audioBytes?: Buffer,
): Promise<WorkerAnalyzeResponse> {
  const base = args.workerUrl.replace(/\/+$/, '');
  const url = `${base}${args.workerPath}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  let resp: Response;

  const isJson = !audioBytes;
  const body = isJson
    ? JSON.stringify({ blobUrl: args.blobUrl, mime: args.mime })
    : new Uint8Array(audioBytes);

  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': isJson ? 'application/json' : args.mime,
        'x-worker-secret': args.workerSecret,
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const cause = err instanceof Error ? err.message : String(err);
    console.error(`[analyze-jobs] Worker fetch failed (${url}):`, cause);
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new WorkerInfraError(`Worker request timed out after ${WORKER_TIMEOUT_MS}ms`);
    }
    throw new WorkerInfraError(`Worker fetch failed: ${cause}`);
  }
  clearTimeout(timeoutId);

  if (!resp.ok) {
    const raw = await resp.text().catch(() => '');
    let detail = `Worker returned ${resp.status}`;
    if (raw) {
      try {
        const body = JSON.parse(raw) as { detail?: string; error?: string };
        if (typeof body?.detail === 'string') detail = body.detail;
        else if (typeof body?.error === 'string') detail = body.error;
      } catch {
        // Non-JSON body (Cloud Run / ingress HTML error page) — keep the
        // status-only summary but log the raw payload for diagnostics.
      }
    }
    console.error(
      `[analyze-jobs] Worker ${resp.status} from ${url}; body=${raw.slice(0, 500)}`,
    );
    // 5xx, 401/403 (secret mismatch), and 502 blob-fetch failures are infra
    // problems the in-process analyzer can recover from. A 4xx that reflects
    // the file itself (415 unsupported, 422 decode) must fail the job.
    const recoverable =
      resp.status >= 500 || resp.status === 401 || resp.status === 403;
    throw recoverable ? new WorkerInfraError(detail) : new Error(detail);
  }

  const bodyRes = (await resp.json()) as WorkerAnalyzeResponse;
  if (
    typeof bodyRes.bpm !== 'number' ||
    typeof bodyRes.duration !== 'number' ||
    !Array.isArray(bodyRes.suggestedSections)
  ) {
    throw new Error('Worker returned malformed payload (missing bpm/duration/sections)');
  }
  return bodyRes;
}

async function deleteBlobSafely(url: string, jobId: string): Promise<void> {
  try {
    await del(url);
  } catch (err) {
    // Logged but non-fatal: blobs without a cleanup get caught by the
    // Vercel Blob retention policy / a future cleanup cron.
    console.warn(`[analyze-jobs] Blob cleanup failed for ${jobId} (${url}):`, err);
  }
}

/**
 * Worker-free analysis: download the blob and run the BPM + section detector
 * inside the Vercel function. Used when no Cloud Run worker is configured, or
 * as a fallback when a configured worker is unreachable.
 */
async function analyzeInProcess(args: RunArgs): Promise<WorkerAnalyzeResponse> {
  const bytes = await downloadBlob(args.blobUrl);
  const result = await analyzeAudio(bytes, args.mime);
  return {
    bpm: result.bpm,
    duration: result.duration,
    sampleRate: result.sampleRate,
    suggestedSections: result.suggestedSections,
  };
}

interface AnalysisOutcome {
  worker: WorkerAnalyzeResponse;
  method: AnalyzeMethod;
}

/**
 * Produce the analysis, preferring a healthy Cloud Run worker and falling
 * back to in-process analysis when the worker is unconfigured or unreachable.
 * The returned method reflects what actually ran (in-process is 'template').
 */
async function resolveAnalysis(args: RunArgs): Promise<AnalysisOutcome> {
  const workerConfigured = !!args.workerUrl && !!args.workerSecret;
  if (!workerConfigured) {
    return { worker: await analyzeInProcess(args), method: 'template' };
  }
  try {
    return { worker: await callWorker(args), method: args.method };
  } catch (err) {
    if (err instanceof WorkerInfraError) {
      console.warn(
        `[analyze-jobs] Worker unavailable for ${args.jobId} (${err.message}); falling back to in-process analysis`,
      );
      return { worker: await analyzeInProcess(args), method: 'template' };
    }
    throw err;
  }
}

export async function runAnalyzeJob(args: RunArgs): Promise<void> {
  // --- Claim the job (transition queued -> running) -------------------
  const claimed = await db
    .update(analyzeJobs)
    .set({ status: 'running', startedAt: new Date() })
    .where(and(eq(analyzeJobs.id, args.jobId), eq(analyzeJobs.status, 'queued')))
    .returning({ id: analyzeJobs.id });

  if (claimed.length === 0) {
    console.warn(`[analyze-jobs] Job ${args.jobId} not in queued state; skipping`);
    return;
  }

  // --- Analyze (worker or in-process) + persist track + mark done -----
  try {
    const { worker, method } = await resolveAnalysis(args);
    const spec = buildSpec(args.title, worker);
    const durationSec = Math.max(1, Math.round(worker.duration));

    const trackRows = await db
      .insert(tracks)
      .values({
        title: args.title,
        spec,
        status: 'rendering',
        previewUrl: null,
        fullUrl: null,
        duration: durationSec,
        userId: args.userId ?? undefined,
      })
      .returning({ id: tracks.id });

    const trackId = trackRows[0]?.id;
    if (!trackId) {
      throw new Error('Track insert returned no rows');
    }

    const result: AnalyzeJobResult = {
      trackId,
      bpm: worker.bpm,
      duration: worker.duration,
      sampleRate: worker.sampleRate,
      suggestedSections: worker.suggestedSections,
      method,
    };

    await db
      .update(analyzeJobs)
      .set({
        status: 'done',
        result,
        trackId,
        finishedAt: new Date(),
      })
      .where(eq(analyzeJobs.id, args.jobId));

    try {
      await recordUploadAnalysis(args.identifier, trackId);
    } catch (err) {
      console.error(`[analyze-jobs] recordUploadAnalysis failed for ${trackId}:`, err);
    }

    console.log(
      `[analyze-jobs] Job ${args.jobId} done: trackId=${trackId} method=${method} bpm=${worker.bpm} sections=${worker.suggestedSections.length}`,
    );
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    console.error(`[analyze-jobs] Job ${args.jobId} failed:`, err);
    try {
      await db
        .update(analyzeJobs)
        .set({
          status: 'failed',
          errorText,
          finishedAt: new Date(),
        })
        .where(eq(analyzeJobs.id, args.jobId));
    } catch (updateErr) {
      console.error(`[analyze-jobs] Could not mark job ${args.jobId} failed:`, updateErr);
    }
  } finally {
    await deleteBlobSafely(args.blobUrl, args.jobId);
  }
}
