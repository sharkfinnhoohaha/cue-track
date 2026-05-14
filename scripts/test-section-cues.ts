/**
 * Section count-in and intro pre-roll assertions.
 *
 * Verifies the cue grammar added for product criterion 3:
 *   - Mid-song transitions emit "Section, 2, 3, 4" (section_count_in pattern)
 *     across the last bar of the previous section.
 *   - Intro pre-roll handles three cases:
 *       countInBars=0  → no pre-roll, announce at sample 0 (legacy behavior)
 *       countInBars=1  → compact section_count_in pattern on the single bar
 *       countInBars>=2 → announce on beat 1 of bar 1, digit count-in on the
 *                        LAST count-in bar, silence between
 *   - Time signature changes adjust the count-in length accordingly.
 *
 * Run: node --experimental-strip-types scripts/test-section-cues.ts
 */

import { buildTimeGrid } from '../src/lib/audio/grid.ts';
import type { SongSpec } from '../src/types/index.ts';

const SAMPLE_RATE = 44100;
let passed = 0;
let failed = 0;

/**
 * Record the result of a test assertion and log the outcome.
 *
 * Logs a success message and increments the global `passed` counter when `condition` is true;
 * otherwise logs a failure message and increments the global `failed` counter.
 *
 * @param condition - The assertion to evaluate; treated as passing when truthy
 * @param message - Human-readable description of the assertion used in the log output
 */
function assert(condition: boolean, message: string): void {
  if (condition) { console.log(`  ✓ ${message}`); passed++; }
  else { console.error(`  ✗ FAIL: ${message}`); failed++; }
}

/**
 * Create a baseline SongSpec for tests and merge any provided overrides into it.
 *
 * Defaults include: title "Test", 120 BPM, 4/4 time, three sections (Intro 4 bars, Verse 8 bars, Chorus 8 bars),
 * voiceId "en-US-Studio-M", classic click sound, WAV format, count-in and section announce enabled,
 * bar countdown disabled, and `countInBars` set to 1.
 *
 * @param overrides - Partial fields to apply over the default SongSpec
 * @returns The resulting SongSpec with defaults merged with `overrides`
 */
function makeSpec(overrides: Partial<SongSpec> = {}): SongSpec {
  return {
    title: 'Test',
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
    ...overrides,
  };
}

// =====================================================================
// Test A: Compact intro (countInBars=1, 4/4)
// Expected: 4 section_count_in cues on the single count-in bar.
// Beat 1 = "Intro", beats 2..4 = "2", "3", "4".
// =====================================================================
console.log('\n=== Test A: Compact intro (countInBars=1, 4/4) ===');
{
  const grid = buildTimeGrid(makeSpec({ countInBars: 1 }), SAMPLE_RATE);
  const introCues = grid.cues
    .filter(c => c.type === 'section_count_in' && c.sectionName === 'Intro')
    .sort((a, b) => a.sampleIndex - b.sampleIndex);

  assert(introCues.length === 4, `4 section_count_in cues for intro (got ${introCues.length})`);
  assert(introCues[0]?.text === 'Intro', `beat 1 text is section name (got "${introCues[0]?.text}")`);
  assert(introCues[1]?.text === '2', `beat 2 text is "2" (got "${introCues[1]?.text}")`);
  assert(introCues[2]?.text === '3', `beat 3 text is "3" (got "${introCues[2]?.text}")`);
  assert(introCues[3]?.text === '4', `beat 4 text is "4" (got "${introCues[3]?.text}")`);

  // Sample placement: beats are 60/120 = 0.5s = 22050 samples apart
  const spb = Math.round((SAMPLE_RATE * 60) / 120);
  assert(introCues[0]?.sampleIndex === 0, `beat 1 sample = 0 (got ${introCues[0]?.sampleIndex})`);
  assert(introCues[1]?.sampleIndex === spb, `beat 2 sample = ${spb} (got ${introCues[1]?.sampleIndex})`);
  assert(introCues[2]?.sampleIndex === spb * 2, `beat 3 sample = ${spb * 2} (got ${introCues[2]?.sampleIndex})`);
  assert(introCues[3]?.sampleIndex === spb * 3, `beat 4 sample = ${spb * 3} (got ${introCues[3]?.sampleIndex})`);

  // No section_announce or count_in cues should fire for the intro under compact mode
  const introAnnounces = grid.cues.filter(c => c.type === 'section_announce' && c.sectionName === 'Intro');
  const introDigits = grid.cues.filter(c => c.type === 'count_in' && c.sectionName === 'Intro');
  assert(introAnnounces.length === 0, `no plain section_announce for compact intro (got ${introAnnounces.length})`);
  assert(introDigits.length === 0, `no plain count_in for compact intro (got ${introDigits.length})`);
}

// =====================================================================
// Test B: Split intro (countInBars=2, 4/4)
// Expected: 1 section_announce on bar 1 beat 1, 4 count_in digits on bar 2.
// =====================================================================
console.log('\n=== Test B: Split intro (countInBars=2, 4/4) ===');
{
  const grid = buildTimeGrid(makeSpec({ countInBars: 2 }), SAMPLE_RATE);
  const introAnnounces = grid.cues.filter(c => c.type === 'section_announce' && c.sectionName === 'Intro');
  const countIns = grid.cues.filter(c => c.type === 'count_in');

  assert(introAnnounces.length === 1, `1 section_announce for split intro (got ${introAnnounces.length})`);
  assert(introAnnounces[0]?.sampleIndex === 0, `announce at sample 0 (got ${introAnnounces[0]?.sampleIndex})`);
  assert(introAnnounces[0]?.text === 'Intro', `announce text is "Intro" (got "${introAnnounces[0]?.text}")`);

  // Count-in digits on the LAST count-in bar (bar 2 in this case)
  const spb = Math.round((SAMPLE_RATE * 60) / 120);
  const lastBarStart = spb * 4; // bar 2 starts at sample 88200
  assert(countIns.length === 4, `4 count_in digits on the last count-in bar (got ${countIns.length})`);
  assert(countIns[0]?.text === '1' && countIns[0]?.sampleIndex === lastBarStart, `count_in[0] is "1" at ${lastBarStart}`);
  assert(countIns[1]?.text === '2' && countIns[1]?.sampleIndex === lastBarStart + spb, `count_in[1] is "2" at ${lastBarStart + spb}`);
  assert(countIns[2]?.text === '3' && countIns[2]?.sampleIndex === lastBarStart + spb * 2, `count_in[2] is "3" at ${lastBarStart + spb * 2}`);
  assert(countIns[3]?.text === '4' && countIns[3]?.sampleIndex === lastBarStart + spb * 3, `count_in[3] is "4" at ${lastBarStart + spb * 3}`);
}

// =====================================================================
// Test C: Split intro with extra padding (countInBars=3, 4/4)
// Expected: 1 announce on bar 1 beat 1, silent bar 2, 4 digits on bar 3.
// =====================================================================
console.log('\n=== Test C: Split intro extended (countInBars=3, 4/4) ===');
{
  const grid = buildTimeGrid(makeSpec({ countInBars: 3 }), SAMPLE_RATE);
  const introAnnounces = grid.cues.filter(c => c.type === 'section_announce' && c.sectionName === 'Intro');
  const countIns = grid.cues.filter(c => c.type === 'count_in');

  assert(introAnnounces.length === 1, `1 section_announce for 3-bar intro (got ${introAnnounces.length})`);
  assert(introAnnounces[0]?.sampleIndex === 0, `announce at sample 0`);

  // Digits land on the LAST count-in bar only (bar 3)
  const spb = Math.round((SAMPLE_RATE * 60) / 120);
  const lastBarStart = spb * 4 * 2; // bar 3 starts at sample 176400
  assert(countIns.length === 4, `4 count_in digits on the LAST bar only (got ${countIns.length})`);
  assert(countIns[0]?.sampleIndex === lastBarStart, `digits start at last count-in bar (sample ${lastBarStart})`);
}

// =====================================================================
// Test D: Legacy intro (countInBars=0, announce=true)
// Expected: 1 section_announce at sample 0, no count-in cues.
// =====================================================================
console.log('\n=== Test D: Legacy intro (countInBars=0) ===');
{
  const grid = buildTimeGrid(makeSpec({ countInBars: 0, enableCountIn: false }), SAMPLE_RATE);
  const introAnnounces = grid.cues.filter(c => c.type === 'section_announce' && c.sectionName === 'Intro');
  const sectionCountIns = grid.cues.filter(c => c.type === 'section_count_in' && c.sectionName === 'Intro');
  const introDigits = grid.cues.filter(c => c.type === 'count_in');

  assert(introAnnounces.length === 1, `1 section_announce when no count-in (got ${introAnnounces.length})`);
  assert(introAnnounces[0]?.sampleIndex === 0, `announce at sample 0`);
  assert(sectionCountIns.length === 0, `no section_count_in for intro when count-in disabled`);
  assert(introDigits.length === 0, `no count_in digits when count-in disabled`);
}

// =====================================================================
// Test E: Mid-song transition (4/4 → 4/4)
// Expected: 4 section_count_in cues across the LAST bar of Intro,
// announcing the upcoming "Verse" section.
// =====================================================================
console.log('\n=== Test E: Mid-song transition (4/4 → 4/4) ===');
{
  const grid = buildTimeGrid(makeSpec({ countInBars: 1 }), SAMPLE_RATE);
  const verseTransition = grid.cues
    .filter(c => c.type === 'section_count_in' && c.sectionName === 'Verse')
    .sort((a, b) => a.sampleIndex - b.sampleIndex);

  assert(verseTransition.length === 4, `4 section_count_in cues for Intro→Verse (got ${verseTransition.length})`);
  assert(verseTransition[0]?.text === 'Verse', `beat 1 = "Verse" (got "${verseTransition[0]?.text}")`);
  assert(verseTransition[1]?.text === '2', `beat 2 = "2"`);
  assert(verseTransition[2]?.text === '3', `beat 3 = "3"`);
  assert(verseTransition[3]?.text === '4', `beat 4 = "4"`);

  // Cues should land on the last bar of Intro, which is bar 4 (4-bar intro).
  // Intro starts at sample (countInBars * 4 beats * spb) = 1 * 4 * 22050 = 88200
  // Intro's last bar starts at sample 88200 + 3 bars * 4 beats * 22050 = 88200 + 264600 = 352800
  const spb = Math.round((SAMPLE_RATE * 60) / 120);
  const spbar = spb * 4;
  const introStart = spbar; // after 1 count-in bar
  const introLastBarStart = introStart + spbar * 3; // bar 4 of 4
  assert(verseTransition[0]?.sampleIndex === introLastBarStart, `beat 1 sample = ${introLastBarStart} (got ${verseTransition[0]?.sampleIndex})`);
  assert(verseTransition[3]?.sampleIndex === introLastBarStart + spb * 3, `beat 4 sample = ${introLastBarStart + spb * 3} (got ${verseTransition[3]?.sampleIndex})`);
}

// =====================================================================
// Test F: Time signature handling for section_count_in
// Expected: count digit cues match the meter (3 cues in 3/4, 5 in 5/4, 7 in 7/8).
// =====================================================================
console.log('\n=== Test F: Time signatures ===');
{
  for (const ts of [
    { beats: 3, subdivision: 4 },
    { beats: 5, subdivision: 4 },
    { beats: 6, subdivision: 8 },
    { beats: 7, subdivision: 8 },
  ]) {
    const grid = buildTimeGrid(makeSpec({ timeSignature: ts, countInBars: 1 }), SAMPLE_RATE);
    const verseTransition = grid.cues
      .filter(c => c.type === 'section_count_in' && c.sectionName === 'Verse')
      .sort((a, b) => a.sampleIndex - b.sampleIndex);

    assert(
      verseTransition.length === ts.beats,
      `${ts.beats}/${ts.subdivision}: ${ts.beats} section_count_in cues (got ${verseTransition.length})`,
    );
    assert(
      verseTransition[0]?.text === 'Verse',
      `${ts.beats}/${ts.subdivision}: beat 1 is section name`,
    );
    // Last cue text should be String(ts.beats)
    assert(
      verseTransition[ts.beats - 1]?.text === String(ts.beats),
      `${ts.beats}/${ts.subdivision}: beat ${ts.beats} text = "${ts.beats}"`,
    );
  }
}

// =====================================================================
// Test G: Count-in disabled, announce enabled
// Expected: mid-song transitions emit a single section_announce, NOT
// section_count_in.
// =====================================================================
console.log('\n=== Test G: Count-in disabled, announce enabled ===');
{
  const grid = buildTimeGrid(
    makeSpec({ enableCountIn: false, countInBars: 0, enableSectionAnnounce: true }),
    SAMPLE_RATE,
  );
  const verseTransitions = grid.cues.filter(c => c.sectionName === 'Verse' && c.type !== 'count_in');
  const verseAnnounces = verseTransitions.filter(c => c.type === 'section_announce');
  const verseCountIns = verseTransitions.filter(c => c.type === 'section_count_in');

  assert(verseAnnounces.length === 1, `1 plain section_announce for Verse (got ${verseAnnounces.length})`);
  assert(verseCountIns.length === 0, `0 section_count_in cues when count-in disabled (got ${verseCountIns.length})`);
}

// =====================================================================
// Test H: All announce features disabled
// Expected: no spoken cues at all.
// =====================================================================
console.log('\n=== Test H: All announce features disabled ===');
{
  const grid = buildTimeGrid(
    makeSpec({ enableSectionAnnounce: false, enableCountIn: false, enableBarCountdown: false, countInBars: 0 }),
    SAMPLE_RATE,
  );
  assert(grid.cues.length === 0, `no cues when all announcement features disabled (got ${grid.cues.length})`);
}

// =====================================================================
// Test I: Count-in enabled, announce disabled
// Expected: digit count-in cues only, no section_count_in pattern.
// =====================================================================
console.log('\n=== Test I: Count-in enabled, announce disabled ===');
{
  const grid = buildTimeGrid(
    makeSpec({ enableSectionAnnounce: false, enableCountIn: true, countInBars: 1 }),
    SAMPLE_RATE,
  );
  const countIns = grid.cues.filter(c => c.type === 'count_in');
  const sectionCountIns = grid.cues.filter(c => c.type === 'section_count_in');

  assert(countIns.length === 4, `4 plain digit count-in cues (got ${countIns.length})`);
  assert(sectionCountIns.length === 0, `0 section_count_in cues without announce (got ${sectionCountIns.length})`);
}

// =====================================================================
// Test J: Cue ordering by sampleIndex
// Expected: grid.cues sorted ascending by sampleIndex (downstream consumers
// rely on this).
// =====================================================================
console.log('\n=== Test J: Cue ordering ===');
{
  const grid = buildTimeGrid(makeSpec({ countInBars: 2, enableBarCountdown: true }), SAMPLE_RATE);
  let inOrder = true;
  for (let i = 1; i < grid.cues.length; i++) {
    if (grid.cues[i].sampleIndex < grid.cues[i - 1].sampleIndex) {
      inOrder = false;
      break;
    }
  }
  assert(inOrder, `grid.cues sorted ascending by sampleIndex`);
}

// =====================================================================
// Test K: Unique cue texts are sufficient for engine TTS batching
// Expected: every cue text in any spec is a string the engine can pass to TTS.
// =====================================================================
console.log('\n=== Test K: Cue text catalog ===');
{
  const grid = buildTimeGrid(
    makeSpec({ countInBars: 1, timeSignature: { beats: 7, subdivision: 8 }, enableBarCountdown: true }),
    SAMPLE_RATE,
  );
  const texts = new Set(grid.cues.map(c => c.text));
  let allValid = true;
  for (const t of texts) {
    if (typeof t !== 'string' || t.length === 0) {
      allValid = false;
      console.error(`  invalid cue text: ${JSON.stringify(t)}`);
    }
  }
  assert(allValid, `all cue texts are non-empty strings (catalog: ${[...texts].sort().join(', ')})`);
}

console.log('\n==================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('==================================');
if (failed > 0) { console.error('\nSECTION CUE VALIDATION FAILED'); process.exit(1); }
else { console.log('\nAll section cue assertions passed.'); process.exit(0); }
