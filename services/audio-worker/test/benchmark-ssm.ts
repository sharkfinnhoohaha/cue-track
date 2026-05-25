import { __test } from '../lib/audio/foote-analyze.ts';

// Helper to generate mock frames
function generateMockFrames(n: number, dim: number): Float32Array[] {
  const frames: Float32Array[] = [];
  for (let i = 0; i < n; i++) {
    const f = new Float32Array(dim);
    for (let j = 0; j < dim; j++) {
      f[j] = Math.random();
    }
    frames.push(f);
  }
  return frames;
}

// Old buildSsm
function buildSsmOld(frames: Float32Array[]): Float32Array {
  const n = frames.length;
  const ssm = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    ssm[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) {
      const s = __test.cosineSim(frames[i], frames[j]);
      ssm[i * n + j] = s;
      ssm[j * n + i] = s;
    }
  }
  return ssm;
}

// Optimized buildSsm
function buildSsmOptimized(frames: Float32Array[]): Float32Array {
  const n = frames.length;
  const dim = frames[0]?.length ?? 0;
  
  // 1. Pre-normalize frames
  const normFrames = frames.map(f => {
    let sumSq = 0;
    for (let k = 0; k < dim; k++) {
      sumSq += f[k] * f[k];
    }
    const norm = Math.sqrt(sumSq);
    if (norm === 0) return f;
    const normalized = new Float32Array(dim);
    for (let k = 0; k < dim; k++) {
      normalized[k] = f[k] / norm;
    }
    return normalized;
  });

  // 2. Compute dot products
  const ssm = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const fI = normFrames[i]!;
    ssm[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) {
      const fJ = normFrames[j]!;
      let dot = 0;
      for (let k = 0; k < dim; k++) {
        dot += fI[k] * fJ[k];
      }
      ssm[i * n + j] = dot;
      ssm[j * n + i] = dot;
    }
  }
  return ssm;
}

const nFrames = 1937; // 3-minute track at 4096 hop size
const dim = 40;       // MEL_BANDS
console.log(`Generating ${nFrames} mock frames with dimension ${dim}...`);
const frames = generateMockFrames(nFrames, dim);

console.log('Running Old buildSsm...');
const startOld = Date.now();
const ssmOld = buildSsmOld(frames);
const timeOld = Date.now() - startOld;
console.log(`Old buildSsm took: ${timeOld}ms`);

console.log('Running Optimized buildSsm...');
const startOpt = Date.now();
const ssmOpt = buildSsmOptimized(frames);
const timeOpt = Date.now() - startOpt;
console.log(`Optimized buildSsm took: ${timeOpt}ms`);

console.log(`Speedup: ${(timeOld / timeOpt).toFixed(1)}x`);

// Assert correctness
let maxDiff = 0;
for (let i = 0; i < ssmOld.length; i++) {
  const diff = Math.abs(ssmOld[i] - ssmOpt[i]);
  if (diff > maxDiff) maxDiff = diff;
}
console.log(`Max difference between matrices: ${maxDiff}`);
if (maxDiff < 1e-5) {
  console.log('Verification: PASSED');
} else {
  console.log('Verification: FAILED');
}
