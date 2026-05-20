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
  workerUrl: string;
  workerSecret: string;
  workerPath: string;
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
  audioBytes: Buffer,
): Promise<WorkerAnalyzeResponse> {
  const base = args.workerUrl.replace(/\/+$/, '');
  const url = `${base}${args.workerPath}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': args.mime,
        'x-worker-secret': args.workerSecret,
      },
      body: new Uint8Array(audioBytes),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const cause = err instanceof Error ? err.message : String(err);
    console.error(`[analyze-jobs] Worker fetch failed (${url}):`, cause);
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new Error(`Worker request timed out after ${WORKER_TIMEOUT_MS}ms`);
    }
    throw new Error(`Worker fetch failed: ${cause}`);
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
    throw new Error(detail);
  }

  const body = (await resp.json()) as WorkerAnalyzeResponse;
  if (
    typeof body.bpm !== 'number' ||
    typeof body.duration !== 'number' ||
    !Array.isArray(body.suggestedSections)
  ) {
    throw new Error('Worker returned malformed payload (missing bpm/duration/sections)');
  }
  return body;
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

  // --- Download blob + call worker + persist track + mark done --------
  try {
    const audioBytes = await downloadBlob(args.blobUrl);
    if (audioBytes.length === 0) {
      throw new Error('Downloaded blob is empty');
    }

    const worker = await callWorker(args, audioBytes);
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
      method: args.method,
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
      `[analyze-jobs] Job ${args.jobId} done: trackId=${trackId} method=${args.method} bpm=${worker.bpm} sections=${worker.suggestedSections.length}`,
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
