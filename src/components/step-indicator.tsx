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
    <ol className="flex items-center justify-center gap-1.5 sm:gap-4">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <li key={label} className="flex items-center gap-1.5 sm:gap-4">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full font-sans text-xs font-bold',
                  isActive
                    ? 'bg-accent text-white'
                    : isDone
                      ? 'bg-white text-black'
                      : 'bg-white/10 text-zinc-500',
                )}
              >
                {isDone ? '✓' : step}
              </span>
              <span
                className={cn(
                  'text-xs font-sans font-medium tracking-wide',
                  isActive ? 'text-white font-semibold' : 'text-zinc-500',
                )}
              >
                {label}
              </span>
            </span>
            {step < STEPS.length && (
              <span aria-hidden="true" className="h-px w-5 sm:w-10 bg-white/20" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
