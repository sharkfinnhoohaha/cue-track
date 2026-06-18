/**
 * Corpus loading + the SEALED train/dev/test split.
 *
 * The split is the second anti-cheat defense (the grader is the first): the
 * tuning loop optimizes on `dev` and is structurally prevented from learning
 * the `test` set. Two properties make that hold:
 *
 *  - Deterministic, per-song assignment. A song's split is a hash of its id +
 *    a fixed seed, so a song NEVER migrates between splits across runs and you
 *    can't re-roll the dice to get an easier test set.
 *  - A test guard that caps how many times `test` may be scored. Overfitting to
 *    a held-out set happens by peeking at it repeatedly during search; the
 *    guard makes that visible and budgeted (default: a handful of evaluations).
 *
 * Corpus format: a directory with `manifest.json`:
 *   [{ "id": "song-001", "audio": "audio/song-001.mp3",
 *      "labels": "labels/song-001.sections.json", "source": "harmonix" }]
 * Each labels file is a Segmentation: { duration, segments:[{start,end,label}] }.
 * If there's no manifest, every `*.sections.json` is paired with an audio file
 * of the same basename.
 */
import { createHash } from 'crypto';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import type { Segmentation } from './grade';

export type SplitName = 'train' | 'dev' | 'test';

export interface CorpusEntry {
  id: string;
  audioPath: string;
  ref: Segmentation;
  source: string;
}

export interface SplitRatios {
  train: number;
  dev: number;
  test: number;
}

export const DEFAULT_RATIOS: SplitRatios = { train: 0.6, dev: 0.2, test: 0.2 };
export const DEFAULT_SEED = 'cue-track-sections-v1';

const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg'];

interface ManifestRow {
  id: string;
  audio: string;
  labels: string;
  source?: string;
}

function readSegmentation(path: string): Segmentation {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Segmentation;
  if (!Array.isArray(raw.segments) || typeof raw.duration !== 'number') {
    throw new Error(`Bad labels file (need {duration, segments[]}): ${path}`);
  }
  return raw;
}

/** Load every (audio, labels) pair in a corpus directory. */
export function loadCorpus(dir: string): CorpusEntry[] {
  const manifestPath = join(dir, 'manifest.json');
  if (existsSync(manifestPath)) {
    const rows = JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestRow[];
    return rows.map((r) => ({
      id: r.id,
      audioPath: join(dir, r.audio),
      ref: readSegmentation(join(dir, r.labels)),
      source: r.source ?? 'manifest',
    }));
  }
  // Scan fallback: pair *.sections.json with same-basename audio.
  const entries: CorpusEntry[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, name.name);
      if (name.isDirectory()) {
        walk(full);
      } else if (name.name.endsWith('.sections.json')) {
        const base = basename(name.name, '.sections.json');
        const audio = AUDIO_EXTS.map((e) => join(dirname(full), base + e)).find(existsSync);
        if (!audio) {
          console.warn(`[corpus] no audio for ${full}; skipping`);
          continue;
        }
        entries.push({ id: base, audioPath: audio, ref: readSegmentation(full), source: 'scan' });
      }
    }
  };
  walk(dir);
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

/** Deterministic, stable per-song split assignment. */
export function splitFor(
  id: string,
  ratios: SplitRatios = DEFAULT_RATIOS,
  seed: string = DEFAULT_SEED,
): SplitName {
  const h = createHash('sha256').update(`${seed}:${id}`).digest();
  // First 6 hex bytes → [0,1)
  const x = h.readUInt32BE(0) / 0xffffffff;
  if (x < ratios.train) return 'train';
  if (x < ratios.train + ratios.dev) return 'dev';
  return 'test';
}

export function partition(
  entries: CorpusEntry[],
  ratios: SplitRatios = DEFAULT_RATIOS,
  seed: string = DEFAULT_SEED,
): Record<SplitName, CorpusEntry[]> {
  const out: Record<SplitName, CorpusEntry[]> = { train: [], dev: [], test: [] };
  for (const e of entries) out[splitFor(e.id, ratios, seed)].push(e);
  return out;
}

/**
 * Guards the held-out test set against overfitting-by-peeking. The tuning loop
 * must route every test evaluation through `evaluate`, which counts uses and
 * throws once the budget is spent — so "just check test one more time" can't
 * silently become hill-climbing on test.
 */
export class TestSetGuard {
  private uses = 0;
  constructor(private readonly budget = 5) {}
  get used() {
    return this.uses;
  }
  get remaining() {
    return this.budget - this.uses;
  }
  evaluate<T>(fn: () => T): T {
    if (this.uses >= this.budget) {
      throw new Error(
        `Test set evaluation budget (${this.budget}) exhausted. Tuning on the ` +
          `test set is how you fake a 90%. Use the dev split for search.`,
      );
    }
    this.uses++;
    return fn();
  }
}
