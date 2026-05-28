'use client';

import React, { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { cn } from '@/lib/cn';
import { needsClientTranscode, transcodeToWav } from '@/lib/audio/client-decode';
import { inferMimeFromName } from '@/lib/audio/mime';
import { friendlyUploadError, friendlyWorkerError } from '@/lib/upload-errors';

/**
 * Upload form — primary entry point for the Cue Track value prop.
 *
 * Flow:
 *   1. User drops or picks an audio file (MP3, WAV, M4A, AAC, OGG, FLAC; <= 150 MB)
 *   2. Non-MP3/WAV files are transcoded to WAV in the browser before upload
 *      (see src/lib/audio/client-decode.ts)
 *   3. Upload audio directly to Vercel Blob via /api/tracks/analyze/upload.
 *      Going through Vercel Blob bypasses Vercel's 4.5 MB serverless body
 *      cap, which used to 413 every full-song upload.
 *   4. POST { blobUrl, contentType, filename, size } to /api/tracks/analyze.
 *      That route enqueues an analyze_jobs row, kicks off the worker call
 *      via waitUntil, and returns { jobId, statusUrl }.
 *   5. Poll the statusUrl until status is done|failed, then navigate to
 *      /tracks/[id]/review with the worker-suggested SongSpec.
 */

// Browser-decoded formats (M4A, AAC, OGG, FLAC, …) are transcoded client-side
// to WAV before upload so the server pipeline only needs MP3/WAV decoders.
const ACCEPTED_MIME =
  'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/mp4,audio/m4a,audio/x-m4a,audio/aac,audio/ogg,audio/flac,audio/x-flac';
const ACCEPTED_EXT_RE = /\.(mp3|wav|m4a|mp4|aac|ogg|oga|flac)$/i;
// 150 MB covers ~12 min of stereo 44.1 kHz/16-bit WAV, including transcoded
// M4A uploads (browser-decoded WAV is ~10x the original M4A size).
const MAX_FILE_BYTES = 150 * 1024 * 1024;
// The poll ceiling must outlast the server budget: the analyze function can
// run up to its 300s maxDuration, and the status route fails a stranded job at
// ~330s. 2000ms x 180 = 360s leaves room for a poll to observe that verdict
// instead of the client giving up first with a misleading message.
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 180;

interface PaywallState {
  used: number;
  limit: number;
}

interface PolledJob {
  status: 'queued' | 'running' | 'done' | 'failed';
  result: unknown;
  error: string | null;
}

function resolveUploadMime(file: File): string | null {
  const raw = file.type.toLowerCase().split(';')[0].trim();
  if (!raw || raw === 'application/octet-stream') {
    return inferMimeFromName(file.name);
  }
  return raw;
}

async function pollAnalyzeJob(statusUrl: string): Promise<PolledJob> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const res = await fetch(statusUrl, { cache: 'no-store' });
    if (!res.ok) {
      let serverError: string | null = null;
      try {
        const body = (await res.json()) as { error?: string; details?: string };
        const details = typeof body.details === 'string' ? body.details : '';
        const error = typeof body.error === 'string' ? body.error : '';
        serverError = [error, details].filter(Boolean).join(': ') || null;
      } catch {
        // ignore malformed/non-JSON body
      }
      throw new Error(serverError ?? `Status poll failed (${res.status})`);
    }
    const body = (await res.json()) as PolledJob;
    if (body.status === 'done' || body.status === 'failed') return body;
  }
  throw new Error(
    'Analysis is taking longer than expected. Try again, or use a shorter clip.',
  );
}

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<PaywallState | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback((candidate: File | null) => {
    if (!candidate) return;
    if (candidate.size > MAX_FILE_BYTES) {
      setError(
        `File is over ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. Trim or re-export at a lower bitrate.`,
      );
      return;
    }
    if (!/^audio\//.test(candidate.type) && !ACCEPTED_EXT_RE.test(candidate.name)) {
      setError('Audio files only. Try MP3, WAV, M4A, AAC, OGG, or FLAC.');
      return;
    }
    setError(null);
    setFile(candidate);
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      acceptFile(e.target.files?.[0] ?? null);
    },
    [acceptFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      acceptFile(e.dataTransfer.files?.[0] ?? null);
    },
    [acceptFile],
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!file || isAnalyzing || isTranscoding) return;
    setError(null);
    setPaywall(null);

    let uploadFile = file;
    if (needsClientTranscode(file)) {
      setIsTranscoding(true);
      try {
        uploadFile = await transcodeToWav(file);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "We couldn't read that file. Try a different format (MP3 or WAV).",
        );
        setIsTranscoding(false);
        return;
      }
      setIsTranscoding(false);
      if (uploadFile.size > MAX_FILE_BYTES) {
        setError(
          `Converted file is over ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. Try a shorter clip or upload as MP3.`,
        );
        return;
      }
    }

    setIsAnalyzing(true);
    try {
      const inferredMime = resolveUploadMime(uploadFile);
      if (!inferredMime) {
        throw new Error("We can't read that file. Try a different MP3 or WAV.");
      }
      let blob: { url: string };
      try {
        blob = await upload(uploadFile.name, uploadFile, {
          access: 'public',
          handleUploadUrl: '/api/tracks/analyze/upload',
          contentType: inferredMime,
        });
      } catch (err) {
        console.error('[upload-form] Blob upload failed:', err);
        let msg = '';
        if (err instanceof Error) msg = err.message;
        else if (typeof err === 'string') msg = err;
        throw new Error(
          friendlyUploadError(msg, Math.round(MAX_FILE_BYTES / 1024 / 1024)),
        );
      }

      const enqueueRes = await fetch('/api/tracks/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          blobUrl: blob.url,
          contentType: inferredMime,
          filename: uploadFile.name,
          size: uploadFile.size,
        }),
      });

      if (!enqueueRes.ok) {
        let body: {
          error?: string;
          code?: string;
          details?:
            | string
            | { used?: number; limit?: number; documentation?: string };
        } = {};
        try {
          body = await enqueueRes.json();
        } catch {
          // ignore body parse errors; fall through to status-based message
        }
        if (
          enqueueRes.status === 402 &&
          body.code === 'UPLOAD_QUOTA_EXCEEDED' &&
          body.details &&
          typeof body.details === 'object'
        ) {
          setPaywall({
            used: typeof body.details.used === 'number' ? body.details.used : 1,
            limit:
              typeof body.details.limit === 'number' ? body.details.limit : 1,
          });
          setIsAnalyzing(false);
          return;
        }
        if (enqueueRes.status === 429) {
          throw new Error(
            (typeof body.details === 'string' ? body.details : null) ||
              body.error ||
              'Rate limit exceeded. Try again later.',
          );
        }
        if (enqueueRes.status === 415) {
          throw new Error(
            (typeof body.details === 'string' ? body.details : null) ||
              "We can't read that file. Try a different MP3 or WAV.",
          );
        }
        throw new Error(
          body.error || `Analysis failed (${enqueueRes.status})`,
        );
      }

      const enqueueBody = (await enqueueRes.json()) as {
        jobId?: string;
        statusUrl?: string;
      };
      if (!enqueueBody.jobId || !enqueueBody.statusUrl) {
        throw new Error('Analyze response did not include a jobId');
      }

      const job = await pollAnalyzeJob(enqueueBody.statusUrl);
      if (job.status === 'failed') {
        throw new Error(friendlyWorkerError(job.error));
      }
      const trackId =
        job.status === 'done' && job.result && typeof job.result === 'object'
          ? (job.result as { trackId?: string }).trackId
          : undefined;
      if (!trackId) {
        throw new Error('Analyze finished without a track id');
      }
      router.push(`/tracks/${trackId}/review`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      );
      setIsAnalyzing(false);
    }
  }, [file, isAnalyzing, isTranscoding, router]);

  const reset = useCallback(() => {
    setFile(null);
    setIsAnalyzing(false);
    setIsTranscoding(false);
    setError(null);
    setPaywall(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  if (paywall) {
    return (
      <div className="mx-auto max-w-[640px]">
        <div className="rounded-2xl border border-black/[.08] bg-white p-10 text-center">
          <p className="font-mono text-[11px] tracking-[.12em] uppercase text-[#6e6e73] mb-3">
            You&apos;ve used your free analysis
          </p>
          <h3 className="font-sans font-black tracking-[-0.03em] text-[#1d1d1f] mb-3 text-[clamp(22px,3vw,30px)]">
            Want unlimited uploads? Go Pro.
          </h3>
          <p className="text-[14px] text-[#6e6e73] max-w-[440px] mx-auto mb-7 leading-[1.55]">
            You&apos;ve analyzed {paywall.used} of {paywall.limit} free uploads.
            Pro unlocks unlimited analyses + Studio voices. Single-track
            downloads ($3) only unlock tracks you&apos;ve already created.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[480px] mx-auto">
            <Link
              href="/pricing"
              className="flex flex-col items-center justify-center rounded-xl border border-black/[.13] bg-white px-5 py-5 text-[#1d1d1f] hover:opacity-80 transition-opacity"
            >
              <span className="font-mono text-[10px] tracking-[.12em] uppercase text-[#b0b0b5] mb-1.5">
                Per track
              </span>
              <span className="font-mono text-[26px] font-semibold tracking-[-0.03em] leading-none mb-1">
                $3
              </span>
              <span className="text-[12px] text-[#6e6e73]">one-time</span>
            </Link>
            <Link
              href="/pricing"
              className="flex flex-col items-center justify-center rounded-xl bg-[#1d1d1f] px-5 py-5 text-white hover:opacity-85 transition-opacity"
            >
              <span className="font-mono text-[10px] tracking-[.12em] uppercase text-white/40 mb-1.5">
                Pro
              </span>
              <span className="font-mono text-[26px] font-semibold tracking-[-0.03em] leading-none mb-1">
                $19
              </span>
              <span className="text-[12px] text-white/60">per month · unlimited</span>
            </Link>
          </div>
          <button
            type="button"
            onClick={reset}
            className="mt-6 text-[12px] text-[#6e6e73] hover:text-[#1d1d1f] underline underline-offset-4"
          >
            Pick a different file
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px]">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          'rounded-2xl border-2 border-dashed bg-white p-10 text-center transition-colors',
          isDragging
            ? 'border-[#1d1d1f] bg-[#f5f5f7]'
            : 'border-black/[.15] hover:border-black/[.3]',
        )}
      >
        <svg
          aria-hidden="true"
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          className="mx-auto mb-4 text-[#6e6e73]"
        >
          <path
            d="M20 26V8m0 0l-7 7m7-7l7 7M8 28v2a4 4 0 004 4h16a4 4 0 004-4v-2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {!file && (
          <>
            <p className="text-[17px] font-semibold text-[#1d1d1f] mb-1.5">
              Drop your track here
            </p>
            <p className="text-[13px] text-[#6e6e73] mb-5">
              MP3, WAV, M4A, AAC, OGG, or FLAC. Up to {Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center px-5 py-2.5 bg-[#1d1d1f] text-[#f5f5f7] text-[14px] font-semibold rounded-full hover:opacity-80 transition-opacity"
            >
              Choose file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_MIME}
              onChange={onInputChange}
              className="hidden"
            />
          </>
        )}

        {file && (
          <>
            <p className="text-[15px] font-medium text-[#1d1d1f] mb-1">{file.name}</p>
            <p className="text-[12px] text-[#6e6e73] mb-5">
              {(file.size / (1024 * 1024)).toFixed(1)} MB
            </p>
            {isTranscoding ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-[14px] text-[#1d1d1f]">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded-full border-2 border-[#1d1d1f] border-t-transparent animate-spin"
                  />
                  Preparing your file...
                </div>
                <p className="text-[12px] text-[#6e6e73] max-w-[360px]">
                  Decoding {file.name.split('.').pop()?.toUpperCase()} to WAV in your browser before upload.
                </p>
              </div>
            ) : isAnalyzing ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-[14px] text-[#1d1d1f]">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded-full border-2 border-[#1d1d1f] border-t-transparent animate-spin"
                  />
                  Analyzing your track...
                </div>
                <p className="text-[12px] text-[#6e6e73] max-w-[360px]">
                  Most songs take 10 to 90 seconds. Longer tracks can take a
                  couple of minutes, so keep this tab open.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  className="inline-flex items-center px-5 py-2.5 bg-[#1d1d1f] text-[#f5f5f7] text-[14px] font-semibold rounded-full hover:opacity-80 transition-opacity"
                >
                  Analyze track
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="text-[13px] text-[#6e6e73] hover:text-[#1d1d1f]"
                >
                  Choose different file
                </button>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="mt-4 text-[12px] text-red-600 font-mono">{error}</p>
        )}
      </div>
    </div>
  );
}
