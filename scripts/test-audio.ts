/**
 * Audio engine validation test.
 * Run: node --experimental-strip-types scripts/test-audio.ts
 */

import { buildTimeGrid } from '../src/lib/audio/grid.ts';
import { generateClick } from '../src/lib/audio/click.ts';
import { mixTrack, highPassFilter, applyGain } from '../src/lib/audio/mixer.ts';
import { encodeWav } from '../src/lib/audio/encoder.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const TEST_SPEC = {
  title: 'Test Song',
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
  clickSound: 'classic' as const,
  format: 'wav' as const,
  enableCountIn: true,
  enableSectionAnnounce: true,
  enableBarCountdown: true,
  countInBars: 1,
};

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

function assertClose(actual: number, expected: number, tolerance: number, message: string): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(`  ✓ ${message} (actual: ${actual}, expected: ${expected}, diff: ${diff})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message} (actual: ${actual}, expected: ${expected}, diff: ${diff}, tolerance: ${tolerance})`);
    failed++;
  }
}

console.log('\n=== Test 1: Time Grid Calculation ===');
const grid = buildTimeGrid(TEST_SPEC, SAMPLE_RATE);
const samplesPerBeat = Math.round((SAMPLE_RATE * 60) / TEST_SPEC.bpm);
const samplesPerBar = samplesPerBeat * TEST_SPEC.timeSignature.beats;
const totalBars = TEST_SPEC.countInBars + TEST_SPEC.sections.reduce((sum, s) => sum + s.bars, 0);
const expectedTotalBeats = totalBars * TEST_SPEC.timeSignature.beats;
const expectedDuration = totalBars * TEST_SPEC.timeSignature.beats * (60 / TEST_SPEC.bpm);

assert(samplesPerBeat === 22050, `Samples per beat = 22050 (got ${samplesPerBeat})`);
assert(samplesPerBar === 88200, `Samples per bar = 88200 (got ${samplesPerBar})`);
assert(grid.beats.length === expectedTotalBeats, `Total beats = ${expectedTotalBeats} (got ${grid.beats.length})`);
assertClose(grid.totalDuration, expectedDuration, 0.01, `Total duration = ${expectedDuration}s`);

console.log('\n=== Test 2: Click Synthesis ===');
for (const clickType of ['classic', 'woodblock', 'rimshot', 'hi-hat'] as const) {
  const downbeat = generateClick(clickType, true, SAMPLE_RATE);
  const regular = generateClick(clickType, false, SAMPLE_RATE);
  assert(downbeat.length > 0, `${clickType} downbeat has samples`);
  assert(regular.length > 0, `${clickType} regular has samples`);
}

console.log('\n=== Test 3: Mixer DSP ===');
const testTone = new Float32Array(SAMPLE_RATE);
for (let i = 0; i < testTone.length; i++) {
  const t = i / SAMPLE_RATE;
  testTone[i] = 0.5 * Math.sin(2 * Math.PI * 100 * t) + 0.5 * Math.sin(2 * Math.PI * 1000 * t);
}
const filtered = highPassFilter(testTone, 200, SAMPLE_RATE);
assert(filtered.length === testTone.length, 'HPF output length matches input');

console.log('\n==================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('==================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
