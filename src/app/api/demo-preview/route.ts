/**
 * Demo preview API route.
 * Returns a pre-rendered 15-second click/cue track preview for the landing page.
 * Renders on first request, then caches in memory.
 */

import { NextResponse } from 'next/server';
import { buildTimeGrid } from '@/lib/audio/grid';
import { generateClick } from '@/lib/audio/click';
import { mixTrack } from '@/lib/audio/mixer';
import { encodeWav } from '@/lib/audio/encoder';
import type { SongSpec } from '@/types';

// Demo spec: standard worship song structure
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

const SAMPLE_RATE = 44100;
const PREVIEW_SECONDS = 15;

// In-memory cache for the demo preview
let cachedPreview: Buffer | null = null;

/**
 * Simple fallback TTS: generate a tone burst as a cue marker.
 * Used when Google Cloud TTS credentials are not available.
 */
function generateCueTone(text: string): Float32Array {
  const duration = /^[1-9]$/.test(text.trim()) ? 0.1 : 0.2;
  const baseFreq = 330;
  const textHash = Array.from(text).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const freqOffset = (Math.abs(textHash) % 5) * 40;
  const freq = /^[1-9]$/.test(text.trim())
    ? 660 + parseInt(text.trim(), 10) * 55
    : baseFreq + freqOffset;

  const numSamples = Math.round(SAMPLE_RATE * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    buffer[i] = 0.5 * Math.exp(-t / 0.06) * Math.sin(2 * Math.PI * freq * t);
  }
  return buffer;
}

function renderDemoPreview(): Buffer {
  const grid = buildTimeGrid(DEMO_SPEC, SAMPLE_RATE);

  const downbeatClick = generateClick('classic', true, SAMPLE_RATE);
  const regularClick = generateClick('classic', false, SAMPLE_RATE);

  // Generate fallback cue tones for all unique texts
  const cueSamples = new Map<string, Float32Array>();
  for (const cue of grid.cues) {
    if (!cueSamples.has(cue.text)) {
      cueSamples.set(cue.text, generateCueTone(cue.text));
    }
  }

  const stereoBuffer = mixTrack({
    grid,
    clickSamples: { downbeat: downbeatClick, regular: regularClick },
    cueSamples,
    sampleRate: SAMPLE_RATE,
    clickGainDb: 0,
    cueGainDb: -6,
  });

  // Extract preview (first 15 seconds)
  const previewFrames = Math.min(
    Math.round(SAMPLE_RATE * PREVIEW_SECONDS),
    Math.floor(stereoBuffer.length / 2)
  );
  const previewBuffer = new Float32Array(previewFrames * 2);
  for (let i = 0; i < previewFrames * 2; i++) {
    previewBuffer[i] = stereoBuffer[i];
  }

  // Apply 0.5s fade-out
  const fadeOutFrames = Math.round(SAMPLE_RATE * 0.5);
  const fadeStartFrame = previewFrames - fadeOutFrames;
  if (fadeStartFrame > 0) {
    for (let frame = fadeStartFrame; frame < previewFrames; frame++) {
      const gain = 1.0 - (frame - fadeStartFrame) / fadeOutFrames;
      previewBuffer[frame * 2] *= gain;
      previewBuffer[frame * 2 + 1] *= gain;
    }
  }

  return encodeWav(previewBuffer, SAMPLE_RATE, 2);
}

export async function GET() {
  try {
    if (!cachedPreview) {
      cachedPreview = renderDemoPreview();
    }

    return new NextResponse(cachedPreview, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': cachedPreview.length.toString(),
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
