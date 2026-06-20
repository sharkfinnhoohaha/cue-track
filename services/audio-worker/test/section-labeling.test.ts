/**
 * Unit test for the cluster→label assignment.
 *   node --experimental-strip-types services/audio-worker/test/section-labeling.test.ts
 */
import assert from 'node:assert/strict';
import { assignClusterLabels, type ClusterStat } from '../lib/audio/section-labeling.ts';

let passed = 0;
function it(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// Three clusters: A is loudest (energy), C repeats the most (3 sections).
const clusters: ClusterStat[] = [
  { id: 0, avgRms: 0.9, avgHfc: 0.9, count: 1 }, // loud, rare
  { id: 1, avgRms: 0.4, avgHfc: 0.4, count: 1 }, // quiet, rare
  { id: 2, avgRms: 0.6, avgHfc: 0.6, count: 3 }, // medium, repeats most
];

it('w=0 reproduces legacy energy-only labeling (loudest = Chorus)', () => {
  const labels = assignClusterLabels(clusters, 0);
  assert.equal(labels.get(0), 'Chorus'); // loudest
  assert.equal(labels.get(1), 'Verse'); // quietest
});

it('w=1 makes the most-repeated cluster the Chorus, not the loudest', () => {
  const labels = assignClusterLabels(clusters, 1);
  assert.equal(labels.get(2), 'Chorus'); // repeats 3x → chorus
  assert.equal(labels.get(1), 'Verse'); // rarest+quiet stays verse
});

it('single cluster → Verse', () => {
  const labels = assignClusterLabels([{ id: 5, avgRms: 0.5, avgHfc: 0.5, count: 4 }], 0.5);
  assert.equal(labels.get(5), 'Verse');
});

it('two clusters → Verse + Chorus', () => {
  const labels = assignClusterLabels(
    [
      { id: 0, avgRms: 0.2, avgHfc: 0.2, count: 2 },
      { id: 1, avgRms: 0.8, avgHfc: 0.8, count: 1 },
    ],
    0,
  );
  assert.equal(labels.get(0), 'Verse');
  assert.equal(labels.get(1), 'Chorus');
});

it('empty input → empty map', () => {
  assert.equal(assignClusterLabels([], 0.5).size, 0);
});

it('weight is clamped to [0,1] (no crash on out-of-range)', () => {
  assert.doesNotThrow(() => assignClusterLabels(clusters, 5));
  assert.doesNotThrow(() => assignClusterLabels(clusters, -3));
});

console.log(`\nsection-labeling: ${passed} passed`);
