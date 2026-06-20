'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Plays the pre-rendered 15-second sample cue track from /api/demo-preview so a
 * first-time visitor can hear the product in one click — before committing to
 * uploading their own song. The endpoint renders once and caches, so this is a
 * cheap, instant proof of the value prop.
 */
export function DemoPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const toggle = () => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio('/api/demo-preview');
      audio.preload = 'none';
      audio.addEventListener('playing', () => setState('playing'));
      audio.addEventListener('ended', () => setState('idle'));
      audio.addEventListener('pause', () =>
        setState((s) => (s === 'playing' ? 'idle' : s)),
      );
      audio.addEventListener('error', () => setState('idle'));
      audioRef.current = audio;
    }

    if (state === 'playing') {
      audio.pause();
      audio.currentTime = 0;
      setState('idle');
      return;
    }

    setState('loading');
    audio.currentTime = 0;
    void audio.play().catch(() => setState('idle'));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={state === 'playing' ? 'Stop the sample cue track' : 'Play a 15-second sample cue track'}
      className="inline-flex items-center gap-2 font-mono text-[12px] tracking-[.04em] text-zinc-100 hover:opacity-70 transition-opacity"
    >
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-zinc-950 font-bold">
        {state === 'loading' ? (
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : state === 'playing' ? (
          <svg width="9" height="9" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="3.5" height="10" rx="1" /><rect x="8.5" y="2" width="3.5" height="10" rx="1" /></svg>
        ) : (
          <svg width="9" height="9" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 2.5v9a.5.5 0 0 0 .76.43l7.5-4.5a.5.5 0 0 0 0-.86l-7.5-4.5A.5.5 0 0 0 3 2.5Z" /></svg>
        )}
      </span>
      {state === 'playing' ? 'Stop sample' : 'Hear a 15-second sample'}
    </button>
  );
}
