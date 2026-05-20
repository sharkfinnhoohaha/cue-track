export type CanonicalAudioMime = 'audio/mpeg' | 'audio/wav';

/**
 * Infer a canonical audio MIME type from a filename extension.
 * @param name - Filename to inspect.
 * @returns Canonical MIME type or null when no audio extension is found.
 */
export function inferMimeFromName(name: string): CanonicalAudioMime | null {
  if (/\.mp3$/i.test(name)) return 'audio/mpeg';
  if (/\.wav$/i.test(name)) return 'audio/wav';
  return null;
}

/**
 * Normalize a raw MIME string into the canonical audio types we support.
 * @param mime - Raw MIME value (e.g., from Content-Type).
 * @returns Canonical MIME type or null when unsupported.
 */
export function canonicalizeAudioMime(mime: string): CanonicalAudioMime | null {
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'audio/mpeg';
  if (
    mime === 'audio/wav' ||
    mime === 'audio/x-wav' ||
    mime === 'audio/wave' ||
    mime === 'audio/vnd.wave'
  ) {
    return 'audio/wav';
  }
  return null;
}
