import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET /api/health/worker
// ---------------------------------------------------------------------------
//
// Diagnostic endpoint for the analyze pipeline's worker dependency. Reports
// whether AUDIO_WORKER_URL / ML_WORKER_URL are configured and, when they are,
// whether the worker's /health endpoint is reachable from the deployment.
//
// Analysis does NOT require the worker — runAnalyzeJob falls back to the
// in-process template detector when the worker is unset or unreachable. This
// route exists so misconfigured/unreachable workers can be diagnosed directly
// instead of being inferred from a generic "connection failed" in the UI.

const PING_TIMEOUT_MS = 8_000;

interface WorkerProbe {
  configured: boolean;
  url: string | null;
  secretConfigured: boolean;
  reachable: boolean | null;
  status: number | null;
  detail: string | null;
}

async function probeWorker(
  url: string | undefined,
  secret: string | undefined,
): Promise<WorkerProbe> {
  if (!url) {
    return {
      configured: false,
      url: null,
      secretConfigured: !!secret,
      reachable: null,
      status: null,
      detail: 'URL not set',
    };
  }

  const base = url.replace(/\/+$/, '');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const resp = await fetch(`${base}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    const text = await resp.text().catch(() => '');
    return {
      configured: true,
      url: base,
      secretConfigured: !!secret,
      reachable: resp.ok,
      status: resp.status,
      detail: text.slice(0, 300) || null,
    };
  } catch (err) {
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    return {
      configured: true,
      url: base,
      secretConfigured: !!secret,
      reachable: false,
      status: null,
      detail: isAbort
        ? `No response within ${PING_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  const [audio, ml] = await Promise.all([
    probeWorker(
      process.env.AUDIO_WORKER_URL,
      process.env.AUDIO_WORKER_SHARED_SECRET,
    ),
    probeWorker(process.env.ML_WORKER_URL, process.env.ML_WORKER_SHARED_SECRET),
  ]);

  return NextResponse.json(
    {
      // Uploads work even with no worker: the analyze job falls back to the
      // in-process template detector.
      analyzeAvailable: true,
      inProcessFallback: true,
      audioWorker: audio,
      mlWorker: ml,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
