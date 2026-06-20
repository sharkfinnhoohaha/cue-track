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
            <div className="rounded-2xl border border-white/10 bg-zinc-900/10 px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-sans font-bold text-white">
                  Manual mode
                </h2>
                <button
                  type="button"
                  onClick={() => setManual(false)}
                  className="text-xs font-sans font-semibold text-accent hover:opacity-75 transition-opacity"
                >
                  ← Back to upload
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed font-normal">
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
            <p className="text-center text-xs font-sans text-zinc-400">
              Already know your BPM and song structure?{' '}
              <button
                type="button"
                onClick={() => setManual(true)}
                className="font-bold text-accent hover:opacity-75 transition-opacity"
              >
                Enter it manually
              </button>
            </p>
          </div>
      )}
    </div>
  );
}
