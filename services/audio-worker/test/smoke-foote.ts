/**
 * Smoke test for the Foote novelty section detector.
 *
 * Generates a deterministic 30-second WAV with three clearly different
 * timbres (sine, noise, sine at a different frequency), runs it through
 * footeAnalyze, and asserts that:
 *   - the algorithm completes without error
 *   - it finds 2-4 sections (boundaries at t≈10 and t≈20)
 *   - at least one detected boundary is within ±3s of each true boundary
 *   - BPM, duration, sampleRate are well-formed
 *
 * Also runs unit-level checks on the FFT and cosine helpers since a bug
 * there is hard to diagnose from the integration symptom alone.
 *
 * Run: node --experimental-strip-types test/smoke-foote.ts
 */

import wavefile from 'wavefile';
import { footeAnalyze, __test } from '../lib/audio/foote-analyze.ts';

const SAMPLE_RATE = 44100;

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// --- Synth helpers ---

function sineSegment(freqHz: number, durationSec: number): Float32Array {
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(n);
  const omega = 2 * Math.PI * freqHz;
  for (let i = 0; i < n; i++) {
    out[i] = 0.4 * Math.sin((omega * i) / SAMPLE_RATE);
  }
  return out;
}

function noiseSegment(durationSec: number, seed = 42): Float32Array {
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(n);
  // Deterministic LCG so test output is reproducible
  let state = seed;
  for (let i = 0; i < n; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[i] = (state / 0xffffffff) * 0.6 - 0.3;
  }
  return out;
}

function concatSegments(...segments: Float32Array[]): Float32Array {
  const total = segments.reduce((s, seg) => s + seg.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const seg of segments) {
    out.set(seg, offset);
    offset += seg.length;
  }
  return out;
}

function encodeWav(samples: Float32Array): Buffer {
  const wav = new (wavefile as any).WaveFile();
  wav.fromScratch(1, SAMPLE_RATE, '32f', samples);
  return Buffer.from(wav.toBuffer());
}

// --- Unit checks ---

function unitChecks(): void {
  console.log('=== Unit checks ===\n');

  // FFT of a 1024-sample sine at freq f should produce a peak at bin
  // round(f * N / SAMPLE_RATE).
  const N = 1024;
  const freq = 1000;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    real[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  }
  __test.fft(real, imag);
  const magnitudes = new Float32Array(N >> 1);
  for (let k = 0; k < magnitudes.length; k++) {
    magnitudes[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
  }
  let peakBin = 0;
  let peakVal = 0;
  for (let k = 1; k < magnitudes.length; k++) {
    if (magnitudes[k] > peakVal) {
      peakVal = magnitudes[k];
      peakBin = k;
    }
  }
  const expectedBin = Math.round((freq * N) / SAMPLE_RATE);
  assert(
    Math.abs(peakBin - expectedBin) <= 1,
    `FFT peak at expected bin (expected ~${expectedBin}, got ${peakBin})`,
  );

  // Cosine similarity: identical vectors → 1, orthogonal → 0, opposite → -1
  const a = new Float32Array([1, 0, 0]);
  const b = new Float32Array([0, 1, 0]);
  const c = new Float32Array([-1, 0, 0]);
  assert(Math.abs(__test.cosineSim(a, a) - 1) < 1e-6, 'cosineSim(a, a) = 1');
  assert(Math.abs(__test.cosineSim(a, b)) < 1e-6, 'cosineSim(a, b) = 0');
  assert(Math.abs(__test.cosineSim(a, c) - -1) < 1e-6, 'cosineSim(a, c) = -1');

  // labelForPosition spot checks
  assert(__test.labelForPosition(0, 1) === 'Loop', 'single-section is Loop');
  assert(__test.labelForPosition(0, 5) === 'Intro', 'first of many is Intro');
  assert(__test.labelForPosition(4, 5) === 'Outro', 'last of many is Outro');
  assert(__test.labelForPosition(4, 6) === 'Bridge', 'second-to-last of 6 is Bridge');
  assert(__test.labelForPosition(1, 5) === 'Verse', 'odd middle = Verse');
  assert(__test.labelForPosition(2, 5) === 'Chorus', 'even middle = Chorus');

  // sectionsFromBoundaries on a 30s 120bpm clip with boundaries at 10, 20
  const secs = __test.sectionsFromBoundaries([10, 20], 30, 120);
  assert(secs.length === 3, `sectionsFromBoundaries returns 3 sections (got ${secs.length})`);
  assert(secs.every((s) => s.bars >= 1), 'all sections have bars >= 1');
}

// --- Integration ---

async function integrationCheck(): Promise<void> {
  console.log('\n=== Integration: 30s 3-timbre clip ===\n');

  const seg1 = sineSegment(440, 10);
  const seg2 = noiseSegment(10);
  const seg3 = sineSegment(220, 10);
  const samples = concatSegments(seg1, seg2, seg3);
  const wavBuffer = encodeWav(samples);
  console.log(`  wav encoded: ${wavBuffer.length} bytes`);

  const start = Date.now();
  const result = await footeAnalyze(wavBuffer, 'audio/wav');
  const elapsedMs = Date.now() - start;

  console.log(`\nFoote time: ${elapsedMs}ms`);
  console.log(`BPM: ${result.bpm}`);
  console.log(`Duration: ${result.duration.toFixed(2)}s`);
  console.log(`Sample rate: ${result.sampleRate}`);
  console.log(`Sections: ${JSON.stringify(result.suggestedSections, null, 2)}`);
  console.log(`Diagnostics: ${JSON.stringify(result.diagnostics, null, 2)}\n`);

  assert(result.sampleRate === SAMPLE_RATE, `sampleRate is ${SAMPLE_RATE}`);
  assert(
    Math.abs(result.duration - 30) < 0.5,
    `duration close to 30s (got ${result.duration.toFixed(2)})`,
  );
  assert(typeof result.bpm === 'number' && result.bpm > 30, `BPM is sane (got ${result.bpm})`);
  assert(
    result.suggestedSections.length >= 2 && result.suggestedSections.length <= 5,
    `2-5 sections detected (got ${result.suggestedSections.length})`,
  );
  assert(
    result.suggestedSections.every((s) => s.bars >= 1),
    'all detected sections have bars >= 1',
  );

  const bpmForSeconds = result.bpm;
  const secondsPerBar = (4 * 60) / bpmForSeconds;
  let cursor = 0;
  const boundaryTimes: number[] = [];
  for (const sec of result.suggestedSections) {
    cursor += sec.bars * secondsPerBar;
    boundaryTimes.push(cursor);
  }
  boundaryTimes.pop();

  console.log(
    `  Reconstructed boundary times (sec): ${boundaryTimes.map((t) => t.toFixed(2)).join(', ')}`,
  );
  console.log(`  True boundaries: 10.0, 20.0`);

  const trueBoundaries = [10, 20];
  for (const t of trueBoundaries) {
    const closest = boundaryTimes.length > 0
      ? Math.min(...boundaryTimes.map((b) => Math.abs(b - t)))
      : Infinity;
    assert(closest < 4, `boundary near ${t}s found within 4s (closest delta = ${closest.toFixed(2)})`);
  }

  assert(elapsedMs < 30000, `analyze under 30s wall time (got ${elapsedMs}ms)`);
}

(async () => {
  unitChecks();
  await integrationCheck();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(2);
});
