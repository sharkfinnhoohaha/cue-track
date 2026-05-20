export function inferMimeFromName(name: string): string | null {
  if (/\.mp3$/i.test(name)) return 'audio/mpeg';
  if (/\.wav$/i.test(name)) return 'audio/wav';
  return null;
}
