/**
 * Text-to-Speech integration for Cue Track.
 * Two modes: Google Cloud TTS (production) and fallback tone synthesis (testing).
 */

import type { VoiceId } from './types';

// In-memory cache: keyed by "voiceId:text"
const ttsCache = new Map<string, Float32Array>();

/**
 * Clear the TTS cache. Useful for testing or memory management.
 */
export function clearTtsCache(): void {
  ttsCache.clear();
}

/**
 * Get the current cache size (for diagnostics).
 */
export function getTtsCacheSize(): number {
  return ttsCache.size;
}

/**
 * Check whether Google Cloud TTS credentials are available.
 */
function hasGoogleCredentials(): boolean {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_TTS_API_KEY
  );
}

/**
 * Synthesize speech for a given text and voice.
 * Uses Google Cloud TTS when credentials are available, otherwise falls back
 * to a simple tone-based substitute for testing.
 *
 * Results are cached by voiceId + text combination.
 *
 * @param text - The text to synthesize (e.g., "Verse", "Chorus", "4 bars")
 * @param voiceId - The TTS voice identifier
 * @returns Float32Array of PCM audio at 44100Hz
 */
export async function synthesizeSpeech(
  text: string,
  voiceId: string
): Promise<Float32Array> {
  const cacheKey = `${voiceId}:${text}`;

  const cached = ttsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let result: Float32Array;

  if (hasGoogleCredentials()) {
    result = await synthesizeWithGoogle(text, voiceId);
  } else {
    result = synthesizeFallback(text);
  }

  ttsCache.set(cacheKey, result);
  return result;
}

/**
 * Synthesize speech using Google Cloud Text-to-Speech API.
 * Requests LINEAR16 (raw PCM) audio at 44100Hz.
 */
async function synthesizeWithGoogle(
  text: string,
  voiceId: string
): Promise<Float32Array> {
  const sampleRate = 44100;

  // Determine if we use the API key path or the service account path
  if (process.env.GOOGLE_TTS_API_KEY) {
    return synthesizeWithGoogleRest(text, voiceId, sampleRate);
  }

  // Service account credentials path via @google-cloud/text-to-speech
  try {
    // Dynamic import to avoid bundling issues when the package is not installed
    const ttsModule = await import('@google-cloud/text-to-speech');
    const client = new ttsModule.TextToSpeechClient();

    const [response] = await client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: voiceId.substring(0, 5), // e.g., "en-US"
        name: voiceId,
      },
      audioConfig: {
        audioEncoding: 'LINEAR16' as const,
        sampleRateHertz: sampleRate,
      },
    });

    if (!response.audioContent) {
      throw new Error('Google TTS returned empty audio content');
    }

    const audioBuffer = Buffer.isBuffer(response.audioContent)
      ? response.audioContent
      : Buffer.from(response.audioContent as Uint8Array);

    return decodeLinear16(audioBuffer, sampleRate);
  } catch (err) {
    console.warn(
      `[CueTrack TTS] Google Cloud TTS client failed, falling back to REST API: ${(err as Error).message}`
    );
    // Try REST API as fallback
    return synthesizeWithGoogleRest(text, voiceId, sampleRate);
  }
}

/**
 * Synthesize speech using Google Cloud TTS REST API with API key.
 */
async function synthesizeWithGoogleRest(
  text: string,
  voiceId: string,
  sampleRate: number
): Promise<Float32Array> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_TTS_API_KEY not set');
  }

  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

  const body = {
    input: { text },
    voice: {
      languageCode: voiceId.substring(0, 5),
      name: voiceId,
    },
    audioConfig: {
      audioEncoding: 'LINEAR16',
      sampleRateHertz: sampleRate,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google TTS REST API error (${response.status}): ${errText}`);
  }

  const json = (await response.json()) as { audioContent?: string };

  if (!json.audioContent) {
    throw new Error('Google TTS REST API returned empty audioContent');
  }

  // audioContent is base64-encoded LINEAR16 PCM
  const audioBuffer = Buffer.from(json.audioContent, 'base64');
  return decodeLinear16(audioBuffer, sampleRate);
}

/**
 * Decode LINEAR16 (signed 16-bit PCM, little-endian) audio into Float32Array.
 * Google TTS LINEAR16 output has no WAV header; it is raw PCM bytes.
 */
function decodeLinear16(buffer: Buffer, _sampleRate: number): Float32Array {
  // LINEAR16 from Google TTS is raw signed 16-bit little-endian PCM, no header
  const numSamples = Math.floor(buffer.length / 2);
  const float32 = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const int16 = buffer.readInt16LE(i * 2);
    float32[i] = int16 / 32768;
  }

  return float32;
}

/**
 * Fallback tone synthesis when Google Cloud TTS is not available.
 * Generates a short recognizable tone pattern as a substitute for speech.
 *
 * Pattern:
 * - A brief 200ms "ding" tone at 330Hz with fast decay
 * - This serves as an audible cue marker for testing
 */
function synthesizeFallback(text: string): Float32Array {
  console.warn(
    `[CueTrack TTS] Fallback mode: generating tone substitute for "${text}". ` +
    'Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_TTS_API_KEY for real TTS.'
  );

  const sampleRate = 44100;
  const dingDuration = 0.200; // 200ms base ding
  const baseFreq = 330;

  // Vary the tone slightly based on text content to make different cues distinguishable
  const textHash = simpleHash(text);
  const freqOffset = (textHash % 5) * 40; // 0, 40, 80, 120, or 160 Hz offset
  const freq = baseFreq + freqOffset;

  // For count-in numbers, make a shorter, sharper tone
  const isCountIn = /^[1-9]$/.test(text.trim());
  const duration = isCountIn ? 0.100 : dingDuration;
  const toneFreq = isCountIn ? 660 + parseInt(text.trim(), 10) * 55 : freq;

  const numSamples = Math.round(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t / 0.06); // 60ms decay constant
    buffer[i] = 0.5 * envelope * Math.sin(2 * Math.PI * toneFreq * t);
  }

  return buffer;
}

/**
 * Simple string hash for consistent tone variation.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}
