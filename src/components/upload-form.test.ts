import { describe, expect, it } from 'vitest';
import { friendlyUploadError, friendlyWorkerError } from '@/lib/upload-errors';

describe('friendlyUploadError', () => {
  it('surfaces missing blob storage config', () => {
    expect(
      friendlyUploadError('Upload storage is not configured', 150),
    ).toContain('BLOB_READ_WRITE_TOKEN');
  });

  it('maps network failures to a retryable connection message', () => {
    expect(friendlyUploadError('fetch failed', 150)).toBe(
      'Could not upload your file. Check your connection and try again.',
    );
  });
});

describe('friendlyWorkerError', () => {
  it('maps worker 5xx status to a retryable analyzer busy message', () => {
    expect(friendlyWorkerError('Worker returned 503')).toBe(
      'The audio analyzer is busy. Wait a moment and try again.',
    );
  });
});
