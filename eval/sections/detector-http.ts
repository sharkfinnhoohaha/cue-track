/**
 * Score a *deployed* detector (the Foote audio worker or the allin1 ML worker)
 * over HTTP, exactly the way the app calls it: POST the raw audio bytes with an
 * `x-worker-secret` header. The response shape is identical across detectors
 * ({ bpm, duration, suggestedSections }), so the same grader scores all of them.
 *
 * This is the cloud-native path: the measurement is just HTTP calls + grading
 * (pure, runs anywhere — a CI job, a cloud Claude session, your laptop). It
 * needs NO local detector deps and no local model. The only inputs are the
 * audio files and the worker URL+secret.
 */
import { readFileSync } from 'fs';
import { extname } from 'path';
import type { CorpusEntry } from './corpus';
import type { DetectorOutput } from './convert';

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.ogg') return 'audio/ogg';
  return 'application/octet-stream';
}

export interface WorkerOpts {
  url: string;
  path: string;
  secret: string;
  /** parallel in-flight requests; keep modest for Cloud Run cold starts */
  concurrency?: number;
}

/** Resolve a worker's URL/path/secret from a friendly name + env. */
export function resolveWorker(which: 'foote' | 'ml'): WorkerOpts {
  if (which === 'ml') {
    return {
      url: process.env.ML_WORKER_URL ?? '',
      path: '/analyze',
      secret: process.env.ML_WORKER_SHARED_SECRET ?? process.env.WORKER_SHARED_SECRET ?? '',
    };
  }
  return {
    url: process.env.AUDIO_WORKER_URL ?? '',
    path: '/analyze/foote',
    secret: process.env.AUDIO_WORKER_SHARED_SECRET ?? process.env.WORKER_SHARED_SECRET ?? '',
  };
}

export async function runDetectorHttp(
  entries: CorpusEntry[],
  opts: WorkerOpts,
): Promise<Map<string, DetectorOutput>> {
  if (!opts.url) throw new Error('Worker URL is empty — set ML_WORKER_URL / AUDIO_WORKER_URL.');
  const endpoint = `${opts.url.replace(/\/+$/, '')}${opts.path}`;
  const out = new Map<string, DetectorOutput>();
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  let next = 0;
  let done = 0;

  async function pump() {
    while (next < entries.length) {
      const e = entries[next++];
      try {
        const bytes = readFileSync(e.audioPath);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': mimeFor(e.audioPath), 'x-worker-secret': opts.secret },
          body: new Uint8Array(bytes),
        });
        if (!res.ok) {
          console.error(`[detector-http] ${e.id}: worker returned ${res.status}`);
          continue;
        }
        const data = (await res.json()) as DetectorOutput;
        if (typeof data.bpm === 'number' && typeof data.duration === 'number' && Array.isArray(data.suggestedSections)) {
          out.set(e.id, data);
        } else {
          console.error(`[detector-http] ${e.id}: unexpected response shape`);
        }
      } catch (err) {
        console.error(`[detector-http] ${e.id} failed:`, err instanceof Error ? err.message : err);
      } finally {
        if (++done % 10 === 0) console.error(`[detector-http] ${done}/${entries.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => pump()));
  return out;
}
