import { describe, expect, it } from 'vitest';
import { friendlyUploadError, friendlyWorkerError } from '@/lib/upload-errors';

describe('friendlyUploadError', () => {
  it('maps file-size limit failures', () => {
    expect(friendlyUploadError('payload too large', 150)).toContain(
      'File is over 150 MB',
    );
  });

  it('surfaces missing blob storage config', () => {
    expect(
      friendlyUploadError('Upload storage is not configured', 150),
    ).toContain('Upload storage is not available right now');
  });

  it('maps identifier/auth failures to a sign-in prompt', () => {
    expect(
      friendlyUploadError('Cannot determine client identifier', 150),
    ).toBe('Could not identify your upload request. Sign in and try again.');
  });

  it('maps network failures to a retryable connection message', () => {
    expect(friendlyUploadError('fetch failed', 150)).toBe(
      'Could not upload your file. Check your connection and try again.',
    );
  });

  it('falls back to the raw message when no mapping is found', () => {
    expect(friendlyUploadError('upload token generation failed', 150)).toBe(
      'upload token generation failed',
    );
  });
});

describe('friendlyWorkerError', () => {
  it('maps worker 415 status to an unsupported format message', () => {
    expect(friendlyWorkerError('Worker returned 415')).toBe(
      "We can't read that file. Try a different MP3 or WAV.",
    );
  });

  it('maps worker 5xx status to a retryable analyzer busy message', () => {
    expect(friendlyWorkerError('Worker returned 503')).toBe(
      'The audio analyzer is busy. Wait a moment and try again.',
    );
  });

  it('maps decode failures', () => {
    expect(friendlyWorkerError('decode failed')).toContain(
      "We couldn't decode that file.",
    );
  });

  it('falls back to a generic message when empty', () => {
    expect(friendlyWorkerError(null)).toContain("We couldn't analyze that file.");
  });
});
