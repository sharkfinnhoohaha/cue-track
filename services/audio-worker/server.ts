/**
 * Cue Track audio worker.
 *
 * A standalone HTTP service that wraps the audio engine for deployment to
 * Google Cloud Run. The Next.js app calls this service when AUDIO_WORKER_URL
 * is configured; otherwise it runs the engine in-process.
 *
 * Endpoints:
 *   POST /render          Render a track. Returns base64 audio.
 *   POST /render-to-gcs   Render a track and upload directly to GCS. Returns paths.
 *   GET  /health          Health check.
 *
 * Auth: shared secret in X-Worker-Secret header. Set WORKER_SHARED_SECRET in env.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { renderTrack } from './lib/audio/engine.ts';
import type { SongSpec } from './lib/audio/types.ts';
import {
  analyzeAudio,
  isSupportedMime,
  type AnalyzeResult,
} from './lib/audio/analyze.ts';
import {
  footeAnalyze,
  type FooteResult,
} from './lib/audio/foote-analyze.ts';

const PORT = Number(process.env.PORT) || 8080;
const SHARED_SECRET = process.env.WORKER_SHARED_SECRET;
const GCS_BUCKET = process.env.GCS_BUCKET_NAME;

if (!SHARED_SECRET) {
  console.warn('[audio-worker] WORKER_SHARED_SECRET not set. All requests will be rejected.');
}

interface RenderRequest {
  trackId: string;
  spec: SongSpec;
}

interface RenderResponse {
  trackId: string;
  duration: number;
  format: 'wav' | 'mp3';
  fullTrackBase64: string;
  previewBase64: string;
}

interface RenderToGcsResponse {
  trackId: string;
  duration: number;
  format: 'wav' | 'mp3';
  fullPath: string;
  previewPath: string;
  fullSizeBytes: number;
  previewSizeBytes: number;
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody<T>(req: IncomingMessage, maxBytes = 1_000_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`Request body exceeds ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(JSON.parse(raw) as T);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const MAX_AUDIO_BYTES = 160 * 1024 * 1024;

async function readRawBody(
  req: IncomingMessage,
  maxBytes = MAX_AUDIO_BYTES,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`Request body exceeds ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Drain a fetch Response body into a Buffer, aborting once it exceeds
 * maxBytes. Mirrors readRawBody's cap for the blob-download path so an
 * oversized blob can't buffer unbounded and OOM the worker.
 */
async function readResponseBodyCapped(
  response: Response,
  maxBytes = MAX_AUDIO_BYTES,
): Promise<Buffer> {
  if (!response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`Blob exceeds ${maxBytes} bytes`);
    }
    return buf;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Blob exceeds ${maxBytes} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks);
}

function authorized(req: IncomingMessage): boolean {
  if (!SHARED_SECRET) return false;
  const provided = req.headers['x-worker-secret'];
  return typeof provided === 'string' && provided === SHARED_SECRET;
}

function validateSpec(spec: unknown): SongSpec {
  if (!spec || typeof spec !== 'object') {
    throw new Error('spec must be an object');
  }
  const s = spec as SongSpec;
  if (typeof s.bpm !== 'number' || s.bpm < 30 || s.bpm > 300) {
    throw new Error('bpm must be a number between 30 and 300');
  }
  if (!s.timeSignature || typeof s.timeSignature.beats !== 'number') {
    throw new Error('timeSignature.beats is required');
  }
  if (!Array.isArray(s.sections) || s.sections.length === 0) {
    throw new Error('sections must be a non-empty array');
  }
  if (!['classic', 'woodblock', 'rimshot', 'hi-hat'].includes(s.clickSound)) {
    throw new Error('clickSound must be one of: classic, woodblock, rimshot, hi-hat');
  }
  if (!['wav', 'mp3'].includes(s.format)) {
    throw new Error('format must be wav or mp3');
  }
  return s;
}

async function handleRender(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorized(req)) {
    return jsonResponse(res, 401, { error: 'unauthorized' });
  }

  let body: RenderRequest;
  try {
    body = await readJsonBody<RenderRequest>(req);
  } catch (err) {
    return jsonResponse(res, 400, { error: `Invalid request body: ${(err as Error).message}` });
  }

  let spec: SongSpec;
  try {
    spec = validateSpec(body.spec);
  } catch (err) {
    return jsonResponse(res, 400, { error: (err as Error).message });
  }

  const trackId = body.trackId || `track-${Date.now()}`;
  const startTime = Date.now();

  try {
    const result = await renderTrack(spec);
    const elapsedMs = Date.now() - startTime;
    console.log(
      `[audio-worker] Rendered ${trackId} in ${elapsedMs}ms, ` +
      `duration=${result.duration.toFixed(1)}s, format=${result.format}, ` +
      `fullSize=${result.fullTrack.length}, previewSize=${result.preview.length}`
    );

    const response: RenderResponse = {
      trackId,
      duration: result.duration,
      format: result.format,
      fullTrackBase64: result.fullTrack.toString('base64'),
      previewBase64: result.preview.toString('base64'),
    };
    return jsonResponse(res, 200, response);
  } catch (err) {
    console.error(`[audio-worker] Render failed for ${trackId}:`, err);
    return jsonResponse(res, 500, {
      error: 'render_failed',
      detail: (err as Error).message,
    });
  }
}

async function handleRenderToGcs(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorized(req)) {
    return jsonResponse(res, 401, { error: 'unauthorized' });
  }

  if (!GCS_BUCKET) {
    return jsonResponse(res, 500, { error: 'GCS_BUCKET_NAME not configured' });
  }

  let body: RenderRequest;
  try {
    body = await readJsonBody<RenderRequest>(req);
  } catch (err) {
    return jsonResponse(res, 400, { error: `Invalid request body: ${(err as Error).message}` });
  }

  let spec: SongSpec;
  try {
    spec = validateSpec(body.spec);
  } catch (err) {
    return jsonResponse(res, 400, { error: (err as Error).message });
  }

  const trackId = body.trackId || `track-${Date.now()}`;
  const startTime = Date.now();

  try {
    const result = await renderTrack(spec);
    const renderMs = Date.now() - startTime;

    // Dynamic import to avoid bundling the GCS client when not needed
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage();
    const bucket = storage.bucket(GCS_BUCKET);

    const ext = result.format === 'mp3' ? 'mp3' : 'wav';
    const contentType = result.format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
    const fullPath = `tracks/${trackId}/full.${ext}`;
    const previewPath = `tracks/${trackId}/preview.${ext}`;

    await Promise.all([
      bucket.file(fullPath).save(result.fullTrack, {
        metadata: { contentType, cacheControl: 'private, max-age=3600' },
        resumable: false,
      }),
      bucket.file(previewPath).save(result.preview, {
        metadata: { contentType, cacheControl: 'public, max-age=86400' },
        resumable: false,
      }),
    ]);

    const totalMs = Date.now() - startTime;
    console.log(
      `[audio-worker] Rendered+uploaded ${trackId}: render=${renderMs}ms, ` +
      `total=${totalMs}ms, gcsBucket=${GCS_BUCKET}`
    );

    const response: RenderToGcsResponse = {
      trackId,
      duration: result.duration,
      format: result.format,
      fullPath,
      previewPath,
      fullSizeBytes: result.fullTrack.length,
      previewSizeBytes: result.preview.length,
    };
    return jsonResponse(res, 200, response);
  } catch (err) {
    console.error(`[audio-worker] Render-to-GCS failed for ${trackId}:`, err);
    return jsonResponse(res, 500, {
      error: 'render_failed',
      detail: (err as Error).message,
    });
  }
}

async function resolveAudioPayload(
  req: IncomingMessage,
  res: ServerResponse,
  contentType: string,
): Promise<{ body: Buffer; activeMime: string; kind: string } | null> {
  const isJson = contentType.toLowerCase().includes('application/json');

  if (isJson) {
    let jsonBody: { blobUrl?: string; mime?: string };
    try {
      jsonBody = await readJsonBody<{ blobUrl?: string; mime?: string }>(req);
    } catch (err) {
      jsonResponse(res, 400, { error: `Invalid JSON body: ${(err as Error).message}` });
      return null;
    }

    const { blobUrl, mime } = jsonBody;
    if (!blobUrl || !mime) {
      jsonResponse(res, 400, { error: 'Missing blobUrl or mime in JSON body' });
      return null;
    }

    const kind = isSupportedMime(mime);
    if (!kind) {
      jsonResponse(res, 415, {
        error: 'unsupported_media_type',
        detail: `Expected audio/mpeg or audio/wav, got: ${mime || '(none)'}`,
      });
      return null;
    }

    try {
      console.log(`[audio-worker] Downloading blob from URL: ${blobUrl}`);
      const fetchRes = await fetch(blobUrl);
      if (!fetchRes.ok) {
        jsonResponse(res, 502, { error: `Failed to download blob: ${fetchRes.statusText} (${fetchRes.status})` });
        return null;
      }
      let body: Buffer;
      try {
        body = await readResponseBodyCapped(fetchRes);
      } catch (capErr) {
        jsonResponse(res, 413, { error: (capErr as Error).message });
        return null;
      }
      if (body.length === 0) {
        jsonResponse(res, 400, { error: 'empty_body' });
        return null;
      }
      return { body, activeMime: mime, kind };
    } catch (err) {
      jsonResponse(res, 502, { error: `Failed to fetch blob URL: ${(err as Error).message}` });
      return null;
    }
  } else {
    const kind = isSupportedMime(contentType);
    if (!kind) {
      jsonResponse(res, 415, {
        error: 'unsupported_media_type',
        detail: `Expected audio/mpeg or audio/wav, got: ${contentType || '(none)'}`,
      });
      return null;
    }

    let body: Buffer;
    try {
      body = await readRawBody(req);
    } catch (err) {
      jsonResponse(res, 413, {
        error: 'payload_too_large',
        detail: (err as Error).message,
      });
      return null;
    }

    return { body, activeMime: contentType, kind };
  }
}

async function handleAnalyze(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorized(req)) {
    return jsonResponse(res, 401, { error: 'unauthorized' });
  }

  const contentTypeHeader = req.headers['content-type'];
  const mime =
    typeof contentTypeHeader === 'string'
      ? contentTypeHeader
      : Array.isArray(contentTypeHeader)
      ? contentTypeHeader[0]
      : '';

  const payload = await resolveAudioPayload(req, res, mime);
  if (!payload) return;

  const { body, activeMime, kind } = payload;

  if (body.length === 0) {
    return jsonResponse(res, 400, { error: 'empty_body' });
  }

  const startTime = Date.now();
  let result: AnalyzeResult;
  try {
    result = await analyzeAudio(body, activeMime);
  } catch (err) {
    console.error('[audio-worker] Analyze failed:', err);
    return jsonResponse(res, 422, {
      error: 'decode_failed',
      detail: (err as Error).message,
    });
  }

  const elapsedMs = Date.now() - startTime;
  console.log(
    `[audio-worker] Analyzed ${body.length} bytes (${kind}) in ${elapsedMs}ms: ` +
    `bpm=${result.bpm}, duration=${result.duration.toFixed(1)}s, ` +
    `sections=${result.suggestedSections.length}`,
  );

  return jsonResponse(res, 200, result);
}

async function handleAnalyzeFoote(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorized(req)) {
    return jsonResponse(res, 401, { error: 'unauthorized' });
  }

  const contentTypeHeader = req.headers['content-type'];
  const mime =
    typeof contentTypeHeader === 'string'
      ? contentTypeHeader
      : Array.isArray(contentTypeHeader)
      ? contentTypeHeader[0]
      : '';

  const payload = await resolveAudioPayload(req, res, mime);
  if (!payload) return;

  const { body, activeMime, kind } = payload;

  if (body.length === 0) {
    return jsonResponse(res, 400, { error: 'empty_body' });
  }

  const startTime = Date.now();
  let result: FooteResult;
  try {
    result = await footeAnalyze(body, activeMime);
  } catch (err) {
    console.error('[audio-worker] Foote analyze failed:', err);
    return jsonResponse(res, 422, {
      error: 'decode_failed',
      detail: (err as Error).message,
    });
  }

  const elapsedMs = Date.now() - startTime;
  console.log(
    `[audio-worker] Foote-analyzed ${body.length} bytes (${kind}) in ${elapsedMs}ms: ` +
    `bpm=${result.bpm}, duration=${result.duration.toFixed(1)}s, ` +
    `sections=${result.suggestedSections.length}, frames=${result.diagnostics.numFrames}, ` +
    `peaks=${result.diagnostics.numPeaks}`,
  );

  return jsonResponse(res, 200, result);
}

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  jsonResponse(res, 200, {
    status: 'ok',
    service: 'cuetrack-audio-worker',
    uptime: process.uptime(),
    nodeVersion: process.version,
    bucket: GCS_BUCKET ?? null,
    secretConfigured: !!SHARED_SECRET,
  });
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // CORS for development; restrict origins in production via Cloud Run config
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Worker-Secret',
    });
    res.end();
    return;
  }

  try {
    if (method === 'GET' && url === '/health') {
      return handleHealth(req, res);
    }
    if (method === 'POST' && url === '/render') {
      return await handleRender(req, res);
    }
    if (method === 'POST' && url === '/render-to-gcs') {
      return await handleRenderToGcs(req, res);
    }
    if (method === 'POST' && url === '/analyze') {
      return await handleAnalyze(req, res);
    }
    if (method === 'POST' && url === '/analyze/foote') {
      return await handleAnalyzeFoote(req, res);
    }
    return jsonResponse(res, 404, { error: 'not_found', path: url });
  } catch (err) {
    console.error('[audio-worker] Unhandled error:', err);
    return jsonResponse(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, () => {
  console.log(`[audio-worker] Listening on port ${PORT}`);
  console.log(
    `[audio-worker] Endpoints: POST /render, POST /render-to-gcs, POST /analyze, POST /analyze/foote, GET /health`,
  );
  console.log(`[audio-worker] GCS bucket: ${GCS_BUCKET ?? '(not configured)'}`);
});

// Graceful shutdown for Cloud Run
process.on('SIGTERM', () => {
  console.log('[audio-worker] SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});
