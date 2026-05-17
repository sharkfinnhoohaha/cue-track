'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { SongSpec, SongSection, TimeSignature } from '@/types';
import { AVAILABLE_VOICES } from '@/lib/audio/types';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionList } from '@/components/section-list';
import { cn } from '@/lib/cn';

const SKIP_SIGNUP_STORAGE_KEY = 'cuetrack:skip-signup-prompt';

const TIME_SIGNATURES: { value: string; label: string; ts: TimeSignature }[] = [
  { value: '4/4', label: '4/4', ts: { beats: 4, subdivision: 4 } },
  { value: '3/4', label: '3/4', ts: { beats: 3, subdivision: 4 } },
  { value: '6/8', label: '6/8', ts: { beats: 6, subdivision: 8 } },
  { value: '7/8', label: '7/8', ts: { beats: 7, subdivision: 8 } },
  { value: '5/4', label: '5/4', ts: { beats: 5, subdivision: 4 } },
  { value: 'custom', label: 'Custom', ts: { beats: 4, subdivision: 4 } },
];

// Voice options derived from the canonical AVAILABLE_VOICES catalog in
// src/lib/audio/types.ts. Previously this form maintained a separate list with
// non-Google IDs (`en-male-1`, etc.), which Google Cloud TTS rejected because
// `voiceId.substring(0, 5)` produced `en-ma` — an invalid languageCode. The
// route silently fell through to the tone-substitute fallback synth, so users
// got beeps instead of speech even with credentials configured.
//
// Deriving from AVAILABLE_VOICES means new voices added to types.ts appear
// here automatically with no further form changes.
const VOICE_OPTIONS = AVAILABLE_VOICES.map((v) => ({
  value: v.id,
  label: v.label,
}));

const CLICK_SOUNDS: { id: SongSpec['clickSound']; label: string; desc: string }[] = [
  { id: 'classic', label: 'Classic', desc: 'Standard sine wave click' },
  { id: 'woodblock', label: 'Woodblock', desc: 'Warm woodblock tone' },
  { id: 'rimshot', label: 'Rimshot', desc: 'Sharp rim shot' },
  { id: 'hi-hat', label: 'Hi-Hat', desc: 'Closed hi-hat tick' },
];

const FORMAT_OPTIONS: { id: SongSpec['format']; label: string }[] = [
  { id: 'wav', label: 'WAV' },
  { id: 'mp3', label: 'MP3' },
];

function useTapTempo(onBpmChange: (bpm: number) => void) {
  const tapsRef = useRef<number[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const tap = useCallback(() => {
    const now = Date.now();
    if (tapsRef.current.length > 0 && now - tapsRef.current[tapsRef.current.length - 1] > 2000) {
      tapsRef.current = [];
    }
    tapsRef.current.push(now);
    if (tapsRef.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapsRef.current.length; i++) {
        intervals.push(tapsRef.current[i] - tapsRef.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avgInterval);
      if (bpm >= 30 && bpm <= 300) onBpmChange(bpm);
    }
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => { tapsRef.current = []; }, 3000);
  }, [onBpmChange]);

  return tap;
}

/**
 * Estimate a track's duration in seconds from the spec alone, without
 * building the full TimeGrid. Used for the inline UI warning so users see
 * the duration cap before they submit. The server enforces the same cap
 * authoritatively in /api/tracks/generate using buildTimeGrid().totalDuration.
 *
 * Counts count-in pre-roll plus each section's bar-time at its effective
 * BPM. Cue audio (TTS, click) mixes into the grid rather than extending it,
 * so this estimator matches the server's totalDuration within a beat.
 */
function estimateDurationSeconds(spec: SongSpec): number {
  const baseBpm = spec.bpm;
  const beats = spec.timeSignature.beats;
  if (!Number.isFinite(baseBpm) || baseBpm <= 0) return 0;
  if (!Number.isFinite(beats) || beats <= 0) return 0;

  let totalSeconds = 0;
  if (spec.enableCountIn && spec.countInBars > 0) {
    totalSeconds += spec.countInBars * beats * (60 / baseBpm);
  }
  for (const section of spec.sections) {
    const bpm =
      section.bpmOverride && section.bpmOverride > 0
        ? section.bpmOverride
        : baseBpm;
    totalSeconds += section.bars * beats * (60 / bpm);
  }
  return totalSeconds;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

const MAX_DURATION_SECONDS = Number(
  process.env.NEXT_PUBLIC_MAX_TRACK_DURATION_SECONDS || 1800,
);

const DEFAULT_SPEC: SongSpec = {
  title: '',
  bpm: 120,
  timeSignature: { beats: 4, subdivision: 4 },
  sections: [],
  voiceId: AVAILABLE_VOICES[0]?.id ?? 'en-US-Studio-M',
  clickSound: 'classic',
  format: 'wav',
  enableCountIn: true,
  enableSectionAnnounce: true,
  enableBarCountdown: false,
  countInBars: 2,
};

export interface TrackFormProps {
  /**
   * Whether the user has an authenticated NextAuth session. Fed from the
   * /create server component via `await auth()`. Used to gate the
   * "Sign up or skip" modal and to display contextual messages on 429
   * responses (anon users get a sign-up CTA; auth users get a wait time).
   */
  isAuthenticated: boolean;
}

export function TrackForm({ isAuthenticated }: TrackFormProps) {
  const router = useRouter();
  const [spec, setSpec] = useState<SongSpec>(DEFAULT_SPEC);
  const [isCustomTs, setIsCustomTs] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const [hasSkippedSignup, setHasSkippedSignup] = useState(false);

  // Restore "skipped this session" flag from sessionStorage on mount so
  // anonymous users who already dismissed the modal once aren't re-prompted
  // every submit. SessionStorage (not local) so the prompt comes back next
  // browser session, when their rate-limit window has likely reset anyway.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.sessionStorage.getItem(SKIP_SIGNUP_STORAGE_KEY) === 'true') {
        setHasSkippedSignup(true);
      }
    } catch {
      // sessionStorage may be unavailable (private mode, quota); ignore.
    }
  }, []);

  const skipSignupPrompt = useCallback(() => {
    setHasSkippedSignup(true);
    try {
      window.sessionStorage.setItem(SKIP_SIGNUP_STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
  }, []);

  const update = useCallback(<K extends keyof SongSpec>(key: K, value: SongSpec[K]) => {
    setSpec((prev) => ({ ...prev, [key]: value }));
  }, []);

  const tap = useTapTempo((bpm) => update('bpm', bpm));

  const handleTsChange = useCallback((value: string) => {
    if (value === 'custom') { setIsCustomTs(true); return; }
    setIsCustomTs(false);
    const found = TIME_SIGNATURES.find((t) => t.value === value);
    if (found) update('timeSignature', found.ts);
  }, [update]);

  const estimatedDurationSec = estimateDurationSeconds(spec);
  const isOverDurationLimit = estimatedDurationSec > MAX_DURATION_SECONDS;
  const isNearDurationLimit =
    !isOverDurationLimit && estimatedDurationSec > MAX_DURATION_SECONDS * 0.9;

  const doGenerate = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/tracks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (res.status === 429) {
          // The server already composes a friendly message that mentions
          // sign-in for anon users (authBoost) and retry time for everyone.
          throw new Error(
            body?.details ||
              body?.error ||
              'Rate limit exceeded. Try again later.',
          );
        }
        throw new Error(body?.error || `Generation failed (${res.status})`);
      }
      const data = await res.json();
      router.push(`/tracks/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  }, [spec, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!spec.title.trim()) { setError('Please enter a track title.'); return; }
    if (spec.sections.length === 0) { setError('Please add at least one section.'); return; }
    if (spec.bpm < 30 || spec.bpm > 300) { setError('BPM must be between 30 and 300.'); return; }
    if (isOverDurationLimit) {
      setError(
        `Track is approximately ${formatDuration(estimatedDurationSec)}, which exceeds the ${formatDuration(MAX_DURATION_SECONDS)} maximum. Reduce bars or sections.`,
      );
      return;
    }

    // Anonymous users see the sign-up modal once per browser session before
    // their first generate. After they pick (sign up or skip), the modal
    // does not re-appear this session. Authenticated users skip the prompt.
    if (!isAuthenticated && !hasSkippedSignup) {
      setShowSignupPrompt(true);
      return;
    }

    await doGenerate();
  };

  const currentTsValue = isCustomTs ? 'custom' : `${spec.timeSignature.beats}/${spec.timeSignature.subdivision}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-900/20 px-4 py-3 text-sm text-red-400 animate-fade-in">{error}</div>
      )}

      <Card header="Track Details">
        <div className="space-y-5">
          <Input label="Title" placeholder="e.g. Sunday Morning Set - Amazing Grace" value={spec.title} onChange={(e) => update('title', e.target.value)} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="label font-mono text-xs uppercase tracking-wider">BPM</label>
              <div className="flex gap-2">
                <input type="number" min={30} max={300} value={spec.bpm} onChange={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val)) update('bpm', Math.min(300, Math.max(30, val))); }} className="input font-mono flex-1" />
                <button type="button" onClick={tap} className="btn-secondary shrink-0 font-mono text-xs px-3" title="Tap to set tempo">TAP</button>
              </div>
              <p className="mt-1.5 text-xs text-muted">Tap the button rhythmically to detect tempo</p>
            </div>
            <div>
              <Select label="Time Signature" value={currentTsValue} onChange={(e) => handleTsChange(e.target.value)} options={TIME_SIGNATURES.map((t) => ({ value: t.value, label: t.label }))} />
              {isCustomTs && (
                <div className="mt-2 flex items-center gap-2">
                  <input type="number" min={1} max={15} value={spec.timeSignature.beats} onChange={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val) && val >= 1 && val <= 15) update('timeSignature', { ...spec.timeSignature, beats: val }); }} className="input w-16 text-center font-mono" aria-label="Beats per bar" />
                  <span className="text-muted font-mono">/</span>
                  <select value={spec.timeSignature.subdivision} onChange={(e) => update('timeSignature', { ...spec.timeSignature, subdivision: parseInt(e.target.value, 10) })} className="input w-16 text-center font-mono appearance-none" aria-label="Beat subdivision">
                    <option value={2}>2</option><option value={4}>4</option><option value={8}>8</option><option value={16}>16</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card header="Song Structure">
        <SectionList sections={spec.sections} onChange={(sections: SongSection[]) => update('sections', sections)} />
      </Card>

      <Card header="Sound & Voice">
        <div className="space-y-5">
          <Select label="Voice" value={spec.voiceId} onChange={(e) => update('voiceId', e.target.value)} options={VOICE_OPTIONS} />
          <div>
            <label className="label font-mono text-xs uppercase tracking-wider">Click Sound</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CLICK_SOUNDS.map((sound) => (
                <button key={sound.id} type="button" onClick={() => update('clickSound', sound.id)} className={cn('rounded-lg border px-3 py-2.5 text-left transition-all', spec.clickSound === sound.id ? 'border-accent bg-accent/10 text-accent' : 'border-surface-border bg-surface hover:border-[#2a2a2a] text-muted hover:text-[#F0EDE6]')}>
                  <span className="block text-sm font-medium">{sound.label}</span>
                  <span className="block text-xs text-muted mt-0.5">{sound.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label font-mono text-xs uppercase tracking-wider">Output Format</label>
            <div className="flex gap-2">
              {FORMAT_OPTIONS.map((fmt) => (
                <button key={fmt.id} type="button" onClick={() => update('format', fmt.id)} className={cn('rounded-lg border px-5 py-2 font-mono text-sm font-medium transition-all', spec.format === fmt.id ? 'border-accent bg-accent/10 text-accent' : 'border-surface-border text-muted hover:text-[#F0EDE6]')}>
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card header="Options">
        <div className="space-y-4">
          <ToggleRow label="Count-in" description="Audible count before the first section starts" checked={spec.enableCountIn} onChange={(v) => update('enableCountIn', v)} />
          {spec.enableCountIn && (
            <div className="ml-12 animate-fade-in">
              <label className="label font-mono text-xs uppercase tracking-wider">Count-in Bars</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" onClick={() => update('countInBars', n)} className={cn('rounded-lg border w-10 h-10 font-mono text-sm font-medium transition-all', spec.countInBars === n ? 'border-accent bg-accent/10 text-accent' : 'border-surface-border text-muted hover:text-[#F0EDE6]')}>{n}</button>
                ))}
              </div>
            </div>
          )}
          <ToggleRow label="Section Announcements" description="Voice announces each section name before it starts" checked={spec.enableSectionAnnounce} onChange={(v) => update('enableSectionAnnounce', v)} />
          <ToggleRow label="Bar Countdown" description="Countdown numbers before each new section" checked={spec.enableBarCountdown} onChange={(v) => update('enableBarCountdown', v)} />
        </div>
      </Card>

      <div className="flex flex-col items-center gap-3 pt-2">
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} disabled={isSubmitting || isOverDurationLimit} className="w-full sm:w-auto sm:min-w-[240px] glow-accent">
          {isSubmitting ? 'Generating...' : 'Generate Track'}
        </Button>
        {spec.sections.length > 0 && (
          <p className={cn(
            'text-xs font-mono',
            isOverDurationLimit ? 'text-red-400' : isNearDurationLimit ? 'text-yellow-400' : 'text-muted',
          )}>
            {spec.sections.reduce((sum, s) => sum + s.bars, 0)} bars across {spec.sections.length} section{spec.sections.length !== 1 ? 's' : ''} (≈ {formatDuration(estimatedDurationSec)})
          </p>
        )}
        {spec.sections.length > 0 && isOverDurationLimit && (
          <p className="text-xs text-red-400 font-mono text-center">
            Exceeds {formatDuration(MAX_DURATION_SECONDS)} maximum. Reduce bars or sections to generate.
          </p>
        )}
        {spec.sections.length > 0 && isNearDurationLimit && (
          <p className="text-xs text-yellow-400 font-mono text-center">
            Approaching {formatDuration(MAX_DURATION_SECONDS)} maximum.
          </p>
        )}
      </div>

      {showSignupPrompt && (
        <SignupPromptModal
          onSignUp={() => {
            // Persist the in-progress spec? Not in V1: signing in redirects
            // back to /create with the default empty spec. Documented gap.
            window.location.href = '/auth/signin?callbackUrl=/create';
          }}
          onSkip={() => {
            skipSignupPrompt();
            setShowSignupPrompt(false);
            void doGenerate();
          }}
          onClose={() => setShowSignupPrompt(false)}
        />
      )}
    </form>
  );
}

interface SignupPromptModalProps {
  onSignUp: () => void;
  onSkip: () => void;
  onClose: () => void;
}

function SignupPromptModal({ onSignUp, onSkip, onClose }: SignupPromptModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-prompt-title"
    >
      <div
        className="relative mx-4 w-full max-w-md rounded-xl border border-surface-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 text-2xl leading-none text-muted transition-colors hover:text-[#F0EDE6]"
        >
          ×
        </button>
        <div className="p-6 sm:p-7">
          <h3
            id="signup-prompt-title"
            className="font-display text-2xl font-semibold tracking-tight text-[#F0EDE6]"
          >
            Save your tracks?
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Sign up to keep your tracks in your library and unlock a higher
            per-hour generation limit. Free, takes ten seconds.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button type="button" variant="primary" size="md" onClick={onSignUp}>
              Sign up
            </Button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg px-3 py-2 font-mono text-sm text-muted transition-colors hover:text-[#F0EDE6]"
            >
              I&apos;m in a rush, just give me the track
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('relative mt-0.5 inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface', checked ? 'bg-accent' : 'bg-surface-border')}>
        <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200', checked ? 'translate-x-4' : 'translate-x-0')} />
      </button>
      <div>
        <span className="block text-sm font-medium text-[#F0EDE6] group-hover:text-accent transition-colors">{label}</span>
        <span className="block text-xs text-muted">{description}</span>
      </div>
    </label>
  );
}
