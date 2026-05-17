/**
 * Text-to-Speech integration for Cue Track.
 * Two modes: Google Cloud TTS (production) and fallback tone synthesis (testing).
 *
 * Caching is two-tier:
 * 1. In-process Map keyed by "voiceId:text" (hot path, evaporates on cold start)
 * 2. Postgres tts_cache table keyed by "voiceId:sha256(text)" (warm cross
 *    cold-start; see scripts/migrations/2026-05-17b_add_tts_cache.sql)
 *
 * On a miss in tier 1, we consult tier 2 before paying for a live TTS call.
 * On a miss in both, we synthesize, then populate both tiers. Tier 2 writes
 * are best-effort: DB errors are logged and swallowed so the synthesis path
 * never fails on a cache write.
 */

import type { VoiceId } from './types';
import { createHash } from 'node:crypto';

const ttsCache = new Map<string, Float32Array>();

/**
 * Clear the in-process TTS cache. Useful for testing or memory management.
 * Does not clear the Postgres tts_cache table.
 */
export function clearTtsCache(): void {
  ttsCache.clear();
}

/**
 * Get the current in-process cache size (for diagnostics).
 */
export function getTtsCacheSize(): number {
  return ttsCache.size;
}

/**
 * Derive the Postgres tts_cache row key. We hash the text so the key is
 * fixed-width and the table never stores raw cue strings alongside the
 * audio bytes. The in-process Map uses raw text since it never persists
 * outside the function instance.
 */
function ttsCacheDbKey(text: string, voiceId: string): string {
  const hash = createHash('sha256').update(text).digest('hex');
  return `${voiceId}:${hash}`;
}

/**
 * Decode a bytea value as returned by the Neon HTTP driver. Newer driver
 * versions hand back Buffer/Uint8Array directly; older or edge runtime
 * versions hand back the Postgres wire-format hex string `\x<hex>`.
 */
function decodeBytea(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string' && value.startsWith('\\x')) {
    return Buffer.from(value.slice(2), 'hex');
  }
  throw new Error(`tts_cache: unexpected bytea format (type=${typeof value})`);
}

/**
 * Copy a Buffer into a fresh ArrayBuffer-backed Float32Array. The copy is
 * required because the source Buffer may not be 4-byte aligned (slab
 * allocator behavior in Node), and Float32Array requires aligned input.
 */
function bufferToFloat32(buf: Buffer): Float32Array {
  if (buf.byteLength % 4 !== 0) {
    throw new Error(
      `tts_cache: audio byte length ${buf.byteLength} is not a multiple of 4`,
    );
  }
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return new Float32Array(ab);
}

/**
 * Zero-copy view of a Float32Array as a Buffer suitable for bytea insert.
 */
function float32ToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

/**
 * Read a cached row from the Postgres tts_cache table. Returns null on any
 * failure path (missing DATABASE_URL, table not migrated, transport error,
 * key miss) so the caller can fall through to live synthesis without
 * branching on the failure mode.
 */
async function getDbCachedTts(
  dbKey: string,
): Promise<Float32Array | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT audio FROM tts_cache WHERE cache_key = ${dbKey} LIMIT 1
    `) as Array<{ audio: unknown }>;
    if (rows.length === 0) return null;
    return bufferToFloat32(decodeBytea(rows[0].audio));
  } catch (err) {
    console.warn(
      `[tts-cache] db read failed for key ${dbKey.slice(0, 24)}...; falling through. ${(err as Error).message}`,
    );
    return null;
  }
}

/**
 * Best-effort insert into the Postgres tts_cache table. ON CONFLICT DO
 * NOTHING handles the race where two concurrent cold-start invocations
 * synthesize the same cue and both try to write. Errors are logged and
 * swallowed; the in-process cache still holds the value for this instance.
 */
async function setDbCachedTts(
  dbKey: string,
  sampleRate: number,
  audio: Float32Array,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const bytes = float32ToBuffer(audio);
    await sql`
      INSERT INTO tts_cache (cache_key, audio, sample_rate)
      VALUES (${dbKey}, ${bytes}, ${sampleRate})
      ON CONFLICT (cache_key) DO NOTHING
    `;
  } catch (err) {
    console.warn(
      `[tts-cache] db write failed for key ${dbKey.slice(0, 24)}...; in-process cache still warm. ${(err as Error).message}`,
    );
  }
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
 * Whether the synthesizer should refuse to fall back to tone substitution
 * when Google Cloud TTS credentials are missing.
 *
 * Strict when TTS_STRICT === 'true' explicitly, OR when TTS_STRICT is unset
 * and NODE_ENV === 'production'. Set TTS_STRICT=false to force the dev
 * fallback path even in production (escape hatch for emergency recovery).
 *
 * Without this, an unconfigured production Vercel deploy silently ships
 * tracks full of fallback beep tones with only a console.warn, and users
 * have no signal that TTS is broken.
 */
function isTtsStrict(): boolean {
  const raw = process.env.TTS_STRICT;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return process.env.NODE_ENV === 'production';
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
  const memKey = `${voiceId}:${text}`;

  const memCached = ttsCache.get(memKey);
  if (memCached) {
    return memCached;
  }

  const dbKey = ttsCacheDbKey(text, voiceId);
  const dbCached = await getDbCachedTts(dbKey);
  if (dbCached) {
    ttsCache.set(memKey, dbCached);
    return dbCached;
  }

  let result: Float32Array;

  if (hasGoogleCredentials()) {
    result = await synthesizeWithGoogle(text, voiceId);
  } else {
    if (isTtsStrict()) {
      throw new Error(
        'TTS credentials missing: set GOOGLE_TTS_API_KEY (preferred on '
        + 'Vercel) or GOOGLE_APPLICATION_CREDENTIALS, or set TTS_STRICT=false '
        + 'to allow fallback tone substitution.',
      );
    }
    result = synthesizeFallback(text);
  }

  ttsCache.set(memKey, result);
  // Awaited so the Vercel function does not terminate before the write
  // commits; the few hundred ms cost is acceptable on the cache-miss path
  // since we just paid for a live TTS call anyway.
  await setDbCachedTts(dbKey, 44100, result);
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
