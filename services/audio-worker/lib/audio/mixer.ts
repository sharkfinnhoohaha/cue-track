/**
 * Audio mixing and DSP for Cue Track.
 * Mixes click track and voice cues into a single stereo buffer with
 * high-pass filtering, gain control, and limiting.
 */

import type { MixParams, TimeGrid } from './types.ts';

/**
 * Second-order Butterworth high-pass filter.
 * Used to filter TTS audio at 200Hz, keeping voice clear in IEMs
 * without muddying the click track.
 *
 * @param samples - Input audio samples
 * @param cutoffHz - Filter cutoff frequency in Hz
 * @param sampleRate - Audio sample rate
 * @returns New Float32Array with filtered audio
 */
export function highPassFilter(
  samples: Float32Array,
  cutoffHz: number,
  sampleRate: number
): Float32Array {
  const output = new Float32Array(samples.length);

  // Second-order Butterworth HPF biquad coefficients
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const sinOmega = Math.sin(omega);
  const cosOmega = Math.cos(omega);
  const alpha = sinOmega / (2 * Math.SQRT1_2); // Q = 1/sqrt(2) for Butterworth

  const b0 = (1 + cosOmega) / 2;
  const b1 = -(1 + cosOmega);
  const b2 = (1 + cosOmega) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosOmega;
  const a2 = 1 - alpha;

  // Normalize
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  // Filter state
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;

    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;

    output[i] = y0;
  }

  return output;
}

/**
 * Apply gain in decibels to audio samples.
 *
 * @param samples - Input audio samples
 * @param gainDb - Gain in decibels (0 = unity, -6 = half amplitude)
 * @returns New Float32Array with gain applied
 */
export function applyGain(
  samples: Float32Array,
  gainDb: number
): Float32Array {
  const linearGain = Math.pow(10, gainDb / 20);
  const output = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    output[i] = samples[i] * linearGain;
  }

  return output;
}

/**
 * Mix a mono source into an interleaved stereo buffer at a given sample offset.
 * Uses additive mixing (sums into existing buffer content).
 *
 * @param stereoBuffer - The target interleaved stereo buffer (L,R,L,R,...)
 * @param monoSource - The mono audio to mix in
 * @param totalStereoLength - Total length of the stereo buffer in frames (not samples)
 * @param offsetSamples - Frame offset at which to start placing the mono audio
 */
export function mixToStereo(
  stereoBuffer: Float32Array,
  monoSource: Float32Array,
  totalStereoLength: number,
  offsetSamples: number
): void {
  for (let i = 0; i < monoSource.length; i++) {
    const frameIndex = offsetSamples + i;
    if (frameIndex >= totalStereoLength) break;

    const stereoIndex = frameIndex * 2; // interleaved: L at even, R at odd
    const sample = monoSource[i];

    // Sum into both channels (center pan)
    stereoBuffer[stereoIndex] += sample;       // Left
    stereoBuffer[stereoIndex + 1] += sample;   // Right
  }
}

/**
 * Soft-clip limiter. Applies tanh-based soft clipping to prevent harsh digital clipping.
 * Only engages when the signal exceeds the threshold.
 *
 * @param sample - Input sample value
 * @param threshold - Threshold above which soft clipping engages (e.g., 0.95)
 * @returns Soft-clipped sample value
 */
function softClip(sample: number, threshold: number): number {
  if (Math.abs(sample) <= threshold) {
    return sample;
  }
  const sign = sample > 0 ? 1 : -1;
  const excess = Math.abs(sample) - threshold;
  const headroom = 1.0 - threshold;
  // Map excess through tanh curve, scaled to remaining headroom
  return sign * (threshold + headroom * Math.tanh(excess / headroom));
}

/**
 * Mix click track and voice cues into a single interleaved stereo buffer.
 *
 * Process:
 * 1. Create stereo output buffer
 * 2. Place click samples at every beat position from the grid
 * 3. For each cue event, apply HPF + gain, then place at cue's sample position
 * 4. Normalize: find peak, if > 0.95 apply soft-clip limiter
 * 5. Return interleaved stereo Float32Array
 *
 * @param params - Mix parameters including grid, samples, and gain settings
 * @returns Interleaved stereo Float32Array (L,R,L,R,...)
 */
export function mixTrack(params: MixParams): Float32Array {
  const {
    grid,
    clickSamples,
    cueSamples,
    sampleRate,
    clickGainDb,
    cueGainDb,
  } = params;

  const totalFrames = grid.totalSamples;
  // Interleaved stereo: 2 values per frame (L, R)
  const stereoBuffer = new Float32Array(totalFrames * 2);

  // Pre-process click samples with gain
  const downbeatClick = applyGain(clickSamples.downbeat, clickGainDb);
  const regularClick = applyGain(clickSamples.regular, clickGainDb);

  // Place click samples at every beat position
  for (const beat of grid.beats) {
    const clickSource = beat.isDownbeat ? downbeatClick : regularClick;
    mixToStereo(stereoBuffer, clickSource, totalFrames, beat.sampleIndex);
  }

  // Process and place cue samples
  for (const cue of grid.cues) {
    const rawCueSample = cueSamples.get(cue.text);
    if (!rawCueSample) continue;

    // Apply high-pass filter at 200Hz to keep cue voice clear
    const filtered = highPassFilter(rawCueSample, 200, sampleRate);

    // Apply cue gain
    const gained = applyGain(filtered, cueGainDb);

    // Place in stereo buffer
    mixToStereo(stereoBuffer, gained, totalFrames, cue.sampleIndex);
  }

  // Normalize and limit
  normalizeStereoBuffer(stereoBuffer);

  return stereoBuffer;
}

/**
 * Find peak amplitude and apply soft-clip limiting if peak exceeds 0.95.
 * Modifies the buffer in place.
 */
function normalizeStereoBuffer(stereoBuffer: Float32Array): void {
  // Find peak
  let peak = 0;
  for (let i = 0; i < stereoBuffer.length; i++) {
    const abs = Math.abs(stereoBuffer[i]);
    if (abs > peak) {
      peak = abs;
    }
  }

  if (peak <= 0.95) {
    // No limiting needed
    return;
  }

  // Apply soft-clip limiter to the entire buffer
  for (let i = 0; i < stereoBuffer.length; i++) {
    stereoBuffer[i] = softClip(stereoBuffer[i], 0.95);
  }
}
