export function friendlyUploadError(raw: string, maxFileMb: number): string {
  const text = raw.trim();
  if (/quota|exceeded|maximum size/i.test(text)) {
    return `File is over ${maxFileMb} MB. Trim or re-export at a lower bitrate.`;
  }
  if (/BLOB_READ_WRITE_TOKEN|Upload storage is not configured/i.test(text)) {
    return 'Upload storage is not configured on the server. Set BLOB_READ_WRITE_TOKEN and redeploy.';
  }
  if (/Cannot determine client identifier|Sign in to analyze/i.test(text)) {
    return 'Could not identify your upload request. Sign in and try again.';
  }
  if (/fetch failed|network|connection|timeout|timed out/i.test(text)) {
    return 'Could not upload your file. Check your connection and try again.';
  }
  if (text) return text;
  return 'Could not upload your file. Check your connection and try again.';
}

export function friendlyWorkerError(raw: string | null): string {
  const text = (raw ?? '').trim();
  if (!text) return "We couldn't analyze that file. Try again or pick a different track.";
  // Worker returned an HTTP status without a useful body — the user can't
  // act on "Worker returned 502", so surface a recoverable message and
  // keep the original detail in the console for debugging.
  const statusOnly = /^Worker returned (\d+)$/i.exec(text);
  if (statusOnly) {
    console.error('[upload-form] Worker non-ok status:', text);
    const status = Number(statusOnly[1]);
    if (status === 415) return "We can't read that file. Try a different MP3 or WAV.";
    if (status >= 500) return 'The audio analyzer is busy. Wait a moment and try again.';
    return 'The audio analyzer rejected this file. Try a different track.';
  }
  // Decode errors from the worker's underlying MP3/WAV parser.
  if (/decode/i.test(text) || /malformed/i.test(text)) {
    console.error('[upload-form] Worker decode error:', text);
    return "We couldn't decode that file. It may be corrupted — try a different MP3 or WAV.";
  }
  // Network / fetch failures bubble up as native error messages like
  // "fetch failed" or "ECONNREFUSED ...".
  if (/fetch failed|ECONN|ENOTFOUND|timed out|timeout/i.test(text)) {
    console.error('[upload-form] Worker network error:', text);
    return 'Could not reach the audio analyzer. Check your connection and try again.';
  }
  return text;
}
