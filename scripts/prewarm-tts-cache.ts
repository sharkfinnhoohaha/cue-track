/**
 * Pre-warm the Postgres tts_cache table with the most common cue strings
 * across both Standard and Studio voices. Eliminates the first-render TTS
 * spend for new deploys / cold cache states.
 *
 * Run:
 *   GOOGLE_TTS_API_KEY=... DATABASE_URL=... \
 *     node --experimental-strip-types scripts/prewarm-tts-cache.ts
 *
 * Or via the existing tsx dev dep:
 *   GOOGLE_TTS_API_KEY=... DATABASE_URL=... \
 *     npx tsx scripts/prewarm-tts-cache.ts
 *
 * Cost: ~700 chars * 7 voices = ~5K chars total.
 *   Standard tier: 2 voices * 700 chars = 1.4K chars * $4/M = ~$0.006
 *   Studio tier:   3 voices * 700 chars = 2.1K chars * $160/M = ~$0.34
 *   Neural2 tier:  2 voices * 700 chars = 1.4K chars * $16/M = ~$0.02
 *   Total: ~$0.37 one-time
 *
 * After this runs once per voice, every subsequent generate request for
 * any of these cue strings returns from Postgres (~5-10 ms) instead of
 * hitting the Google TTS API (~150-300 ms).
 *
 * Idempotent: synthesizeSpeech() short-circuits on in-process Map hit,
 * then on Postgres hit, then synthesizes. The Postgres INSERT uses
 * ON CONFLICT DO NOTHING, so re-running is safe and cheap (DB-only).
 *
 * Manifest editing: add cue strings to COMMON_CUES below. Custom section
 * names that real users type ("My Verse 2", "Bridge B", etc.) cannot be
 * predicted and pay the TTS API on first synthesis; that's the design.
 */

import { synthesizeSpeech } from '../src/lib/audio/tts.ts';
import { AVAILABLE_VOICES } from '../src/lib/audio/types.ts';

// Section names commonly used in pop/rock/hip-hop/electronic structures.
// Numerical count-in digits 1-8 cover every reasonable time-signature beat.
// Bar countdowns "1 bar".."4 bars" mirror what the engine emits before
// each section transition.
const COMMON_CUES: string[] = [
  // Section names
  'Intro',
  'Verse',
  'Verse 1',
  'Verse 2',
  'Pre-Chorus',
  'Chorus',
  'Chorus 1',
  'Chorus 2',
  'Bridge',
  'Breakdown',
  'Drop',
  'Build',
  'Build-Up',
  'Hook',
  'Refrain',
  'Outro',
  'Coda',
  'Solo',
  'Guitar Solo',
  'Instrumental',
  'Interlude',
  'Tag',
  'Fill',

  // Count-in digits (covers up to 8/8 time signature)
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',

  // Bar countdowns from src/lib/audio/grid.ts
  '1 bar',
  '2 bars',
  '3 bars',
  '4 bars',
];

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const tierFilter = args.has('--standard-only')
  ? 'standard'
  : args.has('--studio-only')
    ? 'studio'
    : null;

function requireEnv(key: string): void {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  requireEnv('DATABASE_URL');
  if (!dryRun) requireEnv('GOOGLE_TTS_API_KEY');

  const voices = tierFilter
    ? AVAILABLE_VOICES.filter((v) => v.tier === tierFilter)
    : AVAILABLE_VOICES;

  const totalChars = COMMON_CUES.reduce((sum, cue) => sum + cue.length, 0);
  console.log(`prewarm-tts-cache`);
  console.log(`  cues:    ${COMMON_CUES.length} (${totalChars} chars total)`);
  console.log(`  voices:  ${voices.length}${tierFilter ? ` (${tierFilter} only)` : ''}`);
  console.log(`  pairs:   ${COMMON_CUES.length * voices.length}`);
  console.log(`  dry run: ${dryRun ? 'yes' : 'no'}`);
  console.log('');

  if (dryRun) {
    for (const voice of voices) {
      console.log(`  would synthesize for ${voice.id} (${voice.tier}):`);
      for (const cue of COMMON_CUES) {
        console.log(`    - "${cue}"`);
      }
    }
    return;
  }

  let successCount = 0;
  let failureCount = 0;
  const failures: string[] = [];

  for (const voice of voices) {
    console.log(`Voice ${voice.id} (${voice.tier})...`);
    for (const cue of COMMON_CUES) {
      try {
        await synthesizeSpeech(cue, voice.id);
        successCount++;
      } catch (err) {
        failureCount++;
        const msg = `${voice.id}:"${cue}" -> ${err instanceof Error ? err.message : String(err)}`;
        failures.push(msg);
        console.error(`  FAIL ${msg}`);
      }
    }
  }

  console.log('');
  console.log(`Done. ${successCount} synthesized, ${failureCount} failed.`);
  if (failureCount > 0) {
    console.error('Failures:');
    failures.forEach((f) => console.error(`  ${f}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
