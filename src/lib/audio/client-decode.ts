/**
 * Client-side audio transcoding helpers for the upload form.
 *
 * The server-side analyzer (services/audio-worker) only decodes MP3 and
 * WAV. To support M4A, AAC, OGG, FLAC, etc. without adding ffmpeg to the
 * worker image, we decode in the browser via Web Audio API and re-encode
 * as 16-bit PCM WAV before upload. Browsers natively decode whatever
 * formats they support, including M4A/AAC on iOS Safari.
 *
 * Trade-off: WAV is uncompressed, so a 6 MB M4A becomes a ~60 MB WAV.
 * The application-side size cap is sized accordingly (see MAX_FILE_BYTES
 * in upload-form.tsx and api/tracks/analyze/route.ts).
 */
'use client';

const PASSTHROUGH_EXT = /\.(mp3|wav)$/i;
const PASSTHROUGH_MIME = /^audio\/(mpeg|mp3|wav|x-wav|wave|vnd\.wave)$/i;

export function needsClientTranscode(file: File): boolean {
  if (PASSTHROUGH_EXT.test(file.name)) return false;
  if (PASSTHROUGH_MIME.test(file.type)) return false;
  return true;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export async function transcodeToWav(file: File): Promise<File> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    throw new Error(
      "Your browser can't decode this file. Try a different format (MP3 or WAV).",
    );
  }
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new Ctor();
  let audioBuffer: AudioBuffer;
  try {
    // decodeAudioData consumes the underlying buffer in some implementations;
    // copy to a fresh ArrayBuffer so callers can still read the original File
    // if conversion fails (e.g. for the error toast).
    const copy = arrayBuffer.slice(0);
    audioBuffer = await ctx.decodeAudioData(copy);
  } catch (err) {
    await ctx.close().catch(() => {});
    throw new Error(
      err instanceof Error && err.message
        ? `Couldn't decode that file in the browser: ${err.message}`
        : "Couldn't decode that file in the browser. Try MP3 or WAV.",
    );
  }
  await ctx.close().catch(() => {});

  const wavBytes = encodeWav(audioBuffer);
  const baseName = file.name.replace(/\.[^./\\]+$/, '') || 'track';
  return new File([wavBytes], `${baseName}.wav`, { type: 'audio/wav' });
}

function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = Math.max(1, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = numFrames * blockAlign;
  const out = new ArrayBuffer(44 + dataLength);
  const view = new DataView(out);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i] ?? 0));
      const int16 = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }
  return out;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
