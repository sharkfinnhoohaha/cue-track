'use client';

import React, { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Upload form — primary entry point for the Cue Track value prop.
 *
 * The full pipeline (file upload, server-side tempo + section detection,
 * generate spec, render cue track) is V1.5 work. This component ships the
 * UI surface so the landing page reflects the intended product, with a
 * "coming soon" handoff that points users to manual mode for now.
 *
 * Once the /api/tracks/analyze endpoint exists, swap the handleAnalyze
 * stub for a real POST + progress UI.
 */

const ACCEPTED_MIME = 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
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

  const handleAnalyze = useCallback(() => {
    // Stubbed for V1.0. The backend /api/tracks/analyze endpoint and the
    // Cloud Run worker analysis are tracked as the next-phase work.
    setHasAnalyzed(true);
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setHasAnalyzed(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

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

        {file && !hasAnalyzed && (
          <>
            <p className="text-[15px] font-medium text-[#1d1d1f] mb-1">{file.name}</p>
            <p className="text-[12px] text-[#6e6e73] mb-5">
              {(file.size / (1024 * 1024)).toFixed(1)} MB
            </p>
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
          </>
        )}

        {hasAnalyzed && (
          <>
            <p className="text-[15px] font-semibold text-[#1d1d1f] mb-2">
              Track analysis is coming soon.
            </p>
            <p className="text-[13px] text-[#6e6e73] mb-5 max-w-[420px] mx-auto leading-[1.55]">
              Auto-detection of tempo and song structure is the next thing on the
              roadmap. In the meantime, build your cue track manually below; it
              takes about a minute if you know your BPM.
            </p>
            <button
              type="button"
              onClick={reset}
              className="text-[13px] text-[#6e6e73] hover:text-[#1d1d1f] underline underline-offset-4"
            >
              Pick a different file
            </button>
          </>
        )}

        {error && (
          <p className="mt-4 text-[12px] text-red-600 font-mono">{error}</p>
        )}
      </div>
    </div>
  );
}
