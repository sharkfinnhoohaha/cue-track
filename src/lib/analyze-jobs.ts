/**
 * Background runner for /api/tracks/analyze jobs.
 *
 * Invoked via @vercel/functions waitUntil from the POST route. Walks a
 * single analyze_jobs row through queued -> running -> done|failed,
 * forwarding the audio to the audio worker and persisting the resulting
 * draft tracks row when the worker returns.
 *
 * Idempotency: if the same jobId is processed twice (e.g. retry on
 * function restart) the row state machine prevents double-processing —
 * the second run sees status != 'queued' and exits.
 *
 * The audio bytes are passed in via closure rather than reread from
 * Postgres or GCS. Keeps PR-B contained to one moving part; if we later
 * want to retry failed jobs from a worker drain, we will need to persist
 * the audio externally.
 */

import { eq, and } from 'drizzle-orm';
import { db, analyzeJobs, tracks } from '@/lib/db';
import type { AnalyzeJobResult } from '@/lib/db/schema';
import { recordUploadAnalysis } from '@/lib/upload-quota';
import type { SongSpec } from '@/types';

export type AnalyzeMethod = 'template' | 'foote' | 'ml';

interface RunArgs {
  jobId: string;
  audioBytes: Buffer;
  mime: string;
  title: string;
  method: AnalyzeMethod;
  identifier: string;
  userId: string | null;
  workerUrl: string;
  workerSecret: string;
}

interface WorkerAnalyzeResponse {
  bpm: number;
  duration: number;
  sampleRate: number;
  suggestedSections: Array<{ id: string; name: string; bars: number }>;
}

const WORKER_TIMEOUT_MS = 90_000;

function workerPathForMethod(method: AnalyzeMethod): string {
  switch (method) {
    case 'template':
      return '/analyze';
    case 'foote':
      return '/analyze/foote';
    case 'ml':
      return '/analyze';
  }
}

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

async function callWorker(
  args: RunArgs,
): Promise<WorkerAnalyzeResponse> {
  const path = workerPathForMethod(args.method);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(`${args.workerUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': args.mime,
        'x-worker-secret': args.workerSecret,
      },
      body: new Uint8Array(args.audioBytes),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    let detail = `Worker returned ${resp.status}`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch {
      // ignore body parse errors
    }
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

  // --- Call worker + persist track + mark done ------------------------
  try {
    const worker = await callWorker(args);
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

    // Best-effort quota accounting. Don't fail the job if this errors.
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
  }
}
