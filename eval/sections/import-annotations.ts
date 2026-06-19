/**
 * Convert public structure-annotation datasets into the corpus labels format.
 *
 *   npx tsx eval/sections/import-annotations.ts \
 *     --in <annotations-dir> --out <corpus-dir> --format harmonix --duration-from audio
 *
 * Handles the common "boundary list" annotation layout used by the Harmonix
 * Set and SALAMI function files: one line per boundary, `<seconds> <label>`
 * (tab- or space-separated). Each line opens a segment that ends at the next
 * line's time (last segment ends at the track duration).
 *
 * IMPORTANT — audio is on you. These datasets ship ANNOTATIONS, not audio
 * (Billboard/commercial tracks can't be redistributed). You supply the audio
 * (your own copies), name each file to match its annotation id, and this tool
 * writes the labels; loadCorpus() pairs them. See README.md.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'fs';
import { join, basename, extname } from 'path';
import type { Segmentation, Segment } from './grade';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

interface Boundary {
  time: number;
  label: string;
}

/** Parse one annotation file of `<seconds><sep><label>` lines. */
function parseBoundaryFile(path: string): Boundary[] {
  const out: Boundary[] = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)[\s,]+(.+)$/);
    if (!m) continue;
    out.push({ time: parseFloat(m[1]), label: m[2].trim() });
  }
  return out.sort((a, b) => a.time - b.time);
}

function boundariesToSegmentation(bs: Boundary[], duration: number): Segmentation {
  const segments: Segment[] = [];
  for (let i = 0; i < bs.length; i++) {
    const start = bs[i].time;
    const end = i + 1 < bs.length ? bs[i + 1].time : duration;
    if (end <= start) continue;
    // A trailing "End"/"Silence" boundary is a terminator, not a section.
    if (/^(end|silence|z)$/i.test(bs[i].label) && i === bs.length - 1) continue;
    segments.push({ start, end, label: bs[i].label });
  }
  return { segments, duration: segments.length ? segments[segments.length - 1].end : duration };
}

const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg'];

function findAudio(audioDir: string | undefined, id: string): string | undefined {
  if (!audioDir) return undefined;
  return AUDIO_EXTS.map((e) => join(audioDir, id + e)).find(existsSync);
}

function audioDuration(path: string): number | undefined {
  // Cheap WAV-only duration from the header; otherwise the caller must rely on
  // the last annotation boundary. (Keeping this dependency-free on purpose.)
  if (extname(path).toLowerCase() !== '.wav') return undefined;
  try {
    const buf = readFileSync(path);
    const byteRate = buf.readUInt32LE(28);
    const dataSize = buf.readUInt32LE(40);
    return byteRate > 0 ? dataSize / byteRate : undefined;
  } catch {
    return undefined;
  }
}

function main() {
  const inDir = arg('in');
  const outDir = arg('out');
  const audioDir = arg('audio');
  const source = arg('format', 'public')!;
  if (!inDir || !outDir) {
    console.error('Usage: tsx eval/sections/import-annotations.ts --in <dir> --out <corpus> [--audio <dir>] [--format harmonix|salami]');
    process.exit(2);
  }
  const labelsDir = join(outDir, 'labels');
  mkdirSync(labelsDir, { recursive: true });

  const manifest: { id: string; audio: string; labels: string; source: string }[] = [];
  let written = 0;

  const files: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(txt|lab|csv|tsv)$/i.test(name)) files.push(full);
    }
  };
  walk(inDir);

  for (const f of files) {
    const id = basename(f).replace(/\.[^.]+$/, '');
    const bs = parseBoundaryFile(f);
    if (bs.length < 2) continue;
    const audio = findAudio(audioDir, id);
    const duration: number = (audio ? audioDuration(audio) : undefined) ?? bs[bs.length - 1].time;
    const seg = boundariesToSegmentation(bs, duration);
    if (seg.segments.length === 0) continue;

    writeFileSync(join(labelsDir, `${id}.sections.json`), JSON.stringify(seg, null, 2));
    written++;
    manifest.push({
      id,
      audio: audio ? `audio/${basename(audio)}` : `audio/${id}.wav`,
      labels: `labels/${id}.sections.json`,
      source,
    });
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.error(
    `Wrote ${written} label files + manifest.json to ${outDir}. ` +
      `Drop matching audio into ${join(outDir, 'audio')}/ (named <id>.<ext>) to complete the corpus.`,
  );
}

if (require.main === module) main();
