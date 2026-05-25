/**
 * In-process audio analysis for the upload pipeline.
 *
 * Given a raw uploaded audio buffer (MP3 or WAV), produce:
 *   - estimated BPM (via music-tempo's onset + beat-tracking)
 *   - duration in seconds (derived from decoded sample count + rate)
 *   - sampleRate of the decoded PCM
 *   - a suggestedSections template the user can edit before generating
 *
 * This mirrors services/audio-worker/lib/audio/analyze.ts so the analyze
 * pipeline has a worker-free fallback: when AUDIO_WORKER_URL is unset or the
 * Cloud Run worker is unreachable, src/lib/analyze-jobs.ts decodes the blob
 * and runs this directly inside the Vercel function. The section template is
 * a function of duration; the user refines it on /tracks/[id]/review before
 * generating.
 */

import { WaveFile } from 'wavefile';
import { MPEGDecoder } from 'mpg123-decoder';
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

const MP3_MIMES = new Set(['audio/mpeg', 'audio/mp3']);

export function isSupportedMime(mime: string): 'wav' | 'mp3' | null {
  const m = mime.toLowerCase().split(';')[0].trim();
  if (WAV_MIMES.has(m)) return 'wav';
  if (MP3_MIMES.has(m)) return 'mp3';
  return null;
}

export interface DecodedAudio {
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
  const wav = new WaveFile(new Uint8Array(bytes));
  const fmt = wav.fmt as { sampleRate: number; numChannels: number; bitsPerSample: number; audioFormat: number };
  const sampleRate = Number(fmt.sampleRate);
  const numChannels = Number(fmt.numChannels) || 1;
  const bitsPerSample = Number(fmt.bitsPerSample);
  const audioFormat = Number(fmt.audioFormat);

  // 16-bit signed PCM Fast Path
  if (audioFormat === 1 && bitsPerSample === 16 && wav.data && (wav.data as any).samples) {
    const rawSamples = (wav.data as any).samples;
    let buffer = rawSamples.buffer;
    let byteOffset = rawSamples.byteOffset;
    if (byteOffset % 2 !== 0) {
      const copy = new Uint8Array(rawSamples.length);
      copy.set(rawSamples);
      buffer = copy.buffer;
      byteOffset = copy.byteOffset;
    }
    const rawInt16 = new Int16Array(buffer, byteOffset, rawSamples.length / 2);
    const numSamplesPerChannel = Math.floor(rawInt16.length / numChannels);
    const mono = new Float32Array(numSamplesPerChannel);

    if (numChannels === 1) {
      for (let i = 0; i < numSamplesPerChannel; i++) {
        const val = rawInt16[i]!;
        mono[i] = val < 0 ? val / 32768 : val / 32767;
      }
    } else if (numChannels === 2) {
      for (let i = 0; i < numSamplesPerChannel; i++) {
        const val1 = rawInt16[i * 2]!;
        const val2 = rawInt16[i * 2 + 1]!;
        const avg = (val1 + val2) / 2;
        mono[i] = avg < 0 ? avg / 32768 : avg / 32767;
      }
    } else {
      for (let i = 0; i < numSamplesPerChannel; i++) {
        let sum = 0;
        for (let c = 0; c < numChannels; c++) {
          sum += rawInt16[i * numChannels + c]!;
        }
        const avg = sum / numChannels;
        mono[i] = avg < 0 ? avg / 32768 : avg / 32767;
      }
    }
    return { monoSamples: mono, sampleRate, duration: mono.length / sampleRate };
  }

  // 32-bit float PCM Fast Path
  if (audioFormat === 3 && bitsPerSample === 32 && wav.data && (wav.data as any).samples) {
    const rawSamples = (wav.data as any).samples;
    let buffer = rawSamples.buffer;
    let byteOffset = rawSamples.byteOffset;
    if (byteOffset % 4 !== 0) {
      const copy = new Uint8Array(rawSamples.length);
      copy.set(rawSamples);
      buffer = copy.buffer;
      byteOffset = copy.byteOffset;
    }
    const rawFloat32 = new Float32Array(buffer, byteOffset, rawSamples.length / 4);
    const numSamplesPerChannel = Math.floor(rawFloat32.length / numChannels);
    const mono = new Float32Array(numSamplesPerChannel);

    if (numChannels === 1) {
      mono.set(rawFloat32);
    } else if (numChannels === 2) {
      for (let i = 0; i < numSamplesPerChannel; i++) {
        const val1 = rawFloat32[i * 2]!;
        const val2 = rawFloat32[i * 2 + 1]!;
        mono[i] = (val1 + val2) / 2;
      }
    } else {
      for (let i = 0; i < numSamplesPerChannel; i++) {
        let sum = 0;
        for (let c = 0; c < numChannels; c++) {
          sum += rawFloat32[i * numChannels + c]!;
        }
        mono[i] = sum / numChannels;
      }
    }
    return { monoSamples: mono, sampleRate, duration: mono.length / sampleRate };
  }

  // Standard fallback
  wav.toBitDepth('32f');
  const deinterleaved = wav.getSamples(false, Float32Array) as unknown as
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

export async function decodeAudio(
  bytes: Buffer,
  mime: string,
): Promise<DecodedAudio> {
  const kind = isSupportedMime(mime);
  if (kind === 'wav') return decodeWav(bytes);
  if (kind === 'mp3') return decodeMp3(bytes);
  throw new Error(`Unsupported mime type: ${mime}`);
}

const BPM_FLOOR = 60;
const BPM_CEIL = 200;

export function detectBpm(samples: Float32Array, sampleRate: number): number {
  if (samples.length < sampleRate * 2) {
    // Need at least ~2 seconds of audio for meaningful tempo detection.
    return 120;
  }
  // music-tempo's defaults are tuned for 44.1kHz with hopSize=441 (10ms
  // frames). Scale hopSize so frame timing stays at ~10ms for other rates.
  const hopSize = Math.round(sampleRate / 100);
  let raw: number;
  try {
    const mt = new MusicTempo(samples, { hopSize });
    raw = Number(mt.tempo);
  } catch {
    // music-tempo throws "Fail to find IOIs" when the input lacks onsets
    // (drone, sustained chords, near-silence). Fall back to a neutral default.
    return 120;
  }
  if (!Number.isFinite(raw) || raw <= 0) return 120;
  // Octave-correct: nudge into the [BPM_FLOOR, BPM_CEIL] band by doubling /
  // halving. music-tempo occasionally reports half-time or double-time.
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

function makeSectionId(idx: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${idx}`;
}

function suggestSections(durationSec: number, bpm: number): SuggestedSection[] {
  const template = pickTemplate(durationSec);
  // 4/4 assumption: one bar = 4 beats = (4 * 60) / bpm seconds.
  const beatsPerBar = 4;
  const secondsPerBar = (beatsPerBar * 60) / Math.max(bpm, 30);
  const totalBars = Math.max(1, Math.round(durationSec / secondsPerBar));
  const distribution = distributeBars(totalBars, template.names.length);
  return template.names.map((name, idx) => ({
    id: makeSectionId(idx),
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
