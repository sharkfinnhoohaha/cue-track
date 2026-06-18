/**
 * Run the Foote detector over a corpus split and grade it.
 *
 *   npx tsx eval/sections/run-eval.ts --corpus <dir> --split dev
 *
 * The detector runs in a subprocess (services/audio-worker/scripts/detect-
 * sections.ts) so the worker's audio deps resolve in their own package, and so
 * the tuning loop can hand each trial a fresh process with different FOOTE_*
 * env vars. This module exports `runDetector` + `scoreEntries` for tune.ts.
 *
 * Grading the `test` split is gated behind --allow-test so you can't casually
 * tune against it; the loop routes test through corpus.ts's TestSetGuard.
 */
import { spawnSync } from 'child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadCorpus,
  partition,
  type CorpusEntry,
  type SplitName,
} from './corpus';
import { sectionsToSegmentation, type DetectorOutput } from './convert';
import { gradeSong, aggregate, type SongScore, type AggregateScore } from './grade';

const DETECT_CLI = 'services/audio-worker/scripts/detect-sections.ts';

/** Run the detector subprocess over `entries`, returning id -> DetectorOutput. */
export function runDetector(
  entries: CorpusEntry[],
  env: Record<string, string> = {},
): Map<string, DetectorOutput> {
  const dir = mkdtempSync(join(tmpdir(), 'cue-detect-'));
  const inputPath = join(dir, 'input.json');
  const outputPath = join(dir, 'output.json');
  writeFileSync(
    inputPath,
    JSON.stringify(entries.map((e) => ({ id: e.id, audioPath: e.audioPath }))),
  );
  const res = spawnSync(
    'npx',
    ['tsx', DETECT_CLI, '--input', inputPath, '--output', outputPath],
    { env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (res.status !== 0) {
    throw new Error(`detector subprocess failed (exit ${res.status}). Is the worker package installed?`);
  }
  const raw = JSON.parse(readFileSync(outputPath, 'utf8')) as Record<string, DetectorOutput>;
  return new Map(Object.entries(raw));
}

/** Grade detector outputs against each entry's reference labels. */
export function scoreEntries(
  entries: CorpusEntry[],
  preds: Map<string, DetectorOutput>,
): { perSong: { id: string; score: SongScore }[]; agg: AggregateScore } {
  const perSong = entries
    .filter((e) => preds.has(e.id))
    .map((e) => {
      const pred = sectionsToSegmentation(preds.get(e.id)!);
      return { id: e.id, score: gradeSong(e.ref, pred) };
    });
  return { perSong, agg: aggregate(perSong.map((p) => p.score)) };
}

/** Convenience: detect + score a split in one call (used by the tuner for dev). */
export function evaluateSplit(
  entries: CorpusEntry[],
  env: Record<string, string> = {},
): AggregateScore {
  return scoreEntries(entries, runDetector(entries, env)).agg;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] ?? 'true';
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpusDir = args.corpus;
  const split = (args.split ?? 'dev') as SplitName;
  if (!corpusDir) {
    console.error('Usage: tsx eval/sections/run-eval.ts --corpus <dir> --split dev|train|test');
    process.exit(2);
  }
  if (split === 'test' && args['allow-test'] !== 'true') {
    console.error('Refusing to grade the test split without --allow-test. Tune on dev.');
    process.exit(2);
  }

  const all = loadCorpus(corpusDir);
  const entries = partition(all)[split];
  if (entries.length === 0) {
    console.error(`No songs in the '${split}' split of ${corpusDir}.`);
    process.exit(1);
  }
  console.error(`Running Foote over ${entries.length} '${split}' songs…`);
  const { perSong, agg } = scoreEntries(entries, runDetector(entries));

  const worst = [...perSong].sort((a, b) => a.score.perSection - b.score.perSection).slice(0, 10);
  console.log(JSON.stringify({ split, aggregate: agg, worst10: worst }, null, 2));
  console.error(
    `\nHeadline (per-section): ${(agg.headline * 100).toFixed(1)}%  ` +
      `| frame ${(agg.meanFrameAccuracy * 100).toFixed(1)}%  ` +
      `| boundaryF@3s ${(agg.meanBoundaryF3 * 100).toFixed(1)}%  ` +
      `| flagged ${(agg.flaggedFraction * 100).toFixed(0)}%  ` +
      `| meetsTarget(${agg.target}): ${agg.meetsTarget}`,
  );
}

if (require.main === module) main();
