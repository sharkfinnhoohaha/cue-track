import type { Segmentation, Segment } from './grade';

export interface RawSection {
  id?: string;
  name: string;
  bars: number;
}

export interface DetectorOutput {
  bpm: number;
  duration: number;
  suggestedSections: RawSection[];
}

/**
 * Convert a detector's native output (sections measured in BARS at a detected
 * BPM) into a time-domain Segmentation for grading. This mirrors the worker's
 * own bar math (secondsPerBar = 240 / max(bpm,30), 4/4), so the grade reflects
 * exactly what a user hears — including the failure mode where a wrong (e.g.
 * octave-off) BPM misplaces every boundary.
 */
export function sectionsToSegmentation(out: DetectorOutput): Segmentation {
  const secondsPerBar = 240 / Math.max(out.bpm, 30);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const s of out.suggestedSections) {
    const start = cursor;
    const end = start + Math.max(0, s.bars) * secondsPerBar;
    segments.push({ start, end, label: s.name });
    cursor = end;
  }
  // Clamp the final boundary to the true duration so the timeline matches the
  // reference (don't let bar-rounding extend or truncate the song).
  if (segments.length > 0) {
    segments[segments.length - 1].end = out.duration;
  }
  return { segments, duration: out.duration };
}
