/**
 * Run a detector over a corpus split and grade it.
 *
 *   # offline Foote detector (env-tunable, used by tune.ts):
 *   npx tsx eval/sections/run-eval.ts --corpus <dir> --split dev
 *
 *   # a DEPLOYED worker (cloud-native — Foote OR allin1, no local deps):
 *   npx tsx eval/sections/run-eval.ts --corpus <dir> --split dev --via http --detector ml
 *
 * The default runs the detector in a subprocess (services/audio-worker/scripts/
 * detect-sections.ts) so the worker's audio deps resolve in their own package,
 * and so the tuning loop can hand each trial a fresh process with different
 * FOOTE_* env vars. With `--via http` it instead POSTs audio to a deployed
 * worker, so the whole measurement is just HTTP + grading and needs no local
 * deps. Exports `runDetector` + `scoreEntries` for tune.ts.
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
import { runDetectorHttp, resolveWorker } from './detector-http';
import { checkStructure, type StructureReport } from './structure-checks';
import { applyStructuralConstraints } from './structure-postprocess';
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

export interface ScoreOptions {
  /** apply the conservative structural constraints before grading (A/B test) */
  postprocess?: boolean;
  minSectionSec?: number;
}

export interface ScoredSong {
  id: string;
  score: SongScore;
  /** structural plausibility — a sanity signal, NOT part of the accuracy score */
  structure: StructureReport;
}

/** Grade detector outputs against each entry's reference labels. */
export function scoreEntries(
  entries: CorpusEntry[],
  preds: Map<string, DetectorOutput>,
  opts: ScoreOptions = {},
): { perSong: ScoredSong[]; agg: AggregateScore; implausibleFraction: number } {
  const perSong: ScoredSong[] = entries
    .filter((e) => preds.has(e.id))
    .map((e) => {
      let pred = sectionsToSegmentation(preds.get(e.id)!);
      if (opts.postprocess) {
        pred = applyStructuralConstraints(pred, { minSectionSec: opts.minSectionSec });
      }
      return { id: e.id, score: gradeSong(e.ref, pred), structure: checkStructure(pred) };
    });
  const implausibleFraction = perSong.length
    ? perSong.filter((p) => !p.structure.plausible).length / perSong.length
    : 0;
  return { perSong, agg: aggregate(perSong.map((p) => p.score)), implausibleFraction };
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpusDir = args.corpus;
  const split = (args.split ?? 'dev') as SplitName;
  if (!corpusDir) {
    console.error('Usage: tsx eval/sections/run-eval.ts --corpus <dir> --split dev|train|test [--via http --detector ml|foote]');
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

  const via = args.via ?? 'foote-cli';
  let preds: Map<string, DetectorOutput>;
  if (via === 'http') {
    const which = (args.detector ?? 'ml') as 'foote' | 'ml';
    console.error(`Scoring DEPLOYED '${which}' worker over ${entries.length} '${split}' songs…`);
    preds = await runDetectorHttp(entries, resolveWorker(which));
  } else {
    console.error(`Running offline Foote over ${entries.length} '${split}' songs…`);
    preds = runDetector(entries);
  }
  const postprocess = args.postprocess === 'true';
  const minSectionSec = args['min-section'] ? Number(args['min-section']) : undefined;
  const { perSong, agg, implausibleFraction } = scoreEntries(entries, preds, { postprocess, minSectionSec });

  // Surface the structurally-implausible songs first — these are the "7 verses"
  // class of error you can act on without any labels.
  const implausible = perSong
    .filter((p) => !p.structure.plausible)
    .map((p) => ({
      id: p.id,
      issues: p.structure.issues.filter((i) => i.severity === 'high').map((i) => i.message),
    }));
  const worst = [...perSong].sort((a, b) => a.score.perSection - b.score.perSection).slice(0, 10);
  console.log(
    JSON.stringify({ split, via, postprocess, aggregate: agg, implausibleFraction, implausible, worst10: worst }, null, 2),
  );
  console.error(
    `\nHeadline (per-section): ${(agg.headline * 100).toFixed(1)}%  ` +
      `| frame ${(agg.meanFrameAccuracy * 100).toFixed(1)}%  ` +
      `| boundaryF@3s ${(agg.meanBoundaryF3 * 100).toFixed(1)}%  ` +
      `| implausible ${(implausibleFraction * 100).toFixed(0)}%  ` +
      `| meetsTarget(${agg.target}): ${agg.meetsTarget}`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
