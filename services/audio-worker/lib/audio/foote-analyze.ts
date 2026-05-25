/**
 * Foote novelty section detector.
 *
 * Replaces the duration-banded template in analyze.ts with real structural
 * boundaries derived from spectral similarity. Pipeline:
 *
 *   decoded mono PCM
 *     -> tile into non-overlapping ~93ms frames (4096 samples @ 44.1kHz)
 *     -> Hann window, FFT, magnitude spectrum
 *     -> 40-band log-mel projection (timbral fingerprint per frame)
 *     -> N x N self-similarity matrix (cosine similarity)
 *     -> Foote checkerboard kernel convolution along the diagonal
 *     -> novelty curve, adaptive peak picking with min-gap filtering
 *     -> peak times -> section boundaries -> bars-per-section using BPM
 *     -> heuristic labels (Intro/Verse/Chorus/Bridge/Outro)
 *
 * Accuracy: 60-70% on rock/pop in published Foote-novelty literature.
 * Folk and electronic genres degrade. The user reviews and edits on the
 * /tracks/[id]/review screen before generating, so misclassifications
 * are recoverable.
 *
 * Output shape intentionally matches analyzeAudio's AnalyzeResult so the
 * A/B router on the Vercel side can swap detectors without UI changes.
 */

import {
  decodeAudio,
  detectBpm,
  type AnalyzeResult,
  type SuggestedSection,
} from './analyze.ts';

const FRAME_SIZE = 4096;
const HOP_SIZE = 4096;
const MEL_BANDS = 40;
const MEL_FMIN = 80;
const MEL_FMAX_RATIO = 0.5;
const KERNEL_SIZE = 64;
const MIN_PEAK_GAP_SEC = 8;
const PEAK_THRESHOLD_K = 2.5;

// --- FFT ---

/**
 * In-place Cooley-Tukey radix-2 FFT. Length must be a power of 2.
 * Modifies the real and imag arrays.
 */
function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr;
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = -2 * Math.PI / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curR = 1;
      let curI = 0;
      for (let k = 0; k < half; k++) {
        const idx = i + k;
        const jdx = idx + half;
        const tR = curR * real[jdx] - curI * imag[jdx];
        const tI = curR * imag[jdx] + curI * real[jdx];
        real[jdx] = real[idx] - tR;
        imag[jdx] = imag[idx] - tI;
        real[idx] += tR;
        imag[idx] += tI;
        const newR = curR * wReal - curI * wImag;
        curI = curR * wImag + curI * wReal;
        curR = newR;
      }
    }
  }
}

// --- Mel filterbank ---

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

interface MelFilterbank {
  numBands: number;
  numBins: number;
  filters: Float32Array[];
}

function buildMelFilterbank(
  sampleRate: number,
  fftSize: number,
  numBands: number,
  fMin: number,
  fMax: number,
): MelFilterbank {
  const numBins = (fftSize >> 1) + 1;
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMax);
  const melPoints = new Float32Array(numBands + 2);
  for (let i = 0; i < melPoints.length; i++) {
    melPoints[i] = melMin + ((melMax - melMin) * i) / (numBands + 1);
  }
  const hzPoints = melPoints.map(melToHz);
  const binPoints = new Int32Array(numBands + 2);
  for (let i = 0; i < hzPoints.length; i++) {
    binPoints[i] = Math.floor((fftSize + 1) * hzPoints[i] / sampleRate);
  }
  const filters: Float32Array[] = [];
  for (let b = 1; b <= numBands; b++) {
    const filter = new Float32Array(numBins);
    const left = binPoints[b - 1];
    const center = binPoints[b];
    const right = binPoints[b + 1];
    for (let k = left; k < center; k++) {
      if (center === left) continue;
      filter[k] = (k - left) / (center - left);
    }
    for (let k = center; k < right; k++) {
      if (right === center) continue;
      filter[k] = (right - k) / (right - center);
    }
    filters.push(filter);
  }
  return { numBands, numBins, filters };
}

// --- Framing + features ---

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return w;
}

function extractLogMelFrames(
  samples: Float32Array,
  sampleRate: number,
): Float32Array[] {
  const fMax = sampleRate * MEL_FMAX_RATIO;
  const filterbank = buildMelFilterbank(
    sampleRate,
    FRAME_SIZE,
    MEL_BANDS,
    MEL_FMIN,
    fMax,
  );
  const window = hannWindow(FRAME_SIZE);
  const numFrames = Math.max(
    1,
    Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1,
  );
  const frames: Float32Array[] = [];
  const real = new Float32Array(FRAME_SIZE);
  const imag = new Float32Array(FRAME_SIZE);
  const power = new Float32Array(filterbank.numBins);
  for (let f = 0; f < numFrames; f++) {
    const offset = f * HOP_SIZE;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const s = offset + i < samples.length ? samples[offset + i] : 0;
      real[i] = s * window[i];
      imag[i] = 0;
    }
    fft(real, imag);
    for (let k = 0; k < filterbank.numBins; k++) {
      power[k] = real[k] * real[k] + imag[k] * imag[k];
    }
    const logMel = new Float32Array(MEL_BANDS);
    for (let b = 0; b < MEL_BANDS; b++) {
      const filter = filterbank.filters[b];
      let energy = 0;
      for (let k = 0; k < filterbank.numBins; k++) {
        energy += power[k] * filter[k];
      }
      logMel[b] = Math.log(energy + 1e-10);
    }
    frames.push(logMel);
  }
  return frames;
}

// --- SSM + novelty ---

function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function buildSsm(frames: Float32Array[]): Float32Array {
  const n = frames.length;
  const dim = frames[0]?.length ?? 0;
  
  // 1. Pre-normalize frames to unit length so that cosine similarity
  // is simplified to a direct dot product in the inner loop.
  const normFrames = frames.map(f => {
    let sumSq = 0;
    for (let k = 0; k < dim; k++) {
      sumSq += f[k] * f[k];
    }
    const norm = Math.sqrt(sumSq);
    if (norm === 0) return f;
    const normalized = new Float32Array(dim);
    for (let k = 0; k < dim; k++) {
      normalized[k] = f[k] / norm;
    }
    return normalized;
  });

  // 2. Compute dot products
  const ssm = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const fI = normFrames[i]!;
    ssm[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) {
      const fJ = normFrames[j]!;
      let dot = 0;
      for (let k = 0; k < dim; k++) {
        dot += fI[k] * fJ[k];
      }
      ssm[i * n + j] = dot;
      ssm[j * n + i] = dot;
    }
  }
  return ssm;
}

/**
 * Pre-compute a Gaussian-tapered checkerboard kernel: 4 quadrants of
 * size (KERNEL_SIZE/2), with top-left and bottom-right positive,
 * top-right and bottom-left negative. The Gaussian taper de-emphasizes
 * the corners so the kernel is sensitive to changes near the diagonal
 * center, not at its periphery.
 */
function buildCheckerboardKernel(size: number): Float32Array {
  const half = size >> 1;
  const k = new Float32Array(size * size);
  const sigma = size / 4;
  for (let i = 0; i < size; i++) {
    const di = i - half + 0.5;
    for (let j = 0; j < size; j++) {
      const dj = j - half + 0.5;
      // Positive in same-section quadrants (top-left and bottom-right),
      // negative in cross-section quadrants. Boundary frames score high
      // because within-section SSM cells are similar (positive contrib)
      // and cross-section SSM cells are dissimilar (negative * low = ~0).
      const sign = (di < 0 ? -1 : 1) * (dj < 0 ? -1 : 1);
      const g = Math.exp(-(di * di + dj * dj) / (2 * sigma * sigma));
      k[i * size + j] = sign * g;
    }
  }
  return k;
}

function convolveNovelty(ssm: Float32Array, n: number): Float32Array {
  const kernel = buildCheckerboardKernel(KERNEL_SIZE);
  const half = KERNEL_SIZE >> 1;
  const novelty = new Float32Array(n);
  for (let t = half; t < n - half; t++) {
    let sum = 0;
    for (let i = 0; i < KERNEL_SIZE; i++) {
      const row = (t - half + i) * n;
      for (let j = 0; j < KERNEL_SIZE; j++) {
        sum += kernel[i * KERNEL_SIZE + j] * ssm[row + (t - half + j)];
      }
    }
    novelty[t] = sum;
  }
  return novelty;
}

// --- Peak picking ---

function median(arr: Float32Array): number {
  const sorted = Array.from(arr).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function medianAbsDev(arr: Float32Array, med: number): number {
  const deviations = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) deviations[i] = Math.abs(arr[i] - med);
  return median(deviations);
}

interface Peak {
  frameIdx: number;
  timeSec: number;
  value: number;
}

function pickPeaks(
  novelty: Float32Array,
  sampleRate: number,
): Peak[] {
  const med = median(novelty);
  const mad = medianAbsDev(novelty, med);
  const threshold = med + PEAK_THRESHOLD_K * mad;
  const secondsPerFrame = HOP_SIZE / sampleRate;
  const minGapFrames = Math.max(1, Math.round(MIN_PEAK_GAP_SEC / secondsPerFrame));
  const candidates: Peak[] = [];
  for (let i = 1; i < novelty.length - 1; i++) {
    const v = novelty[i];
    if (v <= threshold) continue;
    if (v <= novelty[i - 1] || v <= novelty[i + 1]) continue;
    candidates.push({ frameIdx: i, timeSec: i * secondsPerFrame, value: v });
  }
  candidates.sort((a, b) => b.value - a.value);
  const accepted: Peak[] = [];
  for (const c of candidates) {
    const tooClose = accepted.some(
      (a) => Math.abs(a.frameIdx - c.frameIdx) < minGapFrames,
    );
    if (!tooClose) accepted.push(c);
  }
  accepted.sort((a, b) => a.frameIdx - b.frameIdx);
  return accepted;
}

// --- Labels ---

function labelForPosition(idx: number, total: number): string {
  if (total === 1) return 'Loop';
  if (idx === 0) return 'Intro';
  if (idx === total - 1) return 'Outro';
  if (total >= 6 && idx === total - 2) return 'Bridge';
  return idx % 2 === 1 ? 'Verse' : 'Chorus';
}

function makeSectionId(idx: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${idx}`;
}

function sectionsFromBoundaries(
  boundariesSec: number[],
  durationSec: number,
  bpm: number,
): SuggestedSection[] {
  const beatsPerBar = 4;
  const secondsPerBar = (beatsPerBar * 60) / Math.max(bpm, 30);
  const points = [0, ...boundariesSec, durationSec];
  const sections: SuggestedSection[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const span = points[i + 1] - points[i];
    if (span <= 0) continue;
    const bars = Math.max(1, Math.round(span / secondsPerBar));
    sections.push({
      id: makeSectionId(i),
      name: labelForPosition(i, points.length - 1),
      bars,
    });
  }
  return sections.length > 0
    ? sections
    : [{ id: makeSectionId(0), name: 'Loop', bars: 1 }];
}

// --- Top-level ---

export interface FooteDiagnostics {
  numFrames: number;
  numPeaks: number;
  noveltyMedian: number;
  noveltyMad: number;
  thresholdUsed: number;
  framesPerSecond: number;
  msPerStage: {
    decode: number;
    features: number;
    ssm: number;
    novelty: number;
    peaks: number;
  };
}

export interface FooteResult extends AnalyzeResult {
  diagnostics: FooteDiagnostics;
}

export async function footeAnalyze(
  bytes: Buffer,
  mime: string,
): Promise<FooteResult> {
  const t0 = Date.now();
  const decoded = await decodeAudio(bytes, mime);
  const t1 = Date.now();

  const bpm = detectBpm(decoded.monoSamples, decoded.sampleRate);

  const frames = extractLogMelFrames(decoded.monoSamples, decoded.sampleRate);
  const t2 = Date.now();

  const ssm = buildSsm(frames);
  const t3 = Date.now();

  const novelty = convolveNovelty(ssm, frames.length);
  const t4 = Date.now();

  const peaks = pickPeaks(novelty, decoded.sampleRate);
  const t5 = Date.now();

  const peakTimes = peaks.map((p) => p.timeSec);
  const suggestedSections = sectionsFromBoundaries(
    peakTimes,
    decoded.duration,
    bpm,
  );

  const med = median(novelty);
  const mad = medianAbsDev(novelty, med);

  return {
    bpm,
    duration: decoded.duration,
    sampleRate: decoded.sampleRate,
    suggestedSections,
    diagnostics: {
      numFrames: frames.length,
      numPeaks: peaks.length,
      noveltyMedian: med,
      noveltyMad: mad,
      thresholdUsed: med + PEAK_THRESHOLD_K * mad,
      framesPerSecond: decoded.sampleRate / HOP_SIZE,
      msPerStage: {
        decode: t1 - t0,
        features: t2 - t1,
        ssm: t3 - t2,
        novelty: t4 - t3,
        peaks: t5 - t4,
      },
    },
  };
}

export const __test = {
  fft,
  buildMelFilterbank,
  extractLogMelFrames,
  cosineSim,
  buildSsm,
  buildCheckerboardKernel,
  convolveNovelty,
  pickPeaks,
  sectionsFromBoundaries,
  labelForPosition,
};
