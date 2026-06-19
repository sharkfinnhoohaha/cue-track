/**
 * Demo preview API route.
 * Returns a pre-rendered 15-second click/cue track preview for the landing page.
 * Renders on first request, then caches in memory.
 *
 * This goes through the SAME engine as a real user track (`renderPreviewOnly`),
 * so the spoken section cues are produced by real Google Cloud TTS in
 * production — not placeholder tones. Earlier this route synthesized its own
 * sine-wave "beeps" for cues, which made the landing-page demo sound nothing
 * like the actual product. Routing it through the engine keeps the demo honest:
 * what a visitor hears here is exactly what they get.
 */

import { NextResponse } from 'next/server';
import { renderPreviewOnly } from '@/lib/audio/engine';
import type { SongSpec } from '@/types';

// Demo spec: a standard worship-song structure. The 15s preview window
// (taken from the front of the render) covers the count-in, the "Intro"
// announcement, and the "Verse" cue — enough to showcase the voice.
const DEMO_SPEC: SongSpec = {
  title: 'Demo Track',
  bpm: 120,
  timeSignature: { beats: 4, subdivision: 4 },
  sections: [
    { id: '1', name: 'Intro', bars: 4 },
    { id: '2', name: 'Verse', bars: 8 },
    { id: '3', name: 'Chorus', bars: 8 },
    { id: '4', name: 'Bridge', bars: 4 },
    { id: '5', name: 'Outro', bars: 4 },
  ],
  voiceId: 'en-US-Studio-M',
  clickSound: 'classic',
  format: 'wav',
  enableCountIn: true,
  enableSectionAnnounce: true,
  enableBarCountdown: false,
  countInBars: 1,
};

// In-memory cache for the rendered demo preview. `inFlight` coalesces
// concurrent first-hit requests so we render (and pay for TTS) only once.
let cachedPreview: Buffer | null = null;
let inFlight: Promise<Buffer> | null = null;

function getDemoPreview(): Promise<Buffer> {
  if (cachedPreview) return Promise.resolve(cachedPreview);
  if (!inFlight) {
    inFlight = renderPreviewOnly(DEMO_SPEC)
      .then((buf) => {
        cachedPreview = buf;
        return buf;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export async function GET() {
  try {
    const preview = await getDemoPreview();

    // Cast buf.buffer to ArrayBuffer so the Uint8Array generic resolves to
    // Uint8Array<ArrayBuffer> (not Uint8Array<ArrayBufferLike>), which is
    // what BufferSource/BodyInit expects under TS 5.7 + @types/node 22.
    // Node Buffer is always ArrayBuffer-backed at runtime (never
    // SharedArrayBuffer), so the cast is safe. View, no copy.
    const body = new Uint8Array(
      preview.buffer as ArrayBuffer,
      preview.byteOffset,
      preview.byteLength,
    );

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': preview.length.toString(),
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Disposition': 'inline; filename="cue-track-demo.wav"',
      },
    });
  } catch (error) {
    console.error('[Demo Preview] Render error:', error);
    return NextResponse.json(
      { error: 'Failed to generate demo preview' },
      { status: 500 }
    );
  }
}
