/**
 * Smoke test for the audio worker.
 * Renders a known spec and asserts basic invariants.
 *
 * Run: node --experimental-strip-types test/smoke.ts
 */

import { renderTrack } from '../lib/audio/engine.ts';
import type { SongSpec } from '../lib/audio/types.ts';
import { writeFileSync, mkdirSync } from 'node:fs';

const SPEC: SongSpec = {
  title: 'Smoke Test',
  bpm: 120,
  timeSignature: { beats: 4, subdivision: 4 },
  sections: [
    { id: '1', name: 'Intro', bars: 4 },
    { id: '2', name: 'Verse', bars: 8 },
    { id: '3', name: 'Chorus', bars: 8 },
  ],
  voiceId: 'en-US-Studio-M',
  clickSound: 'classic',
  format: 'wav',
  enableCountIn: true,
  enableSectionAnnounce: true,
  enableBarCountdown: false,
  countInBars: 1,
};

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

(async () => {
  console.log('=== Audio worker smoke test ===\n');

  const start = Date.now();
  const result = await renderTrack(SPEC);
  const elapsedMs = Date.now() - start;

  console.log(`\nRender time: ${elapsedMs}ms`);
  console.log(`Format: ${result.format}`);
  console.log(`Duration: ${result.duration.toFixed(2)}s`);
  console.log(`Full track size: ${(result.fullTrack.length / 1024).toFixed(1)} KiB`);
  console.log(`Preview size: ${(result.preview.length / 1024).toFixed(1)} KiB\n`);

  assert(result.format === 'wav', 'Format is wav');
  assert(result.duration > 40 && result.duration < 50, 'Duration ~42s (1 count-in + 20 bars)');
  assert(result.fullTrack.length > 0, 'Full track has content');
  assert(result.preview.length > 0, 'Preview has content');
  assert(result.fullTrack.subarray(0, 4).toString() === 'RIFF', 'Full track is valid WAV');
  assert(result.preview.subarray(0, 4).toString() === 'RIFF', 'Preview is valid WAV');
  assert(elapsedMs < 30000, `Render under 30s (got ${elapsedMs}ms)`);

  // Write outputs for manual inspection
  try {
    mkdirSync('test-output', { recursive: true });
  } catch {}
  writeFileSync('test-output/smoke-full.wav', result.fullTrack);
  writeFileSync('test-output/smoke-preview.wav', result.preview);
  console.log('\nWrote test-output/smoke-full.wav and test-output/smoke-preview.wav');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
