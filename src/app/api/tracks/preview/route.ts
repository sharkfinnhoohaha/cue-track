import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getClientIpHash, checkAndRecordRateLimit } from '@/lib/rate-limit';
import { renderPreviewOnly } from '@/lib/audio/engine';
import type { SongSpec } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Previews render only the opening seconds, so a generous, separate quota
// (the user clicks Preview far more than Generate) keyed under a `preview:`
// identifier so it never eats into the generate rate limit.
const PREVIEW_LIMIT_PER_HOUR = (() => {
  const raw = process.env.PREVIEW_RATE_LIMIT_PER_HOUR;
  const n = raw ? Number(raw) : 60;
  return Number.isFinite(n) && n > 0 ? n : 60;
})();

// Render a little more than the 15s the engine returns so the slice is full.
const PREVIEW_TARGET_SECONDS = 22;

/**
 * Build a truncated spec containing only enough leading bars to fill the
 * preview window. renderPreviewOnly mixes the entire track before slicing the
 * first 15s, so without this an interactive Preview on a 30-minute spec would
 * mix 30 minutes of audio per click. Truncating keeps the work bounded and the
 * count-in + first section announcements — the part worth previewing — intact.
 */
function truncateSpecForPreview(spec: SongSpec): SongSpec {
  const beats = spec.timeSignature.beats;
  const sections: SongSpec['sections'] = [];
  let acc = 0;
  for (const section of spec.sections) {
    if (acc >= PREVIEW_TARGET_SECONDS) break;
    const bpm = section.bpmOverride ?? spec.bpm;
    const secPerBar = beats * (60 / bpm);
    const barsNeeded = Math.max(1, Math.ceil((PREVIEW_TARGET_SECONDS - acc) / secPerBar));
    const bars = Math.min(section.bars, barsNeeded);
    sections.push({ ...section, bars });
    acc += bars * secPerBar;
  }
  if (sections.length === 0 && spec.sections.length > 0) {
    sections.push({ ...spec.sections[0], bars: Math.min(spec.sections[0].bars, 4) });
  }
  // Always encode the preview as WAV: it plays everywhere and skips MP3
  // encoding cost on a latency-sensitive, interactive path.
  return { ...spec, sections, format: 'wav' };
}

function isValidSpec(spec: unknown): spec is SongSpec {
  if (!spec || typeof spec !== 'object') return false;
  const s = spec as Record<string, unknown>;
  const ts = s.timeSignature as Record<string, unknown> | undefined;
  return (
    typeof s.bpm === 'number' &&
    s.bpm >= 30 &&
    s.bpm <= 300 &&
    !!ts &&
    typeof ts.beats === 'number' &&
    ts.beats >= 1 &&
    ts.beats <= 12 &&
    typeof ts.subdivision === 'number' &&
    Array.isArray(s.sections) &&
    s.sections.length > 0 &&
    typeof s.voiceId === 'string' &&
    typeof s.clickSound === 'string'
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  const spec = (body as { spec?: unknown })?.spec ?? body;
  if (!isValidSpec(spec)) {
    return NextResponse.json({ error: 'A valid SongSpec is required' }, { status: 400 });
  }

  // Rate limit under a dedicated `preview:` namespace so Preview clicks don't
  // consume the generate quota.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  let identifier: string;
  let kind: 'auth' | 'anon';
  if (userId) {
    identifier = `preview:user:${userId}`;
    kind = 'auth';
  } else {
    const ipHash = getClientIpHash(request);
    identifier = `preview:ip:${ipHash ?? 'unknown'}`;
    kind = 'anon';
  }
  const rate = await checkAndRecordRateLimit(identifier, kind, PREVIEW_LIMIT_PER_HOUR);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: 'Too many previews',
        details: `Give it a minute and try again (limit ${rate.limit}/hour).`,
        code: 'PREVIEW_RATE_LIMITED',
        retryAfterSeconds: rate.retryAfterSeconds,
      },
      {
        status: 429,
        headers: rate.retryAfterSeconds ? { 'Retry-After': String(rate.retryAfterSeconds) } : undefined,
      },
    );
  }

  try {
    const audio = await renderPreviewOnly(truncateSpecForPreview(spec));
    const out = new Uint8Array(audio.buffer as ArrayBuffer, audio.byteOffset, audio.byteLength);
    return new NextResponse(out, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audio.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[tracks/preview] render failed:', err);
    return NextResponse.json(
      { error: 'Could not render a preview for that setup. Adjust the spec and try again.' },
      { status: 422 },
    );
  }
}
