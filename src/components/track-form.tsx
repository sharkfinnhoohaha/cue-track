'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { SongSpec, SongSection, TimeSignature } from '@/types';
import { AVAILABLE_VOICES, getVoiceTier } from '@/lib/audio/types';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionList } from '@/components/section-list';
import { cn } from '@/lib/cn';

const PENDING_SPEC_STORAGE_KEY = 'cuetrack:pending-spec';

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
// Studio-tier voices cost $160 per million chars vs $4/M for Standard.
// The dropdown surfaces the tier inline ("(PRO)") so the upsell is visible
// before submit; the generate route returns 402 if an anon caller picks a
// Studio voice. Standard voices stay first in the list so the default
// selection (AVAILABLE_VOICES[0]) is free.
const VOICE_OPTIONS = AVAILABLE_VOICES.map((v) => ({
  value: v.id,
  label: v.tier === 'studio' ? `${v.label} (PRO)` : v.label,
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
  /**
   * Initial spec to render the form with. Used by the review screen at
   * /tracks/[id]/review to pre-populate fields from the /analyze
   * suggestion. When provided, the sessionStorage restore from the
   * signup redirect path is skipped to avoid clobber.
   */
  initialSpec?: SongSpec;
  /**
   * If set, the form submits to /api/tracks/generate with
   * `existingTrackId` in the body, which UPDATEs the draft row created
   * by /api/tracks/analyze instead of INSERTing a fresh track. Pair
   * with `initialSpec` from the review screen.
   */
  existingTrackId?: string;
}

export function TrackForm({
  isAuthenticated,
  initialSpec,
  existingTrackId,
}: TrackFormProps) {
  const router = useRouter();
  const [spec, setSpec] = useState<SongSpec>(initialSpec ?? DEFAULT_SPEC);
  const [isCustomTs, setIsCustomTs] = useState(() => {
    // If the supplied initialSpec uses a non-canonical time signature,
    // default the dropdown to "Custom" so the user sees the editable
    // beats/subdivision controls rather than a stale value.
    if (!initialSpec) return false;
    const match = TIME_SIGNATURES.find(
      (t) =>
        t.ts.beats === initialSpec.timeSignature.beats &&
        t.ts.subdivision === initialSpec.timeSignature.subdivision &&
        t.value !== 'custom',
    );
    return !match;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Tear down the preview audio + object URL on unmount so a render in flight
  // doesn't leak a blob URL or keep playing after navigation.
  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handlePreview = useCallback(async () => {
    // Toggle off if already playing.
    if (previewState === 'playing') {
      previewAudioRef.current?.pause();
      setPreviewState('idle');
      return;
    }
    setPreviewError(null);
    setPreviewState('loading');
    try {
      const res = await fetch('/api/tracks/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.details || b?.error || `Preview failed (${res.status})`);
      }
      const blob = await res.blob();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      let audio = previewAudioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.addEventListener('ended', () => setPreviewState('idle'));
        audio.addEventListener('pause', () =>
          setPreviewState((s) => (s === 'playing' ? 'idle' : s)),
        );
        previewAudioRef.current = audio;
      }
      audio.src = url;
      await audio.play();
      setPreviewState('playing');
    } catch (err) {
      setPreviewState('idle');
      setPreviewError(
        err instanceof Error ? err.message : 'Could not play a preview. Try again.',
      );
    }
  }, [spec, previewState]);

  // Restore any pending spec stashed by the sign-up redirect path. Skipped
  // when initialSpec is supplied (review screen) so the analyzer's
  // suggestion is not clobbered by an unrelated leftover draft.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (initialSpec) {
      // Make sure we clear any stale pending spec from a previous session
      // so it does not surface on a later /create visit.
      try {
        window.sessionStorage.removeItem(PENDING_SPEC_STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }
    try {
      const pending = window.sessionStorage.getItem(PENDING_SPEC_STORAGE_KEY);
      if (pending) {
        const parsed = JSON.parse(pending) as SongSpec;
        // Defensive shape check: must look like a SongSpec. If the stored
        // object is corrupt or from a previous schema, discard and fall
        // through to the default. Worst case the user re-enters the spec.
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.bpm === 'number' &&
          Array.isArray(parsed.sections)
        ) {
          setSpec(parsed);
        }
        window.sessionStorage.removeItem(PENDING_SPEC_STORAGE_KEY);
      }
    } catch {
      // Bad JSON or storage unavailable; drop the pending key if present and
      // continue with the default spec.
      try {
        window.sessionStorage.removeItem(PENDING_SPEC_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, [initialSpec]);

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
      const payload = existingTrackId
        ? { ...spec, existingTrackId }
        : spec;
      const res = await fetch('/api/tracks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
  }, [spec, router, existingTrackId]);

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

    // Manual mode is signup-gated per the V1 funnel. Anonymous users see the
    // modal on manual submits (no existingTrackId); if they have an
    // existingTrackId, they are finalizing an upload draft, which is
    // allowed anonymously.
    if (!isAuthenticated && !existingTrackId) {
      setShowSignupPrompt(true);
      return;
    }

    await doGenerate();
  };

  const currentTsValue = isCustomTs ? 'custom' : `${spec.timeSignature.beats}/${spec.timeSignature.subdivision}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-950/10 px-4 py-3 text-xs font-sans text-red-400 animate-fade-in">{error}</div>
      )}

      <Card header="Track Details">
        <div className="space-y-5">
          <Input label="Title" placeholder="e.g. Sunday Morning Set - Amazing Grace" value={spec.title} onChange={(e) => update('title', e.target.value)} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="label font-mono text-xs uppercase tracking-wider">BPM</label>
              <div className="flex gap-2">
                <input type="number" min={30} max={300} value={spec.bpm} onChange={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val)) update('bpm', val); }} onBlur={(e) => { const val = parseInt(e.target.value, 10); update('bpm', isNaN(val) ? 120 : Math.min(300, Math.max(30, val))); }} className="input font-mono flex-1" />
                <button type="button" onClick={tap} className="btn-secondary shrink-0 font-mono text-xs px-3" title="Tap to set tempo">TAP</button>
              </div>
              <p className="mt-1.5 text-xs text-muted">Tap the button rhythmically to detect tempo</p>
            </div>
            <div>
              <Select label="Time Signature" value={currentTsValue} onChange={(e) => handleTsChange(e.target.value)} options={TIME_SIGNATURES.map((t) => ({ value: t.value, label: t.label }))} />
              {isCustomTs && (
                <div className="mt-2 flex items-center gap-2">
                  <input type="number" min={1} max={12} value={spec.timeSignature.beats} onChange={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val)) update('timeSignature', { ...spec.timeSignature, beats: val }); }} onBlur={(e) => { const val = parseInt(e.target.value, 10); update('timeSignature', { ...spec.timeSignature, beats: isNaN(val) ? 4 : Math.min(12, Math.max(1, val)) }); }} className="input w-16 text-center font-mono" aria-label="Beats per bar" />
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
          <div>
            <Select label="Voice" value={spec.voiceId} onChange={(e) => update('voiceId', e.target.value)} options={VOICE_OPTIONS} />
            {getVoiceTier(spec.voiceId) === 'studio' && !isAuthenticated && (
              <p className="mt-1.5 text-xs text-amber-600 font-mono">
                Studio voices require a Pro subscription. Sign up to use, or pick a Standard voice.
              </p>
            )}
          </div>
          <div>
            <label className="label font-mono text-xs uppercase tracking-wider">Click Sound</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CLICK_SOUNDS.map((sound) => (
                <button key={sound.id} type="button" onClick={() => update('clickSound', sound.id)} className={cn('rounded-xl border px-4 py-3 text-left transition-all duration-200', spec.clickSound === sound.id ? 'border-accent bg-accent/5 text-accent font-semibold' : 'border-surface-border bg-zinc-900/10 hover:border-white/20 text-zinc-400 hover:text-white')}>
                  <span className="block text-xs font-sans font-bold">{sound.label}</span>
                  <span className="block text-[10px] text-zinc-500 mt-0.5 font-normal">{sound.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label font-mono text-xs uppercase tracking-wider">Output Format</label>
            <div className="flex gap-2.5">
              {FORMAT_OPTIONS.map((fmt) => (
                <button key={fmt.id} type="button" onClick={() => update('format', fmt.id)} className={cn('rounded-full border px-5 py-2 font-sans text-xs font-semibold transition-all duration-200', spec.format === fmt.id ? 'border-accent bg-accent/5 text-accent' : 'border-surface-border text-zinc-400 hover:text-white')}>
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
              <div className="flex gap-2.5">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" onClick={() => update('countInBars', n)} className={cn('rounded-full border w-9 h-9 font-sans text-xs font-semibold transition-all duration-200', spec.countInBars === n ? 'border-accent bg-accent/5 text-accent' : 'border-surface-border text-zinc-400 hover:text-white')}>{n}</button>
                ))}
              </div>
            </div>
          )}
          <ToggleRow label="Section Announcements" description="Voice announces each section name before it starts" checked={spec.enableSectionAnnounce} onChange={(v) => update('enableSectionAnnounce', v)} />
          <ToggleRow label="Bar Countdown" description="Countdown numbers before each new section" checked={spec.enableBarCountdown} onChange={(v) => update('enableBarCountdown', v)} />
        </div>
      </Card>

      <div className="flex flex-col items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={previewState === 'loading' || spec.sections.length === 0}
          className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-transparent px-5 py-2 text-xs font-sans font-semibold text-white transition-all duration-200 hover:border-white/30 hover:bg-white/[.04] disabled:opacity-50"
        >
          {previewState === 'loading' ? (
            <>
              <span aria-hidden="true" className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-100 border-t-transparent" />
              Rendering preview…
            </>
          ) : previewState === 'playing' ? (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="3.5" height="10" rx="1" /><rect x="8.5" y="2" width="3.5" height="10" rx="1" /></svg>
              Stop preview
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 2.5v9a.5.5 0 0 0 .76.43l7.5-4.5a.5.5 0 0 0 0-.86l-7.5-4.5A.5.5 0 0 0 3 2.5Z" /></svg>
              Preview the sound
            </>
          )}
        </button>
        {previewError && (
          <p className="text-xs text-red-600 font-mono text-center">{previewError}</p>
        )}
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} disabled={isSubmitting || isOverDurationLimit} className="w-full sm:w-auto sm:min-w-[240px] glow-accent">
          {isSubmitting
            ? 'Building...'
            : existingTrackId
            ? 'Finalize cue track'
            : 'Make my cue track'}
        </Button>
        {spec.sections.length > 0 && (
          <p className={cn(
            'text-xs font-mono',
            isOverDurationLimit ? 'text-red-600' : isNearDurationLimit ? 'text-amber-600' : 'text-muted',
          )}>
            {spec.sections.reduce((sum, s) => sum + s.bars, 0)} bars across {spec.sections.length} section{spec.sections.length !== 1 ? 's' : ''} (≈ {formatDuration(estimatedDurationSec)})
          </p>
        )}
        {spec.sections.length > 0 && isOverDurationLimit && (
          <p className="text-xs text-red-600 font-mono text-center">
            Exceeds {formatDuration(MAX_DURATION_SECONDS)} maximum. Reduce bars or sections to generate.
          </p>
        )}
        {spec.sections.length > 0 && isNearDurationLimit && (
          <p className="text-xs text-amber-600 font-mono text-center">
            Approaching {formatDuration(MAX_DURATION_SECONDS)} maximum.
          </p>
        )}
      </div>

      {showSignupPrompt && (
        <SignupPromptModal
          onSignUp={() => {
            // Stash the in-progress spec so the magic-link flow lands the
            // user back on /create with their form repopulated. Cleared on
            // mount once consumed. Failure to write (private mode, quota)
            // is non-fatal; the redirect proceeds and the user just
            // re-enters the spec on return.
            try {
              window.sessionStorage.setItem(
                PENDING_SPEC_STORAGE_KEY,
                JSON.stringify(spec),
              );
            } catch {
              // ignore
            }
            // Return to manual mode (not the upload-first default) so the
            // restored spec lands on the form the user was filling out.
            window.location.href =
              '/auth/signin?callbackUrl=' +
              encodeURIComponent('/create?mode=manual');
          }}
          onClose={() => setShowSignupPrompt(false)}
        />
      )}
    </form>
  );
}

interface SignupPromptModalProps {
  onSignUp: () => void;
  onClose: () => void;
}

function SignupPromptModal({ onSignUp, onClose }: SignupPromptModalProps) {
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
        className="relative mx-4 w-full max-w-md rounded-2xl border border-surface-border bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-2xl leading-none text-zinc-500 transition-colors hover:text-white"
        >
          ×
        </button>
        <div className="p-6 sm:p-8">
          <h3
            id="signup-prompt-title"
            className="font-sans font-bold tracking-tight text-white text-xl"
          >
            Sign up to use manual mode
          </h3>
          <p className="mt-3 text-sm text-zinc-400 leading-relaxed font-normal">
            Manual mode is free once you create an account, and the cap is
            generous. Takes ten seconds; your spec is saved while you sign in.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <Button type="button" variant="primary" size="md" onClick={onSignUp}>
              Sign up free
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-sans font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Not now
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
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('relative mt-0.5 inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1 focus-visible:ring-offset-black', checked ? 'bg-accent' : 'bg-zinc-800')}>
        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow-none transition-transform duration-200', checked ? 'translate-x-4' : 'translate-x-0')} />
      </button>
      <div>
        <span className="block text-sm font-sans font-semibold text-white group-hover:text-accent transition-colors">{label}</span>
        <span className="block text-xs text-zinc-400 font-normal mt-0.5">{description}</span>
      </div>
    </label>
  );
}
