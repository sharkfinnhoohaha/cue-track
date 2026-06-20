/**
 * Autonomous section-detector tuning loop. Run it for a few hours; it searches
 * the Foote parameter space for a config that hits the accuracy target —
 * honestly.
 *
 *   npx tsx eval/sections/tune.ts --corpus <dir> --minutes 180 --target 0.9
 *
 * Anti-cheat by construction:
 *  - It optimizes on the DEV split only. It never tunes on TEST.
 *  - TEST is scored only through a TestSetGuard with a small budget, and only
 *    to validate the current dev-best — so the loop can't hill-climb on test.
 *  - "Success" requires the DEV-selected config to clear the target on TEST AND
 *    pass the grader's degeneracy guards (see grade.ts). A config that games a
 *    single metric trips a guard and is rejected.
 *  - It reports the dev→test gap. A large gap = overfitting to dev, i.e. NOT
 *    actually accurate, and the loop says so instead of declaring victory.
 *
 * For deeper, code-level improvements beyond these knobs (new features, a
 * repetition-based chorus labeler, etc.), drive an agentic loop with the
 * `/loop` skill using this same grader as the gate — see README.md.
 */
import { appendFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { loadCorpus, partition, TestSetGuard, type CorpusEntry } from './corpus';
import { evaluateSplit } from './run-eval';
import type { AggregateScore } from './grade';

// Search space. Each entry is [min, max, integer?]. Defaults (foote-analyze.ts)
// sit inside these ranges, so the search includes "do nothing".
const SPACE: Record<string, [number, number, boolean]> = {
  FOOTE_PEAK_THRESHOLD_K: [1.5, 4.5, false],
  FOOTE_KERNEL_SIZE: [32, 128, true],
  FOOTE_MEL_BANDS: [24, 64, true],
  FOOTE_CLUSTER_SIM_THRESHOLD: [0.7, 0.92, false],
  FOOTE_MIN_GAP_BARS_SLOW: [4, 8, true],
  FOOTE_MIN_GAP_BARS_FAST: [6, 12, true],
  // Repetition-aware chorus labeling: 0 = legacy energy-only, 1 = pure
  // repetition. Sweeping this is the fix for "everything is a verse".
  FOOTE_REPETITION_WEIGHT: [0, 1, false],
};

function sampleConfig(rng: () => number): Record<string, string> {
  const cfg: Record<string, string> = {};
  for (const [k, [lo, hi, isInt]] of Object.entries(SPACE)) {
    const v = lo + rng() * (hi - lo);
    cfg[k] = isInt ? String(Math.round(v)) : v.toFixed(3);
  }
  return cfg;
}

// Deterministic RNG so a run is reproducible (mulberry32).
function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

interface Trial {
  n: number;
  config: Record<string, string>;
  dev: AggregateScore;
  isBest: boolean;
  test?: AggregateScore;
}

function main() {
  const corpusDir = arg('corpus');
  if (!corpusDir) {
    console.error('Usage: tsx eval/sections/tune.ts --corpus <dir> [--minutes 180] [--target 0.9] [--seed 1]');
    process.exit(2);
  }
  const minutes = Number(arg('minutes', '180'));
  const target = Number(arg('target', '0.9'));
  const rng = rngFrom(Number(arg('seed', '1')));

  const all = loadCorpus(corpusDir);
  const parts = partition(all);
  const dev = parts.dev;
  const test = parts.test;
  if (dev.length === 0 || test.length === 0) {
    console.error(`Need non-empty dev (${dev.length}) and test (${test.length}) splits.`);
    process.exit(1);
  }

  const outDir = join('eval', 'sections', 'runs');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = join(outDir, `tune-${stamp}.jsonl`);
  const bestPath = join(outDir, `best-${stamp}.json`);
  const testGuard = new TestSetGuard(8);

  const deadline = Date.now() + minutes * 60_000;
  let best: Trial | null = null;
  let n = 0;

  console.error(
    `Tuning on ${dev.length} dev songs, validating on ${test.length} test songs. ` +
      `Budget: ${minutes} min, target ${target}. Log: ${logPath}`,
  );

  // Trial 0 = the production defaults (empty env override), so we always know
  // whether any change actually beat the baseline.
  const runTrial = (config: Record<string, string>): Trial => {
    const dev = evaluateSplit(parts.dev, config);
    return { n: n++, config, dev, isBest: false };
  };

  const baseline = runTrial({});
  best = { ...baseline, isBest: true };
  appendFileSync(logPath, JSON.stringify({ kind: 'baseline', ...baseline }) + '\n');
  console.error(`baseline dev headline ${(baseline.dev.headline * 100).toFixed(1)}%`);

  while (Date.now() < deadline) {
    const config = sampleConfig(rng);
    const trial = runTrial(config);
    const improved = trial.dev.headline > best!.dev.headline && trial.dev.flaggedFraction <= 0.1;
    trial.isBest = improved;
    appendFileSync(logPath, JSON.stringify({ kind: 'trial', ...trial }) + '\n');

    if (improved) {
      best = trial;
      console.error(
        `#${trial.n} NEW BEST dev ${(trial.dev.headline * 100).toFixed(1)}% — validating on test…`,
      );
      // Validate the new dev-best on the sealed test set (budgeted).
      try {
        const testScore = testGuard.evaluate(() => evaluateSplit(parts.test, config));
        best.test = testScore;
        appendFileSync(
          logPath,
          JSON.stringify({ kind: 'test-validation', n: trial.n, config, test: testScore }) + '\n',
        );
        const gap = trial.dev.headline - testScore.headline;
        console.error(
          `   test ${(testScore.headline * 100).toFixed(1)}%  (dev→test gap ${(gap * 100).toFixed(1)}pts)  ` +
            `meetsTarget: ${testScore.meetsTarget}`,
        );
        writeBest(bestPath, best, target);
        if (testScore.meetsTarget && testScore.headline >= target) {
          console.error(`\n✅ Hit target on the held-out TEST set. Config written to ${bestPath}`);
          return;
        }
      } catch (e) {
        console.error(`   test budget exhausted: ${(e as Error).message}`);
      }
    }
  }

  console.error(`\n⏱  Time budget reached after ${n} trials. Best config → ${bestPath}`);
  if (best) writeBest(bestPath, best, target);
}

function writeBest(path: string, best: Trial, target: number) {
  writeFileSync(
    path,
    JSON.stringify(
      {
        config: best.config,
        dev: best.dev,
        test: best.test ?? null,
        target,
        honest_summary: best.test
          ? best.test.meetsTarget && best.test.headline >= target
            ? `PASS: ${(best.test.headline * 100).toFixed(1)}% on held-out test, guards clean.`
            : `NOT YET: dev ${(best.dev.headline * 100).toFixed(1)}% but test ${(best.test.headline * 100).toFixed(1)}% (or guards tripped).`
          : 'No test validation yet.',
      },
      null,
      2,
    ),
  );
}

if (require.main === module) main();
