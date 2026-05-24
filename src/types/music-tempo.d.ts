// music-tempo ships as ESM/CJS with no published type defs. The constructor
// is synchronous: it takes a Float32Array of mono PCM (plus options) and
// exposes the estimated tempo on `.tempo`. Minimal contract surface covering
// only what src/lib/audio/analyze.ts uses.
declare module 'music-tempo' {
  interface MusicTempoOptions {
    hopSize?: number;
    bufferSize?: number;
    [key: string]: unknown;
  }
  class MusicTempo {
    constructor(audioData: Float32Array | number[], options?: MusicTempoOptions);
    tempo: number;
    beats: number[];
  }
  export = MusicTempo;
}
