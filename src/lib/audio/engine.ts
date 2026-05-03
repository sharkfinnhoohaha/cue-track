/**
 * Main orchestrator for the Cue Track audio engine.
 * Coordinates grid building, click synthesis, TTS, mixing, and encoding
 * to produce complete click/cue tracks for live musicians.
 */

import type { SongSpec, RenderResult } from './types';
import { DEFAULT_SAMPLE_RATE } from './types';
import { generateClick } from './click';
import { buildTimeGrid } from './grid';
import { synthesizeSpeech } from './tts';
import { mixTrack } from './mixer';
import { encodeWav, encodeMp3 } from './encoder';

/**
 * Render a complete click/cue track from a song specification.
 *
 * Flow:
 * 1. Build time grid from spec (beat positions + cue events)
 * 2. Generate click samples for the chosen sound type
 * 3. Collect all unique cue texts and synthesize speech for each
 * 4. Mix everything into a stereo buffer
 * 5. Encode to the requested format (WAV or MP3)
 * 6. Generate a 15-second preview with fade-out
 * 7. Return RenderResult with both buffers and metadata
 *
 * @param spec - The complete song specification
 * @returns RenderResult containing full track buffer, preview buffer, and metadata
 */
export async function renderTrack(spec: SongSpec): Promise<RenderResult> {
  const sampleRate = DEFAULT_SAMPLE_RATE;

  // Step 1: Build time grid
  const grid = buildTimeGrid(spec, sampleRate);

  // Step 2: Generate click samples
  const downbeatClick = generateClick(spec.clickSound, true, sampleRate);
  const regularClick = generateClick(spec.clickSound, false, sampleRate);

  // Step 3: Collect unique cue texts and synthesize speech
  const cueSamples = new Map<string, Float32Array>();
  const uniqueTexts = new Set<string>();

  for (const cue of grid.cues) {
    uniqueTexts.add(cue.text);
  }

  // Synthesize all unique texts in parallel for performance
  const synthesisEntries = Array.from(uniqueTexts);
  const synthesisResults = await Promise.all(
    synthesisEntries.map(async (text) => {
      const audio = await synthesizeSpeech(text, spec.voiceId);
      return { text, audio };
    })
  );

  for (const { text, audio } of synthesisResults) {
    cueSamples.set(text, audio);
  }

  // Step 4: Mix everything together
  const stereoBuffer = mixTrack({
    grid,
    clickSamples: { downbeat: downbeatClick, regular: regularClick },
    cueSamples,
    sampleRate,
    clickGainDb: 0,    // clicks at reference level
    cueGainDb: -6,     // TTS cues at -6dB
  });

  // Step 5: Encode full track
  const encode = spec.format === 'mp3' ? encodeMp3 : encodeWav;
  const fullTrack = encode(stereoBuffer, sampleRate, 2);

  // Step 6: Generate preview (first 15 seconds with 0.5s fade-out)
  const preview = generatePreview(stereoBuffer, sampleRate, spec.format);

  // Step 7: Return result
  return {
    fullTrack,
    preview,
    format: spec.format,
    duration: grid.totalDuration,
    sampleRate,
    spec,
  };
}

/**
 * Render only a 15-second preview of the track.
 * Same pipeline as renderTrack but only returns the preview buffer.
 * Useful for the free preview feature to avoid encoding the full track.
 *
 * @param spec - The complete song specification
 * @returns Buffer containing the encoded preview audio
 */
export async function renderPreviewOnly(spec: SongSpec): Promise<Buffer> {
  const sampleRate = DEFAULT_SAMPLE_RATE;

  // Build time grid
  const grid = buildTimeGrid(spec, sampleRate);

  // Generate click samples
  const downbeatClick = generateClick(spec.clickSound, true, sampleRate);
  const regularClick = generateClick(spec.clickSound, false, sampleRate);

  // Synthesize speech for cues
  const cueSamples = new Map<string, Float32Array>();
  const uniqueTexts = new Set<string>();

  for (const cue of grid.cues) {
    uniqueTexts.add(cue.text);
  }

  const synthesisEntries = Array.from(uniqueTexts);
  const synthesisResults = await Promise.all(
    synthesisEntries.map(async (text) => {
      const audio = await synthesizeSpeech(text, spec.voiceId);
      return { text, audio };
    })
  );

  for (const { text, audio } of synthesisResults) {
    cueSamples.set(text, audio);
  }

  // Mix
  const stereoBuffer = mixTrack({
    grid,
    clickSamples: { downbeat: downbeatClick, regular: regularClick },
    cueSamples,
    sampleRate,
    clickGainDb: 0,
    cueGainDb: -6,
  });

  // Generate and return only the preview
  return generatePreview(stereoBuffer, sampleRate, spec.format);
}

/**
 * Extract the first 15 seconds of a stereo buffer and apply a 0.5s fade-out
 * at the end. Encodes to the requested format.
 *
 * @param stereoBuffer - Full interleaved stereo buffer
 * @param sampleRate - Audio sample rate
 * @param format - Output format ('wav' or 'mp3')
 * @returns Encoded preview buffer
 */
function generatePreview(
  stereoBuffer: Float32Array,
  sampleRate: number,
  format: 'wav' | 'mp3'
): Buffer {
  const previewDurationSec = 15;
  const fadeOutDurationSec = 0.5;

  const previewFrames = Math.min(
    Math.round(sampleRate * previewDurationSec),
    Math.floor(stereoBuffer.length / 2) // total frames in stereo buffer
  );

  const previewStereoLength = previewFrames * 2;
  const previewBuffer = new Float32Array(previewStereoLength);

  // Copy the preview portion
  for (let i = 0; i < previewStereoLength; i++) {
    previewBuffer[i] = stereoBuffer[i];
  }

  // Apply fade-out at the end
  const fadeOutFrames = Math.round(sampleRate * fadeOutDurationSec);
  const fadeStartFrame = previewFrames - fadeOutFrames;

  if (fadeStartFrame > 0) {
    for (let frame = fadeStartFrame; frame < previewFrames; frame++) {
      const fadeProgress = (frame - fadeStartFrame) / fadeOutFrames; // 0 to 1
      const gain = 1.0 - fadeProgress; // linear fade from 1 to 0

      const stereoIdx = frame * 2;
      previewBuffer[stereoIdx] *= gain;       // Left
      previewBuffer[stereoIdx + 1] *= gain;   // Right
    }
  }

  // Encode
  const encode = format === 'mp3' ? encodeMp3 : encodeWav;
  return encode(previewBuffer, sampleRate, 2);
}
