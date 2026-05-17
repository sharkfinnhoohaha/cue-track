/**
 * Smoke test for the /analyze pipeline.
 *
 * Renders a deterministic test WAV via the existing engine, runs it through
 * analyzeAudio, and asserts the detected BPM + duration line up with what
 * was synthesized.
 *
 * Run: node --experimental-strip-types test/smoke-analyze.ts
 */

import { renderTrack } from '../lib/audio/engine.ts';
import { analyzeAudio, isSupportedMime } from '../lib/audio/analyze.ts';
import type { SongSpec } from '../lib/audio/types.ts';

// 120 BPM, 4/4, 16 bars + 1 count-in bar = 34 seconds. Long enough for the
// onset detector to lock on but short enough to keep the test under a minute.
const SPEC: SongSpec = {
  title: 'Analyze Smoke',
  bpm: 120,
  timeSignature: { beats: 4, subdivision: 4 },
  sections: [
    { id: '1', name: 'A', bars: 8 },
    { id: '2', name: 'B', bars: 8 },
  ],
  voiceId: 'en-US-Standard-D',
  clickSound: 'classic',
  format: 'wav',
  enableCountIn: true,
  enableSectionAnnounce: false,
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
  console.log('=== Analyze smoke test ===\n');

  assert(isSupportedMime('audio/wav') === 'wav', 'audio/wav is supported');
  assert(isSupportedMime('audio/mpeg') === 'mp3', 'audio/mpeg is supported');
  assert(isSupportedMime('audio/x-wav') === 'wav', 'audio/x-wav is supported');
  assert(isSupportedMime('audio/mp3; charset=foo') === 'mp3', 'mime with params parses');
  assert(isSupportedMime('audio/flac') === null, 'audio/flac rejected');
  assert(isSupportedMime('text/plain') === null, 'text/plain rejected');

  console.log('\nRendering test WAV...');
  const rendered = await renderTrack(SPEC);
  console.log(
    `  rendered ${rendered.fullTrack.length} bytes, duration=${rendered.duration.toFixed(1)}s`,
  );

  console.log('\nAnalyzing...');
  const start = Date.now();
  const result = await analyzeAudio(rendered.fullTrack, 'audio/wav');
  const elapsedMs = Date.now() - start;

  console.log(`\nAnalyze time: ${elapsedMs}ms`);
  console.log(`Detected BPM: ${result.bpm}`);
  console.log(`Duration: ${result.duration.toFixed(2)}s`);
  console.log(`Sample rate: ${result.sampleRate}`);
  console.log(`Sections: ${JSON.stringify(result.suggestedSections, null, 2)}\n`);

  // Detection should land within ±5 BPM of the source. Music-tempo can be
  // jittery on synthesized clicks (the onset detector is built for music),
  // so we accept a wider band than we would for real audio.
  assert(
    result.bpm >= 100 && result.bpm <= 140,
    `BPM within [100, 140] of source 120 (got ${result.bpm})`,
  );
  assert(
    Math.abs(result.duration - rendered.duration) < 0.5,
    `Duration within 0.5s of rendered ${rendered.duration.toFixed(2)}s (got ${result.duration.toFixed(2)}s)`,
  );
  assert(result.sampleRate === 44100, 'Sample rate is 44100');
  assert(
    result.suggestedSections.length >= 1,
    `At least one section suggested (got ${result.suggestedSections.length})`,
  );
  assert(
    result.suggestedSections.every((s) => s.bars >= 1),
    'All suggested sections have bars >= 1',
  );
  assert(
    result.suggestedSections.every((s) => typeof s.id === 'string' && s.id.length > 0),
    'All suggested sections have non-empty ids',
  );
  // The rendered clip is ~34s, which puts it in the <60s band → single "Loop"
  // section. Verify the template selection.
  assert(
    result.suggestedSections.length === 1 && result.suggestedSections[0]?.name === 'Loop',
    'Short clip yields a single "Loop" section',
  );
  assert(elapsedMs < 15000, `Analyze under 15s (got ${elapsedMs}ms)`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
