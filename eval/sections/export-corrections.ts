/**
 * Turn production user-corrections into an accuracy signal — the cheapest,
 * highest-leverage label source, and the one that grows as you get traffic.
 *
 *   DATABASE_URL=... npx tsx eval/sections/export-corrections.ts [--labels-dir <dir>]
 *
 * The analyze_outcomes table already stores, per finalized track, the
 * detector's `snapshot` (predicted sections) AND the user's `finalSections`
 * (what they corrected it to). Both are in bars; with the track's bpm/duration
 * we convert each to a time-domain segmentation and run the SAME grader,
 * treating the user's final as ground truth. That yields a real, genre-matched
 * production accuracy number PER DETECTOR — no audio, no manual labeling.
 *
 * Caveat: users don't always fully correct, so this slightly OVER-estimates
 * accuracy. Treat it as a continuously-updating proxy and trend line; the
 * audio-backed corpus (run-eval/tune) remains the source of truth for the
 * release gate. With --labels-dir it also writes per-track ground-truth label
 * files you can pair with your own audio to grow the corpus.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { sectionsToSegmentation, type RawSection } from './convert';
import { gradeSong, aggregate, type SongScore } from './grade';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exit(2);
  }
  const labelsDir = arg('labels-dir');
  const { db, analyzeOutcomes, tracks } = await import('@/lib/db');
  const { eq } = await import('drizzle-orm');

  const rows = await db
    .select({
      trackId: analyzeOutcomes.trackId,
      method: analyzeOutcomes.method,
      snapshot: analyzeOutcomes.snapshot,
      finalSections: analyzeOutcomes.finalSections,
      spec: tracks.spec,
      duration: tracks.duration,
    })
    .from(analyzeOutcomes)
    .leftJoin(tracks, eq(analyzeOutcomes.trackId, tracks.id));

  if (labelsDir) mkdirSync(labelsDir, { recursive: true });

  const byMethod = new Map<string, SongScore[]>();
  let skipped = 0;

  for (const r of rows) {
    const spec = r.spec as { bpm?: number } | null;
    const bpm = spec?.bpm;
    const duration = r.duration;
    if (!bpm || !duration) {
      skipped++;
      continue;
    }
    const pred = sectionsToSegmentation({ bpm, duration, suggestedSections: r.snapshot as RawSection[] });
    const ref = sectionsToSegmentation({ bpm, duration, suggestedSections: r.finalSections as RawSection[] });
    const score = gradeSong(ref, pred);
    if (!byMethod.has(r.method)) byMethod.set(r.method, []);
    byMethod.get(r.method)!.push(score);

    if (labelsDir) {
      writeFileSync(join(labelsDir, `${r.trackId}.sections.json`), JSON.stringify(ref, null, 2));
    }
  }

  const report: Record<string, unknown> = {};
  for (const [method, scores] of Array.from(byMethod.entries())) {
    report[method] = aggregate(scores);
  }
  console.log(
    JSON.stringify(
      { totalOutcomes: rows.length, skippedNoBpmOrDuration: skipped, perMethod: report },
      null,
      2,
    ),
  );
  console.error(
    '\nProduction accuracy proxy (predicted vs user-final), per detector. ' +
      'Higher = users edit less = better. Trend this over time.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
