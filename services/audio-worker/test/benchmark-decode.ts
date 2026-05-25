import wavefile from 'wavefile';
import fs from 'fs';
import path from 'path';

// Helper for original decode
function decodeWavOriginal(bytes: Buffer): { mono: Float32Array; sampleRate: number; duration: number } {
  const wav = new (wavefile as any).WaveFile(new Uint8Array(bytes));
  wav.toBitDepth('32f');
  const sampleRate = Number(wav.fmt.sampleRate);
  const numChannels = Number(wav.fmt.numChannels) || 1;
  const deinterleaved = wav.getSamples(false, Float32Array) as Float32Array | Float32Array[];
  const channels: Float32Array[] = Array.isArray(deinterleaved) ? deinterleaved : [deinterleaved];
  
  const downmixToMono = (ch: Float32Array[]): Float32Array => {
    if (ch.length === 0) return new Float32Array(0);
    if (ch.length === 1) return ch[0]!;
    const len = ch[0]!.length;
    const out = new Float32Array(len);
    const numCh = ch.length;
    for (let i = 0; i < len; i++) {
      let sum = 0;
      for (let c = 0; c < numCh; c++) sum += ch[c]![i] ?? 0;
      out[i] = sum / numCh;
    }
    return out;
  };

  const mono = numChannels > 1 && channels.length > 1
    ? downmixToMono(channels)
    : channels[0] ?? new Float32Array(0);
  const duration = mono.length / sampleRate;
  return { mono, sampleRate, duration };
}

// Optimized fast-path decode
function decodeWavOptimized(bytes: Buffer): { mono: Float32Array; sampleRate: number; duration: number } {
  const wav = new (wavefile as any).WaveFile(new Uint8Array(bytes));
  const sampleRate = Number(wav.fmt.sampleRate);
  const numChannels = Number(wav.fmt.numChannels) || 1;
  const bitsPerSample = Number(wav.fmt.bitsPerSample);
  const audioFormat = Number(wav.fmt.audioFormat);

  // 16-bit signed PCM Fast Path
  if (audioFormat === 1 && bitsPerSample === 16 && wav.data && wav.data.samples) {
    const rawSamples = wav.data.samples; // Uint8Array
    // Since TypedArray offset must be aligned to the element size, we copy the buffer if it is not aligned
    let buffer = rawSamples.buffer;
    let byteOffset = rawSamples.byteOffset;
    if (byteOffset % 2 !== 0) {
      const copy = new Uint8Array(rawSamples.length);
      copy.set(rawSamples);
      buffer = copy.buffer;
      byteOffset = copy.byteOffset;
    }
    const rawInt16 = new Int16Array(buffer, byteOffset, rawSamples.length / 2);
    const numSamplesPerChannel = Math.floor(rawInt16.length / numChannels);
    const mono = new Float32Array(numSamplesPerChannel);

    if (numChannels === 1) {
      for (let i = 0; i < numSamplesPerChannel; i++) {
        const val = rawInt16[i]!;
        mono[i] = val < 0 ? val / 32768 : val / 32767;
      }
    } else if (numChannels === 2) {
      for (let i = 0; i < numSamplesPerChannel; i++) {
        const val1 = rawInt16[i * 2]!;
        const val2 = rawInt16[i * 2 + 1]!;
        const avg = (val1 + val2) / 2;
        mono[i] = avg < 0 ? avg / 32768 : avg / 32767;
      }
    } else {
      for (let i = 0; i < numSamplesPerChannel; i++) {
        let sum = 0;
        for (let c = 0; c < numChannels; c++) {
          sum += rawInt16[i * numChannels + c]!;
        }
        const avg = sum / numChannels;
        mono[i] = avg < 0 ? avg / 32768 : avg / 32767;
      }
    }
    return { mono, sampleRate, duration: mono.length / sampleRate };
  }

  // 32-bit float PCM Fast Path
  if (audioFormat === 3 && bitsPerSample === 32 && wav.data && wav.data.samples) {
    const rawSamples = wav.data.samples;
    let buffer = rawSamples.buffer;
    let byteOffset = rawSamples.byteOffset;
    if (byteOffset % 4 !== 0) {
      const copy = new Uint8Array(rawSamples.length);
      copy.set(rawSamples);
      buffer = copy.buffer;
      byteOffset = copy.byteOffset;
    }
    const rawFloat32 = new Float32Array(buffer, byteOffset, rawSamples.length / 4);
    const numSamplesPerChannel = Math.floor(rawFloat32.length / numChannels);
    const mono = new Float32Array(numSamplesPerChannel);

    if (numChannels === 1) {
      mono.set(rawFloat32);
    } else if (numChannels === 2) {
      for (let i = 0; i < numSamplesPerChannel; i++) {
        const val1 = rawFloat32[i * 2]!;
        const val2 = rawFloat32[i * 2 + 1]!;
        mono[i] = (val1 + val2) / 2;
      }
    } else {
      for (let i = 0; i < numSamplesPerChannel; i++) {
        let sum = 0;
        for (let c = 0; c < numChannels; c++) {
          sum += rawFloat32[i * numChannels + c]!;
        }
        mono[i] = sum / numChannels;
      }
    }
    return { mono, sampleRate, duration: mono.length / sampleRate };
  }

  // Standard fallback
  wav.toBitDepth('32f');
  const deinterleaved = wav.getSamples(false, Float32Array) as Float32Array | Float32Array[];
  const channels: Float32Array[] = Array.isArray(deinterleaved) ? deinterleaved : [deinterleaved];
  
  const downmixToMono = (ch: Float32Array[]): Float32Array => {
    if (ch.length === 0) return new Float32Array(0);
    if (ch.length === 1) return ch[0]!;
    const len = ch[0]!.length;
    const out = new Float32Array(len);
    const numCh = ch.length;
    for (let i = 0; i < len; i++) {
      let sum = 0;
      for (let c = 0; c < numCh; c++) sum += ch[c]![i] ?? 0;
      out[i] = sum / numCh;
    }
    return out;
  };

  const mono = numChannels > 1 && channels.length > 1
    ? downmixToMono(channels)
    : channels[0] ?? new Float32Array(0);
  return { mono, sampleRate, duration: mono.length / sampleRate };
}

const testFilePath = path.resolve(import.meta.dirname, '../../../test-output/test-track.wav');
if (!fs.existsSync(testFilePath)) {
  console.error(`Test track not found at ${testFilePath}`);
  process.exit(1);
}

const bytes = fs.readFileSync(testFilePath);
console.log(`Loaded test WAV file: ${bytes.length} bytes`);

console.log('Running Original decodeWav...');
const startOrig = Date.now();
const resOrig = decodeWavOriginal(bytes);
const timeOrig = Date.now() - startOrig;
console.log(`Original decodeWav took: ${timeOrig}ms (duration = ${resOrig.duration.toFixed(2)}s)`);

console.log('Running Optimized decodeWav...');
const startOpt = Date.now();
const resOpt = decodeWavOptimized(bytes);
const timeOpt = Date.now() - startOpt;
console.log(`Optimized decodeWav took: ${timeOpt}ms (duration = ${resOpt.duration.toFixed(2)}s)`);

console.log(`Speedup: ${(timeOrig / timeOpt).toFixed(1)}x`);

// Verify equality
let maxDiff = 0;
for (let i = 0; i < Math.min(resOrig.mono.length, resOpt.mono.length); i++) {
  const diff = Math.abs(resOrig.mono[i] - resOpt.mono[i]);
  if (diff > maxDiff) maxDiff = diff;
}
console.log(`Max difference between decoders: ${maxDiff}`);
if (maxDiff < 1e-4) {
  console.log('Verification: PASSED');
} else {
  console.log('Verification: FAILED');
}
