// lamejs ships as untyped CommonJS at node_modules/lamejs/src/js/index.js.
// No @types/lamejs exists on npm. Minimal interface covering only what the
// encoder actually uses (src/lib/audio/encoder.ts):
//   new lamejs.Mp3Encoder(channels, sampleRate, kbps)
//   encoder.encodeBuffer(leftChunk[, rightChunk])  Int16 PCM in, Int8Array out
//   encoder.flush()                                Int8Array out
// The 69-assertion audio suite (scripts/test-audio.ts) covers actual output
// bytes; this typing is a contract surface, not behavior validation.
declare module 'lamejs' {
  class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number);
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  }
  const lamejs: { Mp3Encoder: typeof Mp3Encoder };
  export = lamejs;
}
