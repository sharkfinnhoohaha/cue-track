/**
 * Click synthesis for Cue Track.
 * Generates punchy click samples as Float32Arrays at a given sample rate.
 */

import type { ClickSoundType } from './types.ts';

/**
 * Generate a click sample for the given sound type.
 *
 * @param type - The click sound type
 * @param isDownbeat - Whether this is a downbeat (louder, higher pitched)
 * @param sampleRate - Audio sample rate (typically 44100)
 * @returns Float32Array containing the click waveform
 */
export function generateClick(
  type: ClickSoundType,
  isDownbeat: boolean,
  sampleRate: number
): Float32Array {
  switch (type) {
    case 'classic':
      return generateClassic(isDownbeat, sampleRate);
    case 'woodblock':
      return generateWoodblock(isDownbeat, sampleRate);
    case 'rimshot':
      return generateRimshot(isDownbeat, sampleRate);
    case 'hi-hat':
      return generateHiHat(isDownbeat, sampleRate);
    default:
      return generateClassic(isDownbeat, sampleRate);
  }
}

/**
 * Classic click: pure sine tone with fast exponential decay.
 * Downbeat: 880Hz, 10ms, gain 1.0
 * Regular: 440Hz, 8ms, gain 0.7
 */
function generateClassic(isDownbeat: boolean, sampleRate: number): Float32Array {
  const freq = isDownbeat ? 880 : 440;
  const duration = isDownbeat ? 0.010 : 0.008;
  const gain = isDownbeat ? 1.0 : 0.7;
  const tau = 0.002; // exponential decay time constant

  const numSamples = Math.round(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t / tau);
    buffer[i] = gain * envelope * Math.sin(2 * Math.PI * freq * t);
  }

  return buffer;
}

/**
 * Woodblock: filtered noise burst with bandpass at 800Hz, 15ms decay.
 * Uses a state-variable bandpass filter for a woody, percussive tone.
 */
function generateWoodblock(isDownbeat: boolean, sampleRate: number): Float32Array {
  const gain = isDownbeat ? 1.0 : 0.7;
  const duration = 0.015;
  const centerFreq = isDownbeat ? 1000 : 800;
  const Q = 8; // narrow bandpass for tonal character

  const numSamples = Math.round(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  // Biquad bandpass filter coefficients
  const omega = (2 * Math.PI * centerFreq) / sampleRate;
  const sinOmega = Math.sin(omega);
  const cosOmega = Math.cos(omega);
  const alpha = sinOmega / (2 * Q);

  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosOmega;
  const a2 = 1 - alpha;

  // Normalize coefficients
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  // Filter state
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t / 0.004); // fast decay for percussive hit

    // White noise input
    const noise = (Math.random() * 2 - 1) * envelope;

    // Apply biquad bandpass
    const filtered = nb0 * noise + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;

    x2 = x1;
    x1 = noise;
    y2 = y1;
    y1 = filtered;

    buffer[i] = filtered;
  }

  // Normalize to unit peak, then apply gain
  let peak = 0;
  for (let i = 0; i < numSamples; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0) {
    for (let i = 0; i < numSamples; i++) {
      buffer[i] = (buffer[i] / peak) * gain;
    }
  }

  return buffer;
}

/**
 * Rimshot: white noise burst with high-pass filter at 1kHz.
 * 5ms attack, 20ms total decay. Crisp, cutting sound.
 */
function generateRimshot(isDownbeat: boolean, sampleRate: number): Float32Array {
  const gain = isDownbeat ? 1.0 : 0.7;
  const duration = 0.020;
  const attackTime = 0.005;
  const cutoffHz = isDownbeat ? 1200 : 1000;

  const numSamples = Math.round(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  // HPF biquad coefficients (second-order Butterworth)
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

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // Attack-decay envelope
    const attackSamples = Math.round(attackTime * sampleRate);
    let envelope: number;
    if (i < attackSamples) {
      envelope = i / attackSamples; // linear attack
    } else {
      envelope = Math.exp(-(t - attackTime) / 0.005); // fast decay after attack
    }

    // White noise input
    const noise = (Math.random() * 2 - 1) * envelope;

    // Apply HPF biquad
    const filtered = nb0 * noise + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;

    x2 = x1;
    x1 = noise;
    y2 = y1;
    y1 = filtered;

    buffer[i] = gain * filtered;
  }

  return buffer;
}

/**
 * Hi-hat: white noise with high-pass filter at 5kHz, very short 8ms decay.
 * Bright, sizzly character ideal for fast tempos.
 */
function generateHiHat(isDownbeat: boolean, sampleRate: number): Float32Array {
  const gain = isDownbeat ? 1.0 : 0.7;
  const duration = 0.008;
  const cutoffHz = isDownbeat ? 6000 : 5000;

  const numSamples = Math.round(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  // HPF biquad coefficients (second-order Butterworth)
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const sinOmega = Math.sin(omega);
  const cosOmega = Math.cos(omega);
  const alpha = sinOmega / (2 * Math.SQRT1_2);

  const b0 = (1 + cosOmega) / 2;
  const b1 = -(1 + cosOmega);
  const b2 = (1 + cosOmega) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosOmega;
  const a2 = 1 - alpha;

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t / 0.002); // very fast decay

    const noise = (Math.random() * 2 - 1) * envelope;

    const filtered = nb0 * noise + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;

    x2 = x1;
    x1 = noise;
    y2 = y1;
    y1 = filtered;

    buffer[i] = gain * filtered;
  }

  return buffer;
}
