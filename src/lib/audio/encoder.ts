/**
 * WAV and MP3 encoding for Cue Track.
 * Converts Float32Array audio buffers into distributable file formats.
 */

/**
 * Encode interleaved stereo Float32 audio as a WAV file (16-bit signed PCM).
 *
 * WAV format:
 * - RIFF header (44 bytes)
 * - 16-bit signed integer PCM samples
 * - Little-endian byte order
 *
 * @param samples - Interleaved stereo Float32Array (L,R,L,R,...)
 * @param sampleRate - Audio sample rate (e.g., 44100)
 * @param channels - Number of channels (1 = mono, 2 = stereo)
 * @returns Buffer containing the complete WAV file
 */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
  channels: number
): Buffer {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numFrames = Math.floor(samples.length / channels);
  const dataSize = numFrames * channels * bytesPerSample;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const buffer = Buffer.alloc(fileSize);
  let offset = 0;

  // RIFF header
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(fileSize - 8, offset); offset += 4; // file size - 8
  buffer.write('WAVE', offset); offset += 4;

  // fmt sub-chunk
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;          // sub-chunk size (16 for PCM)
  buffer.writeUInt16LE(1, offset); offset += 2;           // audio format (1 = PCM)
  buffer.writeUInt16LE(channels, offset); offset += 2;    // number of channels
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;  // sample rate
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, offset); offset += 4; // byte rate
  buffer.writeUInt16LE(channels * bytesPerSample, offset); offset += 2; // block align
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2; // bits per sample

  // data sub-chunk
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  // Convert Float32 to Int16 and write PCM data
  for (let i = 0; i < numFrames * channels; i++) {
    const floatVal = samples[i];
    // Clamp to [-1.0, 1.0] range then scale to Int16
    const clamped = Math.max(-1.0, Math.min(1.0, floatVal));
    const int16Val = Math.round(clamped * 32767);
    buffer.writeInt16LE(int16Val, offset);
    offset += 2;
  }

  return buffer;
}

/**
 * Encode interleaved stereo Float32 audio as MP3 using lamejs.
 *
 * @param samples - Interleaved stereo Float32Array (L,R,L,R,...)
 * @param sampleRate - Audio sample rate (e.g., 44100)
 * @param channels - Number of channels (1 = mono, 2 = stereo)
 * @returns Buffer containing the complete MP3 file
 */
export function encodeMp3(
  samples: Float32Array,
  sampleRate: number,
  channels: number
): Buffer {
  // Dynamic require for lamejs (CommonJS module)
  let lamejs: typeof import('lamejs');
  try {
    lamejs = require('lamejs');
  } catch {
    throw new Error(
      'lamejs is required for MP3 encoding. Install it with: npm install lamejs'
    );
  }

  const kbps = 192;
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
  const mp3Frames: Buffer[] = [];

  const numFrames = Math.floor(samples.length / channels);

  if (channels === 2) {
    // De-interleave stereo into separate Int16 channels
    const leftChannel = new Int16Array(numFrames);
    const rightChannel = new Int16Array(numFrames);

    for (let i = 0; i < numFrames; i++) {
      const leftFloat = Math.max(-1.0, Math.min(1.0, samples[i * 2]));
      const rightFloat = Math.max(-1.0, Math.min(1.0, samples[i * 2 + 1]));
      leftChannel[i] = Math.round(leftFloat * 32767);
      rightChannel[i] = Math.round(rightFloat * 32767);
    }

    // Encode in chunks of 1152 samples (standard MP3 frame size)
    const chunkSize = 1152;
    for (let i = 0; i < numFrames; i += chunkSize) {
      const end = Math.min(i + chunkSize, numFrames);
      const leftChunk = leftChannel.subarray(i, end);
      const rightChunk = rightChannel.subarray(i, end);
      const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Frames.push(Buffer.from(mp3buf));
      }
    }
  } else {
    // Mono encoding
    const monoChannel = new Int16Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      const floatVal = Math.max(-1.0, Math.min(1.0, samples[i]));
      monoChannel[i] = Math.round(floatVal * 32767);
    }

    const chunkSize = 1152;
    for (let i = 0; i < numFrames; i += chunkSize) {
      const end = Math.min(i + chunkSize, numFrames);
      const chunk = monoChannel.subarray(i, end);
      const mp3buf = encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        mp3Frames.push(Buffer.from(mp3buf));
      }
    }
  }

  // Flush remaining MP3 data
  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3Frames.push(Buffer.from(flushBuf));
  }

  return Buffer.concat(mp3Frames);
}
