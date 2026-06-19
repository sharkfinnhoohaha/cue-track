/**
 * Offline section-detection CLI for the eval/tuning harness.
 *
 *   npx tsx services/audio-worker/scripts/detect-sections.ts \
 *     --input <list.json> --output <preds.json>
 *
 * `list.json` is [{ id, audioPath }]. Output is { id: { bpm, duration,
 * suggestedSections } } — the detector's native result, which the eval side
 * converts to a time-domain segmentation and grades.
 *
 * Lives in the worker package so it can import footeAnalyze and its audio deps
 * directly. Reads the FOOTE_* env vars (see foote-analyze.ts) so the tuning
 * loop can sweep parameters by spawning this with different env per trial.
 */
import { readFileSync, writeFileSync } from 'fs';
import { extname } from 'path';
import { footeAnalyze } from '../lib/audio/foote-analyze.ts';

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.ogg') return 'audio/ogg';
  return 'application/octet-stream';
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const inputPath = arg('input');
  const outputPath = arg('output');
  if (!inputPath || !outputPath) {
    console.error('Usage: detect-sections.ts --input <list.json> --output <preds.json>');
    process.exit(2);
  }
  const list = JSON.parse(readFileSync(inputPath, 'utf8')) as { id: string; audioPath: string }[];
  const out: Record<string, { bpm: number; duration: number; suggestedSections: unknown }> = {};

  for (const { id, audioPath } of list) {
    try {
      const bytes = readFileSync(audioPath);
      const res = await footeAnalyze(bytes, mimeFor(audioPath));
      out[id] = {
        bpm: res.bpm,
        duration: res.duration,
        suggestedSections: res.suggestedSections,
      };
    } catch (err) {
      console.error(`[detect-sections] ${id} failed:`, err instanceof Error ? err.message : err);
    }
  }

  writeFileSync(outputPath, JSON.stringify(out));
  console.error(`[detect-sections] wrote ${Object.keys(out).length}/${list.length} predictions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
