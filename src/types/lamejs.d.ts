// lamejs ships as untyped CommonJS at node_modules/lamejs/src/js/index.js.
// No @types/lamejs package exists on npm. The encoder uses Mp3Encoder
// directly via require('lamejs') in src/lib/audio/encoder.ts; we mark it
// as `any` here so the build typechecks while keeping the runtime surface
// untouched. The 69-assertion audio suite covers the encoder's actual
// output bytes, so the loss of static typing is bounded.
declare module 'lamejs' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lamejs: any;
  export = lamejs;
}
