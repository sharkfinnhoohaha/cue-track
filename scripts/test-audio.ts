/**
 * Audio engine validation test.
 * Renders a known test track and asserts programmatically that
 * clicks, accents, voice cue placement, and total duration all match the spec.
 *
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
  if (condition) { console.log(`  ✓ ${message}`); passed++; }
  else { console.error(`  ✗ FAIL: ${message}`); failed++; }
}

function assertClose(actual: number, expected: number, tolerance: number, message: string): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) { console.log(`  ✓ ${message} (actual: ${actual}, expected: ${expected})`); passed++; }
  else { console.error(`  ✗ FAIL: ${message} (actual: ${actual}, expected: ${expected}, diff: ${diff})`); failed++; }
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

console.log('\n=== Test 2: Cue Events ===');
const sectionAnnounces = grid.cues.filter(c => c.type === 'section_announce');
const countIns = grid.cues.filter(c => c.type === 'count_in');
const barCountdowns = grid.cues.filter(c => c.type === 'bar_countdown');
assert(sectionAnnounces.length === 5, `5 section announcements (got ${sectionAnnounces.length})`);
assert(countIns.length === 4, `4 count-in events (got ${countIns.length})`);
assert(barCountdowns.length === 17, `17 bar countdown events (got ${barCountdowns.length})`);

console.log('\n=== Test 3: Click Synthesis ===');
for (const clickType of ['classic', 'woodblock', 'rimshot', 'hi-hat'] as const) {
  const downbeat = generateClick(clickType, true, SAMPLE_RATE);
  const regular = generateClick(clickType, false, SAMPLE_RATE);
  assert(downbeat.length > 0, `${clickType} downbeat has samples`);
  assert(regular.length > 0, `${clickType} regular has samples`);
  const downbeatPeak = Math.max(...Array.from(downbeat).map(Math.abs));
  const regularPeak = Math.max(...Array.from(regular).map(Math.abs));
  assert(downbeatPeak >= regularPeak, `${clickType} downbeat peak >= regular peak`);
  assert(downbeat.length <= 1102, `${clickType} downbeat <= 25ms`);
}

console.log('\n=== Test 4: Mixer DSP ===');
const testTone = new Float32Array(SAMPLE_RATE);
for (let i = 0; i < testTone.length; i++) {
  const t = i / SAMPLE_RATE;
  testTone[i] = 0.5 * Math.sin(2 * Math.PI * 100 * t) + 0.5 * Math.sin(2 * Math.PI * 1000 * t);
}
const filtered = highPassFilter(testTone, 200, SAMPLE_RATE);
assert(filtered.length === testTone.length, 'HPF output length matches input');
const testGain = applyGain(new Float32Array([1.0, 0.5, -0.5, -1.0]), -6);
assertClose(testGain[0], 0.5012, 0.01, '-6dB gain on 1.0');

console.log('\n=== Test 5: Full Mix and WAV Encoding ===');
const downbeatClick = generateClick('classic', true, SAMPLE_RATE);
const regularClick = generateClick('classic', false, SAMPLE_RATE);
const cueSamples = new Map<string, Float32Array>();
for (const text of ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro', '1', '2', '3', '4', '1 bar', '2 bars', '3 bars', '4 bars']) {
  const samples = new Float32Array(Math.round(SAMPLE_RATE * 0.1));
  const freq = 330 + (text.charCodeAt(0) % 5) * 40;
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = 0.5 * Math.exp(-t / 0.03) * Math.sin(2 * Math.PI * freq * t);
  }
  cueSamples.set(text, samples);
}
const stereoBuffer = mixTrack({ grid, clickSamples: { downbeat: downbeatClick, regular: regularClick }, cueSamples, sampleRate: SAMPLE_RATE, clickGainDb: 0, cueGainDb: -6 });
assert(stereoBuffer.length === grid.totalSamples * 2, `Stereo buffer length = ${grid.totalSamples * 2}`);

console.log('\n=== Test 6: WAV Encoding ===');
const wavBuffer = encodeWav(stereoBuffer, SAMPLE_RATE, 2);
assert(wavBuffer.subarray(0, 4).toString() === 'RIFF', 'WAV starts with RIFF');
assert(wavBuffer.readUInt16LE(20) === 1, 'Audio format = PCM');
assert(wavBuffer.readUInt16LE(22) === 2, 'Channels = 2 stereo');
assert(wavBuffer.readUInt32LE(24) === SAMPLE_RATE, `Sample rate = ${SAMPLE_RATE}`);
assert(wavBuffer.readUInt16LE(34) === 16, 'Bits per sample = 16');

const outputDir = join(process.cwd(), 'test-output');
try { mkdirSync(outputDir, { recursive: true }); } catch {}
writeFileSync(join(outputDir, 'test-track.wav'), wavBuffer);
console.log(`\n  Test track written to ${join(outputDir, 'test-track.wav')}`);

console.log('\n==================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('==================================');
if (failed > 0) { console.error('\nVALIDATION FAILED'); process.exit(1); }
else { console.log('\nAll audio engine assertions passed.'); process.exit(0); }
