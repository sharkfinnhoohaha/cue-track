/**
 * Auto-label an audio folder with the allin1 "teacher" — no manual labeling.
 *
 *   ML_WORKER_URL=... ML_WORKER_SHARED_SECRET=... \
 *     npx tsx eval/sections/label-with-teacher.ts --audio <dir> --out corpus
 *
 * Runs the strong allin1 model (the deployed ML worker) over every audio file
 * and writes Cue Track corpus labels (labels/<id>.sections.json) + a
 * manifest.json, so you get a labeled corpus for free.
 *
 * These are SILVER labels (a model's output), not gold. Two safeguards:
 *  - Every teacher label is run through the structure checks; implausible ones
 *    ("7 verses", over-segmented) are listed as `review` so a human eyeballs
 *    the teacher itself before trusting it.
 *  - For the held-out TEST split you should replace a handful of these with
 *    human-corrected labels (the sealed test must be trustworthy). See HANDOFF.
 */
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, basename, relative, extname } from 'path';
import { runDetectorHttp, resolveWorker } from './detector-http';
import { sectionsToSegmentation } from './convert';
import { checkStructure } from './structure-checks';
import type { CorpusEntry } from './corpus';

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.mp4', '.flac', '.ogg']);

function scanAudio(dir: string): { id: string; audioPath: string }[] {
  const found: { id: string; audioPath: string }[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (AUDIO_EXTS.has(extname(name).toLowerCase())) {
        found.push({ id: basename(name, extname(name)), audioPath: full });
      }
    }
  };
  walk(dir);
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const audioDir = arg('audio');
  const outDir = arg('out', 'corpus')!;
  const which = (arg('detector', 'ml') as 'foote' | 'ml');
  if (!audioDir) {
    console.error('Usage: tsx eval/sections/label-with-teacher.ts --audio <dir> [--out corpus] [--detector ml]');
    process.exit(2);
  }
  const worker = resolveWorker(which);
  if (!worker.url) {
    console.error(`No worker URL — set ${which === 'ml' ? 'ML_WORKER_URL' : 'AUDIO_WORKER_URL'} (+ secret).`);
    process.exit(2);
  }

  const audio = scanAudio(audioDir);
  if (audio.length === 0) {
    console.error(`No audio files found under ${audioDir}.`);
    process.exit(1);
  }
  console.error(`Labeling ${audio.length} songs with the '${which}' teacher (this can take a while on cold start)…`);

  const entries: CorpusEntry[] = audio.map((a) => ({ ...a, ref: { segments: [], duration: 0 }, source: 'teacher' }));
  const preds = await runDetectorHttp(entries, worker);

  const labelsDir = join(outDir, 'labels');
  mkdirSync(labelsDir, { recursive: true });
  const manifest: { id: string; audio: string; labels: string; source: string }[] = [];
  const review: { id: string; issues: string[] }[] = [];

  for (const a of audio) {
    const pred = preds.get(a.id);
    if (!pred) {
      review.push({ id: a.id, issues: ['teacher produced no output'] });
      continue;
    }
    const seg = sectionsToSegmentation(pred);
    writeFileSync(join(labelsDir, `${a.id}.sections.json`), JSON.stringify(seg, null, 2));
    manifest.push({
      id: a.id,
      audio: relative(outDir, a.audioPath) || a.audioPath,
      labels: `labels/${a.id}.sections.json`,
      source: `${which}-teacher`,
    });
    const structure = checkStructure(seg);
    if (!structure.plausible) {
      review.push({ id: a.id, issues: structure.issues.filter((i) => i.severity === 'high').map((i) => i.message) });
    }
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ labeled: manifest.length, total: audio.length, review }, null, 2));
  console.error(
    `\nWrote ${manifest.length} teacher labels + manifest.json to ${outDir}. ` +
      `${review.length} look implausible — eyeball those before trusting the teacher (HANDOFF step 2).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
