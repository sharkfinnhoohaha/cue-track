'use client';

import React, { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * Upload form — primary entry point for the Cue Track value prop.
 *
 * Flow:
 *   1. User drops or picks an MP3 / WAV (<= 50 MB)
 *   2. Click "Analyze track" → POST file to /api/tracks/analyze
 *   3. On success, navigate to /tracks/[id]/review so the user can adjust
 *      the detected BPM + suggested sections before finalizing.
 *
 * The route persists a draft tracks row (status='rendering') with the
 * worker's suggested SongSpec; the review screen then submits to
 * /api/tracks/generate with existingTrackId to flip the row to ready.
 */

const ACCEPTED_MIME = 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

interface PaywallState {
  used: number;
  limit: number;
}

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<PaywallState | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback((candidate: File | null) => {
    if (!candidate) return;
    if (candidate.size > MAX_FILE_BYTES) {
      setError('File is over 50 MB. Trim or re-export at a lower bitrate.');
      return;
    }
    if (!/^audio\//.test(candidate.type) && !/\.(mp3|wav)$/i.test(candidate.name)) {
      setError('Only MP3 or WAV files for now.');
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
    if (!file || isAnalyzing) return;
    setIsAnalyzing(true);
    setError(null);
    setPaywall(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/tracks/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let body: {
          error?: string;
          code?: string;
          details?:
            | string
            | { used?: number; limit?: number; documentation?: string };
        } = {};
        try {
          body = await res.json();
        } catch {
          // ignore body parse errors; fall through to status-based message
        }
        if (
          res.status === 402 &&
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
        if (res.status === 429) {
          throw new Error(
            (typeof body.details === 'string' ? body.details : null) ||
              body.error ||
              'Rate limit exceeded. Try again later.',
          );
        }
        if (res.status === 422) {
          throw new Error(
            (typeof body.details === 'string' ? body.details : null) ||
              "We couldn't decode that file. Try a different MP3 or WAV.",
          );
        }
        throw new Error(
          body.error || `Analysis failed (${res.status})`,
        );
      }

      const data = (await res.json()) as { id?: string };
      if (!data.id) {
        throw new Error('Analyze response did not include a track id');
      }
      router.push(`/tracks/${data.id}/review`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      );
      setIsAnalyzing(false);
    }
  }, [file, isAnalyzing, router]);

  const reset = useCallback(() => {
    setFile(null);
    setIsAnalyzing(false);
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
            One more track? Pick a plan.
          </h3>
          <p className="text-[14px] text-[#6e6e73] max-w-[440px] mx-auto mb-7 leading-[1.55]">
            You&apos;ve analyzed {paywall.used} of {paywall.limit} free uploads.
            Subscribe Pro for unlimited analyses + Studio voices, or grab a
            single track for the next set.
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
              MP3 or WAV, up to 50 MB
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
            {isAnalyzing ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-[14px] text-[#1d1d1f]">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded-full border-2 border-[#1d1d1f] border-t-transparent animate-spin"
                  />
                  Analyzing your track...
                </div>
                <p className="text-[12px] text-[#6e6e73] max-w-[360px]">
                  This usually takes 5 to 15 seconds depending on the length
                  of your file.
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
