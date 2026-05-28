'use client';

import React, { useState } from 'react';
import { UploadForm } from '@/components/upload-form';
import { TrackForm } from '@/components/track-form';
import { StepIndicator } from '@/components/step-indicator';

/**
 * The /create experience. Upload-first and guided: the upload box is the
 * primary path (drop a song → analyze → review → download), with manual mode
 * demoted to a secondary, opt-in panel. Deep-linking with ?mode=manual (or the
 * sign-up round-trip from TrackForm) opens manual mode directly.
 */
export function CreateExperience({
  isAuthenticated,
  initialManual = false,
}: {
  isAuthenticated: boolean;
  initialManual?: boolean;
}) {
  const [manual, setManual] = useState(initialManual);

  return (
    <div className="space-y-10">
      <StepIndicator current={1} />

      {manual ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-black/[.08] bg-white px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[17px] font-semibold text-[#1d1d1f]">
                Manual mode
              </h2>
              <button
                type="button"
                onClick={() => setManual(false)}
                className="text-[13px] font-medium text-[#0066cc] hover:opacity-75 transition-opacity"
              >
                ← Back to upload
              </button>
            </div>
            <p className="mt-1 text-[13px] text-[#6e6e73] leading-[1.55]">
              Enter your BPM, sections, and click sound directly — handy when
              you&apos;re charting from scratch.
              {!isAuthenticated && ' Sign up free to generate.'}
            </p>
          </div>
          <TrackForm isAuthenticated={isAuthenticated} />
        </div>
      ) : (
        <div className="space-y-6">
          <UploadForm />
          <p className="text-center text-[13px] text-[#6e6e73]">
            Already know your BPM and song structure?{' '}
            <button
              type="button"
              onClick={() => setManual(true)}
              className="font-medium text-[#0066cc] underline underline-offset-4 hover:opacity-75 transition-opacity"
            >
              Enter it manually
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
