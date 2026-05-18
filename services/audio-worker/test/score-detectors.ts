/**
 * Detector scorecard: runs each section detector against a battery of
 * test cases with known ground-truth boundaries and reports precision,
 * recall, and F1 at a configurable tolerance.
 *
 * V1 ships with 5 synthesized cases (multi-timbre WAV with known
 * boundaries at known times). To extend with real songs, pass
 * --cases <path/to/cases.json> where cases.json is:
 *
 *   [
 *     { "name": "<label>", "audioPath": "/abs/path/to/song.wav",
 *       "mime": "audio/wav", "trueBoundariesSec": [12.5, 47.3, 88.0] }
 *   ]
 *
 * Detectors compared:
 *   - "template": the legacy duration-banded suggester (analyze.ts)
 *   - "foote":    the Phase D Foote novelty detector (foote-analyze.ts)
 *
 * Score: at tolerance ±T seconds, a detected boundary "matches" a true
 * boundary if |detected - true| <= T. Precision = matched / detected,
 * Recall = matched / true. F1 = 2PR/(P+R).
 *
 * Run:
 *   npx tsx scripts/score-detectors.ts                 # default: synth cases, ±3s
 *   npx tsx scripts/score-detectors.ts --tolerance 5   # custom tolerance
 *   npx tsx scripts/score-detectors.ts --cases real.json
 */

import { readFileSync } from 'node:fs';
import { analyzeAudio } from '../lib/audio/analyze.ts';
import {
  footeAnalyze,
  type FooteResult,
} from '../lib/audio/foote-analyze.ts';
import type {
  AnalyzeResult,
  SuggestedSection,
} from '../lib/audio/analyze.ts';

const SAMPLE_RATE = 44100;

interface TestCase {
  name: string;
  bytes: Buffer;
  mime: string;
  trueBoundariesSec: number[];
  trueDurationSec: number;
}

interface DetectorResult {
  detectedBoundariesSec: number[];
  detectedSectionCount: number;
  durationSec: number;
  bpm: number;
}

type Detector = (bytes: Buffer, mime: string) => Promise<DetectorResult>;

// --- Helpers ---

function reconstructBoundaries(sections: SuggestedSection[], bpm: number): number[] {
  const secondsPerBar = (4 * 60) / Math.max(bpm, 30);
  const out: number[] = [];
  let cursor = 0;
  for (let i = 0; i < sections.length - 1; i++) {
    cursor += sections[i].bars * secondsPerBar;
    out.push(cursor);
  }
  return out;
}

const templateDetector: Detector = async (bytes, mime) => {
  const result: AnalyzeResult = await analyzeAudio(bytes, mime);
  return {
    detectedBoundariesSec: reconstructBoundaries(result.suggestedSections, result.bpm),
    detectedSectionCount: result.suggestedSections.length,
    durationSec: result.duration,
    bpm: result.bpm,
  };
};

const footeDetector: Detector = async (bytes, mime) => {
  const result: FooteResult = await footeAnalyze(bytes, mime);
  return {
    detectedBoundariesSec: reconstructBoundaries(result.suggestedSections, result.bpm),
    detectedSectionCount: result.suggestedSections.length,
    durationSec: result.duration,
    bpm: result.bpm,
  };
};

// --- Scoring ---

interface CaseScore {
  caseName: string;
  detectorName: string;
  detectedCount: number;
  trueCount: number;
  matched: number;
  precision: number;
  recall: number;
  f1: number;
}

function scoreCase(
  trueBoundaries: number[],
  detectedBoundaries: number[],
  toleranceSec: number,
): { matched: number; precision: number; recall: number; f1: number } {
  const usedTrue = new Set<number>();
  let matched = 0;
  for (const d of detectedBoundaries) {
    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < trueBoundaries.length; i++) {
      if (usedTrue.has(i)) continue;
      const delta = Math.abs(d - trueBoundaries[i]);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestDelta <= toleranceSec) {
      usedTrue.add(bestIdx);
      matched++;
    }
  }
  const precision = detectedBoundaries.length > 0 ? matched / detectedBoundaries.length : 0;
  const recall = trueBoundaries.length > 0 ? matched / trueBoundaries.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { matched, precision, recall, f1 };
}

// --- Synthesis (for default cases) ---

function sineSeg(freqHz: number, durationSec: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  const omega = 2 * Math.PI * freqHz;
  for (let i = 0; i < n; i++) out[i] = 0.4 * Math.sin((omega * i) / sampleRate);
  return out;
}

function noiseSeg(durationSec: number, seed: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  let state = seed >>> 0;
  for (let i = 0; i < n; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[i] = (state / 0xffffffff) * 0.6 - 0.3;
  }
  return out;
}

function squareSeg(freqHz: number, durationSec: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  const period = sampleRate / freqHz;
  for (let i = 0; i < n; i++) out[i] = (i % period) < period / 2 ? 0.4 : -0.4;
  return out;
}

function concat(...segments: Float32Array[]): Float32Array {
  const total = segments.reduce((s, seg) => s + seg.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const seg of segments) {
    out.set(seg, off);
    off += seg.length;
  }
  return out;
}

function toWavBuffer(samples: Float32Array): Buffer {
  // 44-byte WAV header (RIFF + fmt + data) for 32-bit float, mono, SAMPLE_RATE.
  // wavefile (used by the worker decoder) accepts format=3 IEEE float fine.
  const numChannels = 1;
  const bitsPerSample = 32;
  const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataBytes = samples.length * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);              // PCM chunk size
  buf.writeUInt16LE(3, 20);               // format = 3 (IEEE float)
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeFloatLE(samples[i], 44 + i * 4);
  }
  return buf;
}

function buildSynthCases(): TestCase[] {
  return [
    {
      name: '30s 3-timbre (sine/noise/sine)',
      bytes: toWavBuffer(concat(sineSeg(440, 10), noiseSeg(10, 42), sineSeg(220, 10))),
      mime: 'audio/wav',
      trueBoundariesSec: [10, 20],
      trueDurationSec: 30,
    },
    {
      name: '60s 4-timbre (sine/noise/square/sine)',
      bytes: toWavBuffer(
        concat(sineSeg(440, 15), noiseSeg(15, 99), squareSeg(330, 15), sineSeg(220, 15)),
      ),
      mime: 'audio/wav',
      trueBoundariesSec: [15, 30, 45],
      trueDurationSec: 60,
    },
    {
      name: '45s 3-sine harder case (440/660/220Hz)',
      bytes: toWavBuffer(concat(sineSeg(440, 15), sineSeg(660, 15), sineSeg(220, 15))),
      mime: 'audio/wav',
      trueBoundariesSec: [15, 30],
      trueDurationSec: 45,
    },
    {
      name: '90s 5-section varied timbres',
      bytes: toWavBuffer(
        concat(
          sineSeg(440, 15),
          noiseSeg(15, 7),
          squareSeg(220, 20),
          sineSeg(880, 20),
          noiseSeg(20, 13),
        ),
      ),
      mime: 'audio/wav',
      trueBoundariesSec: [15, 30, 50, 70],
      trueDurationSec: 90,
    },
    {
      name: '20s 1-timbre (no boundary expected)',
      bytes: toWavBuffer(sineSeg(440, 20)),
      mime: 'audio/wav',
      trueBoundariesSec: [],
      trueDurationSec: 20,
    },
  ];
}

interface ExternalCase {
  name: string;
  audioPath: string;
  mime: string;
  trueBoundariesSec: number[];
}

function loadExternalCases(path: string): TestCase[] {
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as ExternalCase[];
  return raw.map((c) => {
    const bytes = readFileSync(c.audioPath);
    return {
      name: c.name,
      bytes,
      mime: c.mime,
      trueBoundariesSec: c.trueBoundariesSec,
      trueDurationSec: 0,
    };
  });
}

// --- Runner ---

function parseArgs(): { tolerance: number; casesPath?: string } {
  let tolerance = 3;
  let casesPath: string | undefined;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--tolerance') tolerance = Number(process.argv[++i]);
    else if (arg === '--cases') casesPath = process.argv[++i];
  }
  return { tolerance, casesPath };
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals).padStart(6, ' ');
}

async function run(): Promise<void> {
  const { tolerance, casesPath } = parseArgs();
  const cases = casesPath ? loadExternalCases(casesPath) : buildSynthCases();
  const detectors: { name: string; fn: Detector }[] = [
    { name: 'template', fn: templateDetector },
    { name: 'foote', fn: footeDetector },
  ];

  console.log(`\n=== Section detector scorecard ===`);
  console.log(`Tolerance: ±${tolerance}s`);
  console.log(`Cases: ${cases.length} (${casesPath ? `from ${casesPath}` : 'synthesized'})\n`);

  const allScores: CaseScore[] = [];

  for (const tc of cases) {
    console.log(`\n[case] ${tc.name}`);
    console.log(`  true boundaries: ${tc.trueBoundariesSec.map((t) => t.toFixed(1)).join(', ') || '(none)'}`);
    for (const det of detectors) {
      const start = Date.now();
      let result: DetectorResult;
      try {
        result = await det.fn(tc.bytes, tc.mime);
      } catch (err) {
        console.log(`  ${det.name.padEnd(10)} ERROR: ${(err as Error).message}`);
        continue;
      }
      const elapsedMs = Date.now() - start;
      const score = scoreCase(tc.trueBoundariesSec, result.detectedBoundariesSec, tolerance);
      allScores.push({
        caseName: tc.name,
        detectorName: det.name,
        detectedCount: result.detectedSectionCount,
        trueCount: tc.trueBoundariesSec.length + 1,
        matched: score.matched,
        precision: score.precision,
        recall: score.recall,
        f1: score.f1,
      });
      console.log(
        `  ${det.name.padEnd(10)} sections=${result.detectedSectionCount}, ` +
        `boundaries=[${result.detectedBoundariesSec.map((t) => t.toFixed(1)).join(', ')}], ` +
        `P=${fmt(score.precision)} R=${fmt(score.recall)} F1=${fmt(score.f1)} (${elapsedMs}ms)`,
      );
    }
  }

  console.log(`\n=== Aggregated ===`);
  console.log(`| Detector   | Cases | Avg P  | Avg R  | Avg F1 |`);
  console.log(`|------------|-------|--------|--------|--------|`);
  for (const det of detectors) {
    const detScores = allScores.filter((s) => s.detectorName === det.name);
    if (detScores.length === 0) continue;
    const avgP = detScores.reduce((s, x) => s + x.precision, 0) / detScores.length;
    const avgR = detScores.reduce((s, x) => s + x.recall, 0) / detScores.length;
    const avgF1 = detScores.reduce((s, x) => s + x.f1, 0) / detScores.length;
    console.log(
      `| ${det.name.padEnd(10)} | ${String(detScores.length).padStart(5)} | ${fmt(avgP)} | ${fmt(avgR)} | ${fmt(avgF1)} |`,
    );
  }
  console.log('');
}

run().catch((err) => {
  console.error('Scorecard run failed:', err);
  process.exit(1);
});
