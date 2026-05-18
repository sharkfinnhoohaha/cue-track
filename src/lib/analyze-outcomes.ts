/**
 * Phase D measurement: record an analyze_outcomes row per finalized
 * track so we can score detectors against user edits.
 *
 * Called from /api/tracks/generate's UPDATE path (the path that
 * finalizes a draft created by /api/tracks/analyze). Best-effort:
 * failure logs but does not fail the user's finalization.
 *
 * Deltas:
 *   numSectionsDelta = |final.length - snapshot.length|
 *   totalBarsDelta   = sum |final[i].bars - snapshot[i].bars|
 *                      zipped on the shorter array
 *   nameEditCount    = count of positions where the name differs
 *                      zipped on the shorter array
 *
 * Lower deltas = the detector was closer to what the user wanted.
 */

import { desc, eq } from 'drizzle-orm';
import { db, analyzeJobs, analyzeOutcomes } from '@/lib/db';
import type { AnalyzeJobResult } from '@/lib/db/schema';

interface SectionLike {
  id: string;
  name: string;
  bars: number;
}

export function computeDeltas(
  snapshot: SectionLike[],
  final: SectionLike[],
): { numSectionsDelta: number; totalBarsDelta: number; nameEditCount: number } {
  const numSectionsDelta = Math.abs(final.length - snapshot.length);
  const pairs = Math.min(snapshot.length, final.length);
  let totalBarsDelta = 0;
  let nameEditCount = 0;
  for (let i = 0; i < pairs; i++) {
    const s = snapshot[i];
    const f = final[i];
    totalBarsDelta += Math.abs((f.bars ?? 0) - (s.bars ?? 0));
    if ((f.name ?? '').trim() !== (s.name ?? '').trim()) nameEditCount += 1;
  }
  return { numSectionsDelta, totalBarsDelta, nameEditCount };
}

export async function recordAnalyzeOutcome(
  trackId: string,
  finalSections: SectionLike[],
): Promise<void> {
  try {
    const jobRows = await db
      .select({
        id: analyzeJobs.id,
        method: analyzeJobs.method,
        result: analyzeJobs.result,
      })
      .from(analyzeJobs)
      .where(eq(analyzeJobs.trackId, trackId))
      .orderBy(desc(analyzeJobs.finishedAt))
      .limit(1);

    const job = jobRows[0];
    if (!job || !job.result) {
      // No analyze_jobs row for this track. Either the track was created
      // outside the upload flow (manual mode via /create) or PR-B's
      // schema is not yet provisioned. Skip silently.
      return;
    }

    const result = job.result as AnalyzeJobResult;
    const snapshot = result.suggestedSections ?? [];

    const deltas = computeDeltas(snapshot, finalSections);

    await db.insert(analyzeOutcomes).values({
      trackId,
      jobId: job.id,
      method: job.method,
      snapshot,
      finalSections,
      numSectionsDelta: deltas.numSectionsDelta,
      totalBarsDelta: deltas.totalBarsDelta,
      nameEditCount: deltas.nameEditCount,
    });

    console.log(
      `[analyze-outcomes] Recorded ${job.method} outcome for track ${trackId}: ` +
      `sections Δ=${deltas.numSectionsDelta}, bars Δ=${deltas.totalBarsDelta}, ` +
      `name edits=${deltas.nameEditCount}`,
    );
  } catch (err) {
    console.error(`[analyze-outcomes] Failed to record outcome for ${trackId}:`, err);
  }
}
