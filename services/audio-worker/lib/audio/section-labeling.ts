/**
 * Cluster → section-label assignment for the Foote detector.
 *
 * Extracted as a pure, dependency-free unit so it can be tested in isolation
 * and so the chorus/verse decision is one auditable place.
 *
 * Why this exists: the legacy heuristic labels the loudest acoustic cluster as
 * the chorus (energy only). But the defining trait of a chorus is that it
 * REPEATS — so when the loop produces "everything is a verse" or "too many
 * choruses", the missing signal is repetition, not loudness.
 *
 * `repetitionWeight` blends each cluster's repetition count (how many sections
 * belong to it) into the score:
 *
 *     score = (1 - w) * energy + w * normalizedRepetitionCount
 *
 * At **w = 0 the output is byte-for-byte the legacy energy-only ranking**, so
 * this is a safe no-op by default. The detector reads it from
 * `FOOTE_REPETITION_WEIGHT` (default 0); the offline tuner / agent sweeps w > 0
 * and the grader decides whether repetition-aware labeling actually helps.
 */

export interface ClusterStat {
  id: number;
  avgRms: number;
  avgHfc: number;
  /** how many sections belong to this cluster (its repetition count) */
  count: number;
}

export type SectionLabel = 'Verse' | 'Chorus';

export function assignClusterLabels(
  clusters: ClusterStat[],
  repetitionWeight = 0,
): Map<number, SectionLabel> {
  const labels = new Map<number, SectionLabel>();
  if (clusters.length === 0) return labels;

  const w = Math.min(1, Math.max(0, repetitionWeight));
  const maxRms = Math.max(...clusters.map((c) => c.avgRms));
  const maxHfc = Math.max(...clusters.map((c) => c.avgHfc));
  const maxCount = Math.max(...clusters.map((c) => c.count));

  // Preserve the legacy ordering exactly at w=0 (energy = 0.5·rms + 0.5·hfc),
  // so ties resolve in cluster-id order just as the original did.
  const scored = clusters.map((c) => {
    const normRms = maxRms > 0 ? c.avgRms / maxRms : 0;
    const normHfc = maxHfc > 0 ? c.avgHfc / maxHfc : 0;
    const energy = 0.5 * normRms + 0.5 * normHfc;
    const rep = maxCount > 0 ? c.count / maxCount : 0;
    return { id: c.id, score: (1 - w) * energy + w * rep };
  });

  scored.sort((a, b) => a.score - b.score); // lowest → Verse, highest → Chorus

  if (scored.length === 1) {
    labels.set(scored[0]!.id, 'Verse');
  } else if (scored.length === 2) {
    labels.set(scored[0]!.id, 'Verse');
    labels.set(scored[1]!.id, 'Chorus');
  } else {
    const verseScore = scored[0]!.score;
    const chorusScore = scored[scored.length - 1]!.score;
    const midRange = chorusScore - verseScore;
    labels.set(scored[0]!.id, 'Verse');
    labels.set(scored[scored.length - 1]!.id, 'Chorus');
    for (let idx = 1; idx < scored.length - 1; idx++) {
      const relScore = midRange > 0 ? (scored[idx]!.score - verseScore) / midRange : 0.5;
      labels.set(scored[idx]!.id, relScore >= 0.5 ? 'Chorus' : 'Verse');
    }
  }
  return labels;
}
