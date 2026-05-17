/**
 * Audio analysis for the upload pipeline.
 *
 * Given a raw uploaded audio buffer (MP3 or WAV), produce:
 *   - estimated BPM (via music-tempo's onset + beat-tracking)
 *   - duration in seconds (derived from decoded sample count + rate)
 *   - sampleRate of the decoded PCM
 *   - a suggestedSections template the user can edit before generating
 *
 * V1.0 does NOT attempt real section detection. The template is purely
 * a function of duration: bands of (Loop) for short clips, Intro/Verse/
 * Chorus/Outro patterns for longer ones, with equal-bar distribution.
 * Real section detection is Phase D future work.
 */

import wavefile from 'wavefile';
import { MPEGDecoder } from 'mpg123-decoder';
// music-tempo ships as ESM with a default class export but no type defs.
// The constructor is synchronous and returns an instance with `.tempo`.
// @ts-ignore -- no types published for music-tempo
import MusicTempo from 'music-tempo';

export interface SuggestedSection {
  id: string;
  name: string;
  bars: number;
}

export interface AnalyzeResult {
  bpm: number;
  duration: number;
  sampleRate: number;
  suggestedSections: SuggestedSection[];
}

const WAV_MIMES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
]);

const MP3_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
]);

export function isSupportedMime(mime: string): 'wav' | 'mp3' | null {
  const m = mime.toLowerCase().split(';')[0].trim();
  if (WAV_MIMES.has(m)) return 'wav';
  if (MP3_MIMES.has(m)) return 'mp3';
  return null;
}

interface DecodedAudio {
  monoSamples: Float32Array;
  sampleRate: number;
  duration: number;
}

function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = channels[0].length;
  const out = new Float32Array(length);
  const numCh = channels.length;
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < numCh; c++) sum += channels[c][i] ?? 0;
    out[i] = sum / numCh;
  }
  return out;
}

function decodeWav(bytes: Buffer): DecodedAudio {
  // wavefile uses TS namespace export; the runtime export is the namespace
  // object so we access WaveFile through it.
  const wav = new (wavefile as any).WaveFile(new Uint8Array(bytes));
  // Normalize to 32-bit float so getSamples returns values in [-1, 1].
  wav.toBitDepth('32f');
  const sampleRate = Number(wav.fmt.sampleRate);
  const numChannels = Number(wav.fmt.numChannels) || 1;
  // De-interleaved samples come back as Float64Array per channel; cast to
  // Float32Array since music-tempo requires Float32.
  const deinterleaved = wav.getSamples(false, Float32Array) as
    | Float32Array
    | Float32Array[];
  const channels: Float32Array[] = Array.isArray(deinterleaved)
    ? deinterleaved
    : [deinterleaved];
  // Defensive: wavefile sometimes returns a single Float32Array for mono
  // files even when asked for de-interleaved.
  const mono =
    numChannels > 1 && channels.length > 1
      ? downmixToMono(channels)
      : channels[0] ?? new Float32Array(0);
  const duration = mono.length / sampleRate;
  return { monoSamples: mono, sampleRate, duration };
}

async function decodeMp3(bytes: Buffer): Promise<DecodedAudio> {
  const decoder = new MPEGDecoder();
  try {
    await decoder.ready;
    const decoded = decoder.decode(new Uint8Array(bytes));
    const channels = decoded.channelData ?? [];
    const sampleRate = decoded.sampleRate || 44100;
    const mono = downmixToMono(channels);
    const duration = mono.length / sampleRate;
    return { monoSamples: mono, sampleRate, duration };
  } finally {
    decoder.free();
  }
}

async function decodeAudio(bytes: Buffer, mime: string): Promise<DecodedAudio> {
  const kind = isSupportedMime(mime);
  if (kind === 'wav') return decodeWav(bytes);
  if (kind === 'mp3') return decodeMp3(bytes);
  throw new Error(`Unsupported mime type: ${mime}`);
}

const BPM_FLOOR = 60;
const BPM_CEIL = 200;

function detectBpm(samples: Float32Array, sampleRate: number): number {
  if (samples.length < sampleRate * 2) {
    // Need at least ~2 seconds of audio for meaningful tempo detection.
    // Fall back to 120 as a neutral default.
    return 120;
  }
  // music-tempo's defaults are tuned for 44.1kHz with hopSize=441 (10ms
  // frames). If the source sampleRate differs significantly we scale hopSize
  // so frame timing stays at ~10ms; bufferSize stays at 2048 frames.
  const hopSize = Math.round(sampleRate / 100);
  const mt = new MusicTempo(samples, { hopSize });
  const raw = Number(mt.tempo);
  if (!Number.isFinite(raw) || raw <= 0) return 120;
  // Octave-correct: nudge into the [BPM_FLOOR, BPM_CEIL] band by doubling /
  // halving. Music-tempo occasionally reports half-time or double-time.
  let bpm = raw;
  while (bpm < BPM_FLOOR) bpm *= 2;
  while (bpm > BPM_CEIL) bpm /= 2;
  return Math.round(bpm);
}

interface SectionTemplate {
  names: string[];
}

function pickTemplate(durationSec: number): SectionTemplate {
  if (durationSec < 60) return { names: ['Loop'] };
  if (durationSec < 120) return { names: ['Intro', 'Verse', 'Chorus', 'Outro'] };
  if (durationSec < 240) {
    return { names: ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Outro'] };
  }
  return {
    names: ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Outro'],
  };
}

function distributeBars(totalBars: number, sectionCount: number): number[] {
  if (sectionCount <= 0) return [];
  if (totalBars <= sectionCount) {
    // Floor at 1 bar per section even for very short clips.
    return new Array(sectionCount).fill(1);
  }
  const base = Math.floor(totalBars / sectionCount);
  const remainder = totalBars - base * sectionCount;
  const out = new Array(sectionCount).fill(base);
  // Push the remainder onto the final section so timing skews toward the
  // outro rather than an earlier section.
  out[sectionCount - 1] += remainder;
  return out;
}

function suggestSections(durationSec: number, bpm: number): SuggestedSection[] {
  const template = pickTemplate(durationSec);
  // 4/4 assumption: one bar = 4 beats = (4 * 60) / bpm seconds.
  const beatsPerBar = 4;
  const secondsPerBar = (beatsPerBar * 60) / Math.max(bpm, 30);
  const totalBars = Math.max(1, Math.round(durationSec / secondsPerBar));
  const distribution = distributeBars(totalBars, template.names.length);
  return template.names.map((name, idx) => ({
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `s-${Date.now()}-${idx}`,
    name,
    bars: distribution[idx] ?? 1,
  }));
}

export async function analyzeAudio(
  bytes: Buffer,
  mime: string,
): Promise<AnalyzeResult> {
  const decoded = await decodeAudio(bytes, mime);
  const bpm = detectBpm(decoded.monoSamples, decoded.sampleRate);
  const suggestedSections = suggestSections(decoded.duration, bpm);
  return {
    bpm,
    duration: decoded.duration,
    sampleRate: decoded.sampleRate,
    suggestedSections,
  };
}
