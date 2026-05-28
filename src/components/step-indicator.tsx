import React from 'react';
import { cn } from '@/lib/cn';

/**
 * Three-step progress indicator for the guided create flow:
 * Upload → Review → Download.
 *
 * Presentational only (no hooks, no 'use client') so it can be rendered from
 * both server components (the review screen) and client components (the
 * create experience). `current` is 1-indexed.
 */

const STEPS = ['Upload', 'Review', 'Download'] as const;

export function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center justify-center gap-1.5 sm:gap-3">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <li key={label} className="flex items-center gap-1.5 sm:gap-3">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-medium',
                  isActive
                    ? 'bg-[#1d1d1f] text-white'
                    : isDone
                      ? 'bg-[#1d1d1f]/80 text-white'
                      : 'bg-black/[.06] text-[#6e6e73]',
                )}
              >
                {isDone ? '✓' : step}
              </span>
              <span
                className={cn(
                  'text-[12px] font-medium',
                  isActive ? 'text-[#1d1d1f]' : 'text-[#6e6e73]',
                )}
              >
                {label}
              </span>
            </span>
            {step < STEPS.length && (
              <span aria-hidden="true" className="h-px w-5 sm:w-8 bg-black/[.12]" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
